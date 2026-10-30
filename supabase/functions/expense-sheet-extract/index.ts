import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Read-only: reads a photo/PDF of an accountant expense schedule or a bill and returns
 * rows for the Expense Import review. Writes nothing to the database, stores nothing.
 */
const FIELDS = ["section", "category", "supplier", "invoiceRef", "billDate", "monthly", "quarterly", "annual", "amount", "vatAmount", "type", "notes"] as const;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// Compact output keeps generation fast (the old per-cell object format exceeded the 150s limit on long lists).
// Each field is a string or null. A leading "?" marks an unclear value (the rest is what is visible).
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["rows"],
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [...FIELDS],
        properties: Object.fromEntries(FIELDS.map((f) => [f, { type: ["string", "null"] }])),
      },
    },
  },
};

const PROMPT = `You read photos/PDFs of restaurant expense schedules prepared by an accountant, or individual bills/invoices for overheads.
Return one row per expense line. Fields:
- section: the restaurant/worksheet/heading the line sits under (e.g. "Rudy's"), or null if the page has none.
- category: the category as written (Rent, Utilities, Payroll...).
- supplier: the expense or supplier name as written.
- invoiceRef: invoice/bill/reference number if shown.
- billDate: the bill/invoice date as YYYY-MM-DD only if the full date is printed; otherwise null.
- monthly, quarterly, annual: the amounts in those columns as plain numbers (no currency symbol), null if the column is empty.
- amount: a single total when the page is a bill or only has one amount column.
- vatAmount: VAT amount if printed separately.
- type: Fixed/Variable or similar as written.
- notes: notes/source text as written (e.g. "gross wages plus employer PRSI", "incl VAT").
STRICT RULES:
- Never guess, infer, calculate or convert a value (never derive monthly from annual). Copy only what is legibly written.
- If any character of a value is hard to read, return "?" followed by the characters you can see, or just "?" if nothing is readable.
- If a field is not on the page, return null.
- Skip headings, subtotal and total lines.`;

type Cell = { value: string | null; status: "clear" | "unclear" | "absent"; raw: string | null };
const toCell = (v: unknown): Cell => {
  if (typeof v !== "string" || !v.trim()) return { value: null, status: "absent", raw: null };
  const s = v.trim();
  if (s.startsWith("?")) { const raw = s.slice(1).trim(); return { value: null, status: "unclear", raw: raw || null }; }
  return { value: s, status: "clear", raw: s };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Please sign in." }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error: authErr } = await sb.auth.getClaims(auth.slice(7));
    if (authErr || !claims?.claims?.sub) return json({ error: "Please sign in." }, 401);

    const body = await req.json().catch(() => null);
    const fileBase64 = typeof body?.fileBase64 === "string" ? body.fileBase64 : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName.slice(0, 200) : "expenses";
    if (!fileBase64 || !ALLOWED.includes(mimeType)) return json({ error: "Upload a JPG, PNG, WEBP photo or a PDF." }, 400);
    if (fileBase64.length * 0.75 > MAX_BYTES) return json({ error: "File is larger than 10 MB. Please split or compress it." }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured." }, 500);

    const media = mimeType === "application/pdf"
      ? { type: "input_file", filename: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`, file_data: `data:application/pdf;base64,${fileBase64}` }
      : { type: "input_image", image_url: `data:${mimeType};base64,${fileBase64}` };

    // Diagnosed failure: long lists ran into the platform's 150s wall-clock limit (546).
    // Stop shortly before it so the user gets a clear message instead of a crash.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 140_000);
    req.signal.addEventListener("abort", () => ctrl.abort());
    const tooLong = () => json({ error: "This document took too long to read. Try fewer pages, or one photo per page." }, 504);

    try {
      const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          stream: true,
          store: false,
          reasoning: { effort: "low" },
          instructions: PROMPT,
          input: [{ role: "user", content: [{ type: "input_text", text: "Extract every expense line from this document." }, media] }],
          text: { format: { type: "json_schema", name: "expense_lines", strict: true, schema } },
        }),
      });

      if (!upstream.ok || !upstream.body) {
        const t = await upstream.text().catch(() => "");
        console.error("AI gateway error", upstream.status, t.slice(0, 500));
        const msg = upstream.status === 429 ? "Too many requests. Please try again in a moment."
          : upstream.status === 402 ? "AI credits are used up. Please add credits to continue."
          : "The document could not be read right now.";
        const status = [400, 402, 403, 429].includes(upstream.status) ? upstream.status : 502;
        return json({ error: msg }, status);
      }

      // Consume SSE server-side; parse only the events we use.
      const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "", text = "", failed: string | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          if (!chunk.includes("output_text.delta") && !chunk.includes("failed") && !chunk.includes("error") && !chunk.includes("refusal")) continue;
          const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
          if (!data || data === "[DONE]") continue;
          try {
            const ev = JSON.parse(data);
            if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
            else if (ev.type === "response.failed" || ev.type === "error")
              failed = ev.response?.error?.message ?? ev.error?.message ?? ev.message ?? "AI reading failed.";
            else if (ev.type === "response.refusal.delta") failed = "The AI declined to read this document.";
          } catch { /* ignore partial */ }
        }
      }
      if (failed) return json({ error: failed }, 502);
      if (!text.trim()) return json({ error: "No rows could be read from this document." }, 422);
      let parsed: { rows?: unknown[] };
      try { parsed = JSON.parse(text); } catch { return json({ error: "The AI response was incomplete. Please try again." }, 502); }
      const rows = (Array.isArray(parsed.rows) ? parsed.rows : []).map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        return Object.fromEntries(FIELDS.map((f) => [f, toCell(o[f])]));
      });
      return json({ rows });
    } catch (e) {
      if (req.signal.aborted) return new Response(null, { status: 499, headers: corsHeaders });
      if (ctrl.signal.aborted) return tooLong();
      throw e;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499, headers: corsHeaders });
    console.error("expense-sheet-extract error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
