import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Read-only: reads a photo/PDF of a supplier stock list and returns rows for the
 * existing Stock List Importer review. Writes nothing to the database, stores nothing.
 */
const FIELDS = ["supplier", "itemName", "productCode", "packSize", "packUnit", "packCost", "purchaseUnit", "notes"] as const;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const cell = {
  type: "object",
  additionalProperties: false,
  required: ["value", "status", "raw"],
  properties: {
    value: { type: ["string", "null"], description: "Exactly what is written, normalised only for spacing. null when absent or unclear." },
    status: { type: "string", enum: ["clear", "unclear", "absent"] },
    raw: { type: ["string", "null"], description: "The characters you can actually see, even partially. null if nothing written." },
  },
};

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
        properties: Object.fromEntries(FIELDS.map((f) => [f, cell])),
      },
    },
  },
};

const PROMPT = `You read photos/PDFs of restaurant supplier stock lists, price lists or order sheets (printed or handwritten).
Return one row per product line. For each field:
- supplier: supplier name for that line (use a heading/letterhead supplier if the whole page is one supplier).
- itemName: product description exactly as written.
- productCode: supplier code/SKU/article number if shown.
- packSize: numeric pack size only (e.g. "5" for 5kg, "12" for 12 x each).
- packUnit: one of each, g, kg, ml, L as written (e.g. "kg"). For counts like "x12" use "each".
- packCost: price for that pack as a plain number, no currency symbol.
- purchaseUnit: how it is bought if stated (case, kg, each...).
- notes: anything else on the line worth keeping (brand, grade). Never put stock counts here.
STRICT RULES:
- Never guess, infer, calculate or complete a value. Copy only what is legibly written.
- If any character of a value is hard to read, set status "unclear", value null, and put what you can see in raw.
- If a field is not on the page, status "absent", value null, raw null.
- Ignore stock-on-hand / quantity-counted / par-level columns entirely.
- Skip headings, totals and blank lines.`;

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
    const fileName = typeof body?.fileName === "string" ? body.fileName.slice(0, 200) : "stock-list";
    if (!fileBase64 || !ALLOWED.includes(mimeType)) return json({ error: "Upload a JPG, PNG, WEBP photo or a PDF." }, 400);
    if (fileBase64.length * 0.75 > MAX_BYTES) return json({ error: "File is larger than 10 MB. Please split or compress it." }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured." }, 500);

    const media = mimeType === "application/pdf"
      ? { type: "input_file", filename: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`, file_data: `data:application/pdf;base64,${fileBase64}` }
      : { type: "input_image", image_url: `data:${mimeType};base64,${fileBase64}` };

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "medium", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        instructions: PROMPT,
        input: [{ role: "user", content: [{ type: "input_text", text: "Extract every product line from this stock list." }, media] }],
        text: { format: { type: "json_schema", name: "stock_list", strict: true, schema } },
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => "");
      console.error("AI gateway error", upstream.status, t);
      let msg = "The document could not be read right now.";
      try { msg = JSON.parse(t)?.error?.message ?? JSON.parse(t)?.message ?? msg; } catch { /* keep default */ }
      const status = [400, 402, 403, 429].includes(upstream.status) ? upstream.status : 502;
      return json({ error: msg }, status);
    }

    // Consume SSE server-side and return final JSON.
    const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "", text = "", failed: string | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
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
    let parsed: { rows: unknown[] };
    try { parsed = JSON.parse(text); } catch { return json({ error: "The AI response was incomplete. Please try again." }, 502); }
    return json({ rows: Array.isArray(parsed.rows) ? parsed.rows : [] });
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499, headers: corsHeaders });
    console.error("stock-list-extract error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
