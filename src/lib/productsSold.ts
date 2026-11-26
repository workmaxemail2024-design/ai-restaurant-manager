import { dedupePosSales, isPosSource } from "./revenueTruth";
import { resolveProductClass, type ProductClass } from "./productClassification";

export interface ProductSnapshot {
  id: string; restaurant_id: string; location_id: string; trading_date: string;
  observed_at: string; journal_coverage: string;
  official_gross?: number | null; official_orders?: number | null;
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
  /** Actual POS line gross/discount from the import row; null when not supplied. */
  gross?: number | null; discount?: number | null;
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
  /** dish_drink = default view; kitchen_note = free-text instruction / modifier; adjustment = void/refund; other = unclassified. */
  category: ProductCategory; gross: number | null; discount: number | null;
}
export type ProductCategory = "dish_drink" | "kitchen_note" | "adjustment" | "other";
/** Distinct descriptions on one product ID at which it is treated as a generic free-text slot. */
export const GENERIC_ID_DESCRIPTION_THRESHOLD = 5;
const INSTRUCTION = /^(>|\d+\s*(x\s*)?(no|with|w|is|sin|extra)\b|x\d|no\b|sin\b|without\b|extra\b|add\b|well done|asap|make\b)|\b(on side|ots|instd|instead|well done|med|rare)\b/i;
export function normalizeDescription(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}
export function looksLikeKitchenInstruction(description: string | null | undefined): boolean {
  return INSTRUCTION.test((description ?? "").trim());
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
  // Product IDs reused for many different free-text descriptions are generic instruction slots.
  const descByIdLoc = new Map<string, Set<string>>();
  for (const o of observations) {
    const k = `${o.location_id}|${o.product_id}`;
    if (!descByIdLoc.has(k)) descByIdLoc.set(k, new Set());
    descByIdLoc.get(k)!.add(normalizeDescription(o.description));
  }
  const genericIds = new Set([...descByIdLoc].filter(([, d]) => d.size >= GENERIC_ID_DESCRIPTION_THRESHOLD).map(([k]) => k));
  const products = new Map<string, SoldProduct>();
  const sumNullable = (a: number | null | undefined, b: number | null | undefined) => a == null || b == null ? null : a + b;
  function add(loc: string, id: string, name: string, qty: number | null, source: SoldProduct["source"], type?: string, department?: string | null, gross: number | null = null, discount: number | null = null) {
    const generic = genericIds.has(`${loc}|${id}`);
    const canonical = generic ? undefined : input.catalogue.find(c => c.location_id === loc && c.external_item_id === id);
    const classification = resolveProductClass({ name, department: canonical?.department ?? department,
      manualType: canonical?.manual_type, manualDrinkType: canonical?.manual_drink_type }).productClass;
    const adjustment = /void|refund/i.test(type ?? "") || (qty != null && qty < 0);
    const note = !adjustment && (generic || /modifier/i.test(type ?? "") || classification === "modifier" || (!canonical?.manual_type && looksLikeKitchenInstruction(name)));
    const dishDrink = !adjustment && !note && (classification === "food" || classification === "drink_alcoholic" || classification === "drink_non_alcoholic" ||
      (!canonical?.manual_type && classification === "other" && (type === "combo" || type === "cookbook")));
    const category: ProductCategory = adjustment ? "adjustment" : note ? "kitchen_note" : dishDrink ? "dish_drink" : "other";
    // Never group different descriptions under one ID, and never merge journal record types.
    const key = `${loc}|${id}|${normalizeDescription(name)}|${source}|${type ?? "sale"}`;
    const previous = products.get(key);
    const quantity = previous ? sumNullable(previous.quantity, qty) : qty;
    products.set(key, { key, locationId: loc, productId: id, name, source, classification, category,
      rankable: category === "dish_drink" && quantity != null && quantity > 0 && qty != null && (previous?.rankable ?? true),
      observationType: type, channel: "Unknown", quantity,
      gross: previous ? sumNullable(previous.gross, gross) : gross,
      discount: previous ? sumNullable(previous.discount, discount) : discount });
  }
  for (const p of posted) add(p.location_id, p.productId ?? p.dish_id, p.name, p.quantity, "Posted", undefined, p.department, p.gross ?? null, p.discount ?? null);
  // Journal raw values are never revenue: provisional rows always carry unknown gross.
  for (const o of observations) add(o.location_id, o.product_id, o.description ?? o.product_id, o.quantity, "Provisional journal", o.product_type);
  // Revenue reconciliation only where posted line amounts exist for every posted row.
  const postedGross = posted.length && posted.every(p => p.gross != null) ? posted.reduce((t, p) => t + (p.gross as number), 0) : null;
  const postedDiscounts = posted.length && posted.every(p => p.discount != null) ? posted.reduce((t, p) => t + (p.discount as number), 0) : null;
  const postedDayKeys = new Set(posted.map(p => `${p.location_id}|${p.sale_date}`));
  const officialForPosted = snapshots.filter(s => postedDayKeys.has(`${s.location_id}|${s.trading_date}`));
  const officialGrossPostedDays = officialForPosted.length === postedDayKeys.size && officialForPosted.every(s => s.official_gross != null)
    ? officialForPosted.reduce((t, s) => t + Number(s.official_gross), 0) : null;
  const revenue = { postedGross, postedDiscounts, officialGrossPostedDays,
    difference: postedGross != null && officialGrossPostedDays != null ? Math.round((officialGrossPostedDays - postedGross) * 100) / 100 : null };
  return { products: [...products.values()], snapshots, revenue, observationDays: new Set(observations.map(o => `${o.location_id}|${o.trading_date}`)).size,
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