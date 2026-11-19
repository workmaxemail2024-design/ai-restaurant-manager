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
  const signature = "ca91c00f9ed046912127d480371d5b7c7d088b42c0ff2bee1d95d542fc239ff4";
  const stageSignature = "8a1604e0a44252ede5d345d4e615bc2bd8daf171fff15bfd82ef4618f448c7b7";
  assertEqual(await validSignature(key, timestamp, requestId, "preview", payload, signature), true);
  assertEqual(await validSignature(key, timestamp, requestId, "preview", payload + " ", signature), false);
  assertEqual(await validSignature(key, timestamp, requestId, "preview", payload, "0".repeat(64)), false);
  assertEqual(await validSignature("too short", timestamp, requestId, "preview", payload, signature), false);
  assertEqual(await validSignature(key, timestamp, requestId, "stage", payload, signature), false);
  assertEqual(await validSignature(key, timestamp, requestId, "stage", payload, stageSignature), true);
});

Deno.test("Canonical key ordering follows Python Unicode ordinal sort, not locale collation", async () => {
  const tricky = {"a_1":2, "aa":4, "a1":3, "a-1":1};
  const encoded = JSON.stringify(stable(tricky));
  assertEqual(encoded, '{"a-1":1,"a1":3,"a_1":2,"aa":4}');
  const digest = await sha256Hex(new TextEncoder().encode(encoded));
  assertEqual(digest, "3b2f6008a45873257a5bbd5f64bc339146bedbaa0f50c7f34f0cef46cf8fc55a");
});
