import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Read-only: reads a photo/PDF of a supplier stock list and returns rows for the
 * existing Stock List Importer review. Writes nothing to the database, stores nothing.
 */
const FIELDS = ["supplier", "itemName", "productCode", "packSize", "packUnit", "packCost", "purchaseUnit", "notes"] as const;
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

const PROMPT = `You read photos/PDFs of restaurant supplier stock lists, price lists or order sheets (printed or handwritten).
Return one row per product line. Fields:
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
- If any character of a value is hard to read, return "?" followed by the characters you can see (e.g. "?1_.50"), or just "?" if nothing is readable.
- If a field is not on the page, return null.
- Ignore stock-on-hand / quantity-counted / par-level columns entirely.
- Skip headings, totals and blank lines.`;

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
    const fileName = typeof body?.fileName === "string" ? body.fileName.slice(0, 200) : "stock-list";
    if (!fileBase64 || !ALLOWED.includes(mimeType)) return json({ error: "Upload a JPG, PNG, WEBP photo or a PDF." }, 400);
    if (fileBase64.length * 0.75 > MAX_BYTES) return json({ error: "File is larger than 10 MB. Please split or compress it." }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured." }, 500);

    const dataUrl = `data:${mimeType};base64,${fileBase64}`;

    // Stop before the platform's 150s wall-clock limit so the user gets a clear message instead of a crash.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 135_000);
    req.signal.addEventListener("abort", () => ctrl.abort());

    let upstream: Response;
    try {
      upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: PROMPT },
            { role: "user", content: [
              { type: "text", text: `Extract every product line from this stock list (${fileName}).` },
              { type: "image_url", image_url: { url: dataUrl } },
            ] },
          ],
          tools: [{ type: "function", function: { name: "stock_list", description: "Return the product lines", parameters: schema } }],
          tool_choice: { type: "function", function: { name: "stock_list" } },
        }),
      });
    } catch (e) {
      clearTimeout(timer);
      if (req.signal.aborted) return new Response(null, { status: 499, headers: corsHeaders });
      if (ctrl.signal.aborted) return json({ error: "This document took too long to read. Try fewer pages or one photo per page." }, 504);
      throw e;
    }

    if (!upstream.ok) {
      clearTimeout(timer);
      const t = await upstream.text().catch(() => "");
      console.error("AI gateway error", upstream.status, t.slice(0, 500));
      const msg = upstream.status === 429 ? "Too many requests. Please try again in a moment."
        : upstream.status === 402 ? "AI credits are used up. Please add credits to continue."
        : "The document could not be read right now.";
      const status = [400, 402, 403, 429].includes(upstream.status) ? upstream.status : 502;
      return json({ error: msg }, status);
    }

    let data: any;
    try { data = await upstream.json(); }
    catch { clearTimeout(timer); return json({ error: "This document took too long to read. Try fewer pages or one photo per page." }, 504); }
    clearTimeout(timer);

    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return json({ error: "No rows could be read from this document." }, 422);
    let parsed: { rows?: unknown[] };
    try { parsed = JSON.parse(args); } catch { return json({ error: "The AI response was incomplete. Please try again." }, 502); }
    const rows = (Array.isArray(parsed.rows) ? parsed.rows : []).map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return Object.fromEntries(FIELDS.map((f) => [f, toCell(o[f])]));
    });
    return json({ rows });
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499, headers: corsHeaders });
    console.error("stock-list-extract error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
