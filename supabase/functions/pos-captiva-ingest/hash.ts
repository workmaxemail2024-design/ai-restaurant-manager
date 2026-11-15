/** Signed Captiva transfer primitives, separate for offline regression tests. */
const utf8 = new TextEncoder();
const hex64 = /^[0-9a-f]{64}$/;

function hexToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Matches Python json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=False). */
export function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

export async function validSignature(
  secret: string,
  timestamp: string,
  requestId: string,
  mode: "preview" | "stage",
  raw: string,
  signature: string,
): Promise<boolean> {
  if (secret.length < 48 || !hex64.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw", utf8.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const message = utf8.encode(timestamp + "." + requestId + "." + mode + "." + raw);
  return crypto.subtle.verify(
    "HMAC", key, hexToBytes(signature) as BufferSource, message as BufferSource,
  );
}
