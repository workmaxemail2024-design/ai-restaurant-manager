/**
 * Captiva Cloud Journals API v1.2 — read-only journal decoder / normalizer.
 *
 * IMPORTANT: This intentionally does not write to the POS ledger, auto-create
 * dishes, or expose raw journal XML in logs. Do not use journal line totals as
 * additional revenue when a matching XLS day has already been imported.
 */
import { XMLParser } from "npm:fast-xml-parser@4.5.3";

export interface CaptivaJournalLine {
  receipt_id: string;
  line_index: number;
  product_id: string;
  name: string;
  quantity: number;
  gross_cents: number;  // sellprice is a LINE total, not necessarily a unit price.
  is_combo: boolean;
  nested_options: Array<{ product_id: string; name: string; quantity: number; price_cents: number }>;
}

export interface CaptivaJournalPreview {
  store_id: string;
  trading_date: string; // YYYY-MM-DD
  receipts: number;
  lines: CaptivaJournalLine[];
  main_line_count: number;
  main_line_quantity: number;
  nested_modifier_count: number;
  gross_cents: number;
  vat_cents: number;
  net_cents: number;
  gross_by_vat_rate_cents: Record<string, number>;
  cover_count_from_journal: number;
  // Product IDs can be reused for different labels in Captiva. Never silently
  // merge these IDs into one dish or automatically create ambiguous dishes.
  ambiguous_product_ids: Array<{ product_id: string; names: string[] }>;
}

type XmlRecord = Record<string, unknown>;

function obj(value: unknown): XmlRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as XmlRecord : {};
}

function arr(value: unknown): unknown[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

function asInt(value: unknown): number {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : 0;
}

/** Currency string to integer cents, exact for two-decimal gross prices. */
function cents(value: unknown): number {
  const raw = str(value).trim();
  if (!/^-?\d+(?:\.\d{1,4})?$/.test(raw)) throw Error("Invalid Captiva currency amount");
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > 1e10) throw Error("Captiva currency amount out of range");
  return Math.round((n + Number.EPSILON) * 100);
}

function tradingDate(value: unknown): string {
  const raw = str(value);
  const match = raw.match(/^(\d{1,2})[\/\s-]([A-Za-z]{3})[\/\s-](\d{4})$/);
  if (!match) throw Error("Captiva journal contains an invalid trading date");
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const monthIndex = months.indexOf(match[2].toLowerCase());
  if (monthIndex < 0) throw Error("Invalid Captiva journal month");
  const day = Number(match[1]), year = Number(match[3]);
  const iso = `${year}-${String(monthIndex + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const normalized = new Date(`${iso}T00:00:00.000Z`);
  if (normalized.toISOString().slice(0, 10) !== iso) throw Error("Invalid calendar date in journal");
  return iso;
}

function decodeBase64Utf8(base64: unknown): string {
  const encoded = str(base64);
  if (!encoded || encoded.length > 16_000_000 || !/^[a-zA-Z0-9+/=\r\n]+$/.test(encoded)) {
    throw Error("Journal unavailable or exceeds size limit");
  }
  const bytes = Uint8Array.from(atob(encoded.replace(/\s+/g,"")), c => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Accepts the actual get_api_store_journal JSON response; never logs journaldata. */
export function parseCaptivaJournalResponse(
  apiResponse: unknown,
  expectedStoreId: string,
  expectedDate: string,
): CaptivaJournalPreview {
  const response = obj(apiResponse);
  if (str(response.result).toLowerCase() !== "success") {
    throw Error(`Captiva journal request rejected (${str(response.resultcode) || "unknown"})`);
  }
  const stores = arr(response.stores).map(obj);
  const store = stores.find(s => str(s.storeid) === expectedStoreId);
  if (!store) throw Error("Requested store missing from Captiva journal response");
  if (store.journalready !== true || !store.journaldata) {
    throw Error("Captiva has not supplied a completed journal for this store/date");
  }
  const xml = decodeBase64Utf8(store.journaldata);
  return parseCaptivaJournalXml(xml, expectedStoreId, expectedDate);
}

/** Only extracts sales fields; excludes customer, staff, payment-card and contact data. */
export function parseCaptivaJournalXml(
  xml: string,
  storeId: string,
  expectedDate: string,
): CaptivaJournalPreview {
  if (!/^\d{5}$/.test(storeId)) throw Error("Invalid store ID");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) throw Error("Invalid expected date");
  if (xml.length > 12_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw Error("Unsupported or oversized XML journal");
  }
  const doc = obj(new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
    processEntities: true,
  }).parse(xml));

  const report = obj(doc.report);
  if (!report.orders) throw Error("Journal contains no orders collection");
  const orderList = arr(obj(report.orders).order).map(obj);
  const lines: CaptivaJournalLine[] = [];
  const byPlu = new Map<string, Set<string>>();
  const grossByRate: Record<string, number> = {};
  let vat4DecimalSum = 0, net4DecimalSum = 0, grossVatSumCents = 0, coverCount = 0;
  const seenReceipts = new Set<string>();

  for (const order of orderList) {
    const header = obj(order.header);
    const foundDate = tradingDate(header.saledate);
    if (foundDate !== expectedDate) throw Error("Journal order date does not match requested trading day");
    const receiptId = str(header.v5fileid || header.event || header.ordnum);
    if (!receiptId || seenReceipts.has(receiptId)) throw Error("Journal receipt ID missing or duplicated");
    seenReceipts.add(receiptId);

    const covers = asInt(obj(order.finedining).covers);
    if (covers > 0) coverCount += covers;

    const products = arr(obj(order.products).product).map(obj);
    for (let index = 0; index < products.length; index++) {
      const item = products[index];
      const plu = str(item.prodid).trim();
      const name = str(item.description).trim();
      const qty = Number(item.qty);
      if (!plu || !name || !Number.isFinite(qty) || qty === 0) {
        throw Error("Journal contains an item without a valid ID, name or quantity");
      }
      const nested = arr(obj(item.contents).product).map(obj).map(n => ({
        product_id: str(n.prodid),
        name: str(n.description),
        quantity: Number(n.qty) || 0,
        price_cents: cents(n.price ?? 0),
      }));
      lines.push({
        receipt_id: receiptId,
        line_index: index,
        product_id: plu,
        name,
        quantity: qty,
        gross_cents: cents(item.sellprice ?? 0),
        is_combo: str(item.type).toLowerCase() === "combo",
        nested_options: nested,
      });
      if (!byPlu.has(plu)) byPlu.set(plu, new Set());
      byPlu.get(plu)!.add(name);
    }

    for (const rate of arr(obj(order.vatdata).vatrate).map(obj)) {
      const gross = cents(rate.gross ?? 0);
      grossVatSumCents += gross;
      const rateName = str(rate.rate);
      grossByRate[rateName] = (grossByRate[rateName] ?? 0) + gross;
      vat4DecimalSum += Number(rate.value ?? 0);
      net4DecimalSum += Number(rate.net ?? 0);
    }
  }

  const grossCents = lines.reduce((sum, line) => sum + line.gross_cents, 0);
  if (grossCents !== grossVatSumCents) {
    throw Error(`Captiva journal reconciliation failed: products ${grossCents}, VAT records ${grossVatSumCents}`);
  }

  return {
    store_id: storeId,
    trading_date: expectedDate,
    receipts: seenReceipts.size,
    lines,
    main_line_count: lines.length,
    main_line_quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    nested_modifier_count: lines.reduce((sum, line) => sum + line.nested_options.length, 0),
    gross_cents: grossCents,
    vat_cents: Math.round(vat4DecimalSum * 100),
    net_cents: Math.round(net4DecimalSum * 100),
    gross_by_vat_rate_cents: grossByRate,
    cover_count_from_journal: coverCount,
    ambiguous_product_ids: [...byPlu.entries()]
      .filter(([, names]) => names.size > 1)
      .map(([product_id, names]) => ({ product_id, names: [...names].sort() })),
  };
}
