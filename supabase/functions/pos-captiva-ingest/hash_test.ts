import { stable, sha256Hex, validSignature } from "./hash.ts";

function assertEqual(a: unknown, b: unknown): void {
  if (a !== b) throw new Error("Expected " + JSON.stringify(b) + ", got " + JSON.stringify(a));
}

Deno.test("Captiva full-evidence fingerprint matches Python reference", async () => {
  const sample = {
    snapshot: {
      store_id: "01584",
      trading_date: "2026-09-01",
      journal_filename: "jnl_test.xml",
      journal_coverage: "complete",
      official_gross: "25.50",
      official_net: "23.00",
      official_vat: "2.50",
      official_orders: 1,
      journal_standard_payments: "25.50",
      journal_refund_payments: "0.00",
      journal_other_payments: "0.00",
      journal_payment_records: 1,
    },
    events: [{
      event_code: "REFUND",
      event_type: "refund",
      source_event_key: "c".repeat(64),
      original_amount: "10.00",
      source_operator: "Monica",
      source_date_text: "01 Sep 2026",
      source_time_text: "21:15",
      removed_item_count: null,
    }],
    products: [{
      product_id: "123",
      product_type: "combo",
      description: "Crème brûlée",
      quantity: "1",
      raw_value_not_revenue: "25.50",
      lines: 1,
    }],
  };
  const hash = await sha256Hex(new TextEncoder().encode(JSON.stringify(stable(sample))));
  assertEqual(hash, "20fee4f2fa17164fee8a0c46cfe5cca76738a30803ba949ef429a82494bb1eab");
});

Deno.test("HMAC signature matches Python and rejects tampering", async () => {
  const key = "a".repeat(64);
  const timestamp = "1700000000";
  const requestId = "550e8400-e29b-41d4-a716-446655440000";
  const payload = '{"example":true}';
  const signature = "d687ac2899c8f0f653b9077959dbbcb7ede92ddbc69ae32c2070958da50da7aa";
  assertEqual(await validSignature(key, timestamp, requestId, payload, signature), true);
  assertEqual(await validSignature(key, timestamp, requestId, payload + " ", signature), false);
  assertEqual(await validSignature(key, timestamp, requestId, payload, "0".repeat(64)), false);
  assertEqual(await validSignature("too short", timestamp, requestId, payload, signature), false);
});
