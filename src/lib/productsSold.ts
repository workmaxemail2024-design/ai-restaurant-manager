import { dedupePosSales, isPosSource } from "./revenueTruth";
import { resolveProductClass, type ProductClass } from "./productClassification";

export interface ProductSnapshot {
  id: string; restaurant_id: string; location_id: string; trading_date: string;
  observed_at: string; journal_coverage: string;
}
export interface ProductObservation {
  id: string; source_id: string; restaurant_id: string; location_id: string;
  trading_date: string; product_id: string; description: string | null;
  product_type: string; quantity: number | null;
}
export interface PostedProduct {
  id: string; location_id: string; sale_date: string; source: string;
  dish_id: string; quantity: number | null; name: string;
  productId?: string | null; department?: string | null;
}
export interface CatalogueProduct {
  location_id: string | null; external_item_id: string; manual_type: string | null;
  manual_drink_type: string | null; department: string | null;
}
export type SourceChannel = "Dine-in" | "Takeaway" | "Collection" | "Delivery" | "Unknown";
/** Only explicit source fields qualify; absence is never evidence of dine-in. */
export function explicitSourceChannel(value?: string | null): SourceChannel {
  const v = value?.trim().toLowerCase().replace(/[_-]/g, " ");
  if (v === "dine in" || v === "eat in") return "Dine-in";
  if (v === "takeaway" || v === "take away") return "Takeaway";
  if (v === "collection" || v === "pickup" || v === "pick up") return "Collection";
  if (v === "delivery") return "Delivery";
  return "Unknown";
}
export interface SoldProduct {
  key: string; locationId: string; productId: string; name: string;
  quantity: number | null; source: "Posted" | "Provisional journal";
  classification: ProductClass; rankable: boolean; channel: SourceChannel; observationType?: string;
}
export function currentProductSnapshots(rows: ProductSnapshot[]): ProductSnapshot[] {
  const chosen = new Map<string, ProductSnapshot>();
  for (const row of rows) {
    const key = `${row.restaurant_id}|${row.location_id}|${row.trading_date}`;
    const previous = chosen.get(key);
    if (!previous || row.observed_at > previous.observed_at ||
      (row.observed_at === previous.observed_at && row.id > previous.id)) chosen.set(key, row);
  }
  return [...chosen.values()];
}
export function buildProductsSold(input: {
  restaurantId: string; locationIds: string[]; start: string; end: string;
  snapshots: ProductSnapshot[]; observations: ProductObservation[];
  posted: PostedProduct[]; catalogue: CatalogueProduct[];
}) {
  const scope = new Set(input.locationIds);
  const inScope = (loc: string, date: string) => scope.has(loc) && date >= input.start && date <= input.end;
  const snapshots = currentProductSnapshots(input.snapshots.filter(s =>
    s.restaurant_id === input.restaurantId && inScope(s.location_id, s.trading_date)));
  const sourceIds = new Set(snapshots.map(s => s.id));
  const posted = dedupePosSales(input.posted.filter(p => inScope(p.location_id, p.sale_date)));
  const postedDays = new Set(posted.filter(p => isPosSource(p.source)).map(p => `${p.location_id}|${p.sale_date}`));
  const observations = input.observations.filter(o => o.restaurant_id === input.restaurantId &&
    inScope(o.location_id, o.trading_date) && sourceIds.has(o.source_id) &&
    !postedDays.has(`${o.location_id}|${o.trading_date}`));
  const products = new Map<string, SoldProduct>();
  function add(loc: string, id: string, name: string, qty: number | null, source: SoldProduct["source"], type?: string, department?: string | null) {
    const canonical = input.catalogue.find(c => c.location_id === loc && c.external_item_id === id);
    const classification = resolveProductClass({ name, department: canonical?.department ?? department,
      manualType: canonical?.manual_type, manualDrinkType: canonical?.manual_drink_type }).productClass;
    const excluded = /void|refund|modifier/i.test(type ?? "") || classification === "modifier" || classification === "side";
    // A journal can represent the same ID as different record types. Never merge those representations.
    const key = `${loc}|${id}|${source}|${type ?? "sale"}`;
    const previous = products.get(key);
    products.set(key, { key, locationId: loc, productId: id, name, source, classification,
      rankable: !excluded && (classification === "food" || (!canonical?.manual_type && classification === "other" && (type === "combo" || type === "cookbook"))) && qty != null && qty > 0 && (previous?.rankable ?? true),
      observationType: type, channel: "Unknown", quantity: previous ? previous.quantity == null || qty == null ? null : previous.quantity + qty : qty });
  }
  for (const p of posted) add(p.location_id, p.productId ?? p.dish_id, p.name, p.quantity, "Posted", undefined, p.department);
  for (const o of observations) add(o.location_id, o.product_id, o.description ?? o.product_id, o.quantity, "Provisional journal", o.product_type);
  return { products: [...products.values()], snapshots, observationDays: new Set(observations.map(o => `${o.location_id}|${o.trading_date}`)).size,
    postedDays: new Set(posted.map(p => `${p.location_id}|${p.sale_date}`)).size,
    suppressedDays: snapshots.filter(s => postedDays.has(`${s.location_id}|${s.trading_date}`)).length };
}
export async function readAllProductPages<T>(readPage: (offset: number, size: number) => Promise<{ data: T[] | null; error: { message: string } | null }>, size = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += size) {
    const { data, error } = await readPage(offset, size);
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Product read returned no result");
    rows.push(...data);
    if (data.length < size) return rows;
  }
}