import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseCaptivaJournalXml, parseCaptivaJournalResponse } from "./captivaJournal.ts";

// Synthetic journal only. Never check in real customer, payment, or POS journal data.
const xml = `<?xml version="1.0" encoding="utf-8"?>
<report><orders>
  <order>
    <header saledate="01/Sep/2026" v5fileid="sample-receipt-1"/>
    <finedining covers="2"/>
    <products>
      <product prodid="123" description="Example Pasta" qty="2" sellprice="30.00" type="combo">
        <contents><product prodid="456" description="No Sauce" qty="1" price="0.00"/></contents>
      </product>
      <product prodid="789" description="Water" qty="1" sellprice="0.00"/>
    </products>
    <vatdata><vatrate rate="9" gross="30.00" net="27.5229" value="2.4771"/></vatdata>
  </order>
  <order>
    <header saledate="01/Sep/2026" v5fileid="sample-receipt-2"/>
    <finedining covers="1"/>
    <products><product prodid="789" description="Different Label Same PLU" qty="1" sellprice="10.00"/></products>
    <vatdata><vatrate rate="23" gross="10.00" net="8.1301" value="1.8699"/></vatdata>
  </order>
</orders></report>`;

Deno.test("journal parser reconciles sale lines, VAT and modifiers", () => {
  const parsed = parseCaptivaJournalXml(xml, "01584", "2026-09-01");
  assertEquals(parsed.receipts, 2);
  assertEquals(parsed.main_line_count, 3);
  assertEquals(parsed.main_line_quantity, 4);
  assertEquals(parsed.nested_modifier_count, 1);
  assertEquals(parsed.gross_cents, 4000);
  assertEquals(parsed.net_cents, 3565);
  assertEquals(parsed.vat_cents, 435);
  assertEquals(parsed.cover_count_from_journal, 3);
  assertEquals(parsed.gross_by_vat_rate_cents, { "9": 3000, "23": 1000 });
  assertEquals(parsed.ambiguous_product_ids, [{
    product_id: "789", names: ["Different Label Same PLU", "Water"],
  }]);
});

Deno.test("journal parser rejects mismatched date or amount", () => {
  assertThrows(() => parseCaptivaJournalXml(xml, "01584", "2026-09-02"));
  assertThrows(() => parseCaptivaJournalXml(xml.replace('gross="30.00"', 'gross="29.00"'), "01584", "2026-09-01"));
});

Deno.test("API wrapper requires requested store and completed journal", () => {
  const encoded = btoa(xml);
  const payload = {
    result: "success",
    stores: [{ storeid: "01584", journalready: true, journaldata: encoded }],
  };
  assertEquals(parseCaptivaJournalResponse(payload, "01584", "2026-09-01").gross_cents, 4000);
  assertThrows(() => parseCaptivaJournalResponse(payload, "02137", "2026-09-01"));
  assertThrows(() => parseCaptivaJournalResponse({ ...payload, result: "Error" }, "01584", "2026-09-01"));
});
