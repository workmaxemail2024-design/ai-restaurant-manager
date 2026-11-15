import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

// Oracle -> Supabase staging only. No Captiva customer/card payload accepted.
// This endpoint requires an HMAC key distinct from the Supabase service role.
// verify_jwt=false in config.toml is safe ONLY because HMAC is enforced first.
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const hex64 = /^[0-9a-f]{64}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const storeId = /^[0-9]{5}$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const utf8 = new TextEncoder();

const response = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

function hexToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// Matches staging.py's json.dumps(sort_keys=True,separators=(",",":")).
// Snapshot consists only of JSON strings, booleans, null and integer counts.
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return bytesToHex(new Uint8Array(d));
}

async function validSignature(
  secret: string,
  timestamp: string,
  requestId: string,
  raw: string,
  signature: string,
): Promise<boolean> {
  if (secret.length < 48 || !hex64.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw", utf8.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const message = utf8.encode(timestamp + "." + requestId + "." + raw);
  return crypto.subtle.verify("HMAC", key,
    hexToBytes(signature) as BufferSource, message as BufferSource);
}

function validBody(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  const s = obj.snapshot as Record<string, unknown> | null;
  if (obj.version !== 1 || obj.safe_to_stage !== true || obj.reconciled !== false
    || !s || Array.isArray(s) || !Array.isArray(obj.events)
    || !Array.isArray(obj.products)
    || obj.events.length > 2000 || obj.products.length > 2000
    || !Array.isArray(obj.issues) || obj.issues.length !== 0
    || typeof obj.source_fingerprint !== "string"
    || !hex64.test(obj.source_fingerprint)
    || typeof s.store_id !== "string" || !storeId.test(s.store_id)
    || typeof s.trading_date !== "string" || !dateRe.test(s.trading_date)
    || !Number.isFinite(Date.parse(s.trading_date + "T00:00:00Z"))
    || !["complete", "dashboard_only"].includes(String(s.journal_coverage))) {
    return false;
  }
  if (s.journal_coverage === "dashboard_only") {
    if (obj.events.length !== 0 || obj.products.length !== 0
      || s.journal_filename !== null) return false;
  } else if (typeof s.journal_filename !== "string"
             || !/^[A-Za-z0-9_.-]{8,255}[.]xml$/.test(s.journal_filename)) {
    return false;
  }
  const money = ["official_gross", "official_net", "official_vat"];
  if (money.some((k) => typeof s[k] !== "string"
      || !/^\d{1,12}[.]\d{2}$/.test(s[k] as string))) return false;
  if (!Number.isInteger(s.official_orders) || (s.official_orders as number) < 0) return false;
  // Strict allowlist prevents any raw XML/card/customer keys from reaching RPC.
  const eventFields = new Set([
    "source_event_key","event_code","event_type","original_amount",
    "removed_item_count","source_operator","source_date_text","source_time_text",
  ]);
  const productFields = new Set([
    "product_id","product_type","description","quantity",
    "raw_value_not_revenue","lines",
  ]);
  if (obj.events.some((x) => !x || typeof x !== "object" || Array.isArray(x)
      || Object.keys(x).some((k) => !eventFields.has(k)))) return false;
  if (obj.products.some((x) => !x || typeof x !== "object" || Array.isArray(x)
      || Object.keys(x).some((k) => !productFields.has(k)))) return false;
  return true;
}

serve(async (req) => {
  if (req.method !== "POST") return response({ success: false, error: "POST only" }, 405);
  try {
    const secret = Deno.env.get("CAPTIVA_INGEST_HMAC_KEY") ?? "";
    if (secret.length < 48) return response({ success: false, error: "Ingest not configured" }, 503);

    const timestamp = req.headers.get("x-captiva-timestamp") ?? "";
    const requestId = req.headers.get("x-captiva-request-id") ?? "";
    const signature = req.headers.get("x-captiva-signature") ?? "";
    const now = Math.floor(Date.now() / 1000);
    if (!/^[0-9]{10}$/.test(timestamp) || !uuid.test(requestId)
      || Math.abs(now - Number(timestamp)) > 300) {
      return response({ success: false, error: "Invalid or expired signed request" }, 401);
    }
    const len = Number(req.headers.get("content-length") ?? "0");
    if (len > 1024 * 1024) return response({ success: false, error: "Payload too large" }, 413);
    const raw = await req.text();
    if (utf8.encode(raw).length > 1024 * 1024) {
      return response({ success: false, error: "Payload too large" }, 413);
    }
    if (!await validSignature(secret, timestamp, requestId, raw, signature)) {
      return response({ success: false, error: "Invalid signature" }, 401);
    }

    let doc: unknown;
    try { doc = JSON.parse(raw); } catch {
      return response({ success: false, error: "Invalid JSON payload" }, 400);
    }
    if (!validBody(doc)) return response({ success: false, error: "Invalid staging payload" }, 422);
    const envelope = doc as Record<string, unknown>;
    const snapshot = envelope.snapshot as Record<string, unknown>;
    // Fingerprint covers full sanitised source evidence. Updated product or
    // event observations must not silently reuse the prior source version.
    const encoded = JSON.stringify(stable({ snapshot, events: envelope.events, products: envelope.products }));
    const computed = await sha256Hex(utf8.encode(encoded));
    if (computed !== envelope.source_fingerprint) {
      return response({ success: false, error: "Dashboard snapshot hash mismatch" }, 422);
    }

    // Signed preview never touches the database. The production stage gate
    // defaults to disabled and must be enabled separately after reconciliation.
    if (req.headers.get("x-captiva-mode") !== "stage") {
      return response({
        success: true,
        status: "validated_no_database_writes",
        store_id: snapshot.store_id,
        trading_date: snapshot.trading_date,
        journal_coverage: snapshot.journal_coverage,
        exception_events: (envelope.events as unknown[]).length,
        product_observations: (envelope.products as unknown[]).length,
        revenue_changed: false,
      });
    }
    if (Deno.env.get("CAPTIVA_INGEST_ENABLED") !== "true") {
      return response({ success: false, error: "Staging disabled pending approval" }, 423);
    }
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) return response({ success: false, error: "Database not configured" }, 503);
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const payloadHash = await sha256Hex(utf8.encode(raw));
    const { data, error } = await admin.rpc("pos_stage_captiva_envelope", {
      p_store_id: snapshot.store_id,
      p_trade_date: snapshot.trading_date,
      p_source_fingerprint: envelope.source_fingerprint,
      p_snapshot: snapshot,
      p_events: envelope.events,
      p_products: envelope.products,
      p_request_id: requestId,
      p_payload_hash: payloadHash,
    });
    if (error) {
      // Never log the raw payload, credentials, customer or card fields.
      console.error("Captiva staged RPC error code:", error.code);
      return response({ success: false, error: "Staging rejected; verify store binding and source checks" }, 409);
    }
    return response({ success: true, result: data });
  } catch (error) {
    console.error("Captiva ingest failed:", error instanceof Error ? error.name : "unknown");
    return response({ success: false, error: "Internal staging error" }, 500);
  }
});
