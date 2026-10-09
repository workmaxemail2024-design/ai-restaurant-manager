/**
 * Initial Stock List import — pure parsing, normalisation and matching.
 * Nothing here writes to the database. Missing data stays missing (null),
 * never 0. Ambiguous units/quantities never produce a price.
 */
import * as XLSX from "xlsx";
import type { InventoryItemType } from "@/hooks/useIngredients";

export type PackUnit = "each" | "g" | "kg" | "ml" | "L";
export type PurchaseUnit = "each" | "g" | "kg" | "ml" | "L" | "case";

export interface RawRow {
  rowNumber: number;
  itemName: string;
  supplier: string;
  group: string;
  category: string;
  itemType: string;
  purchaseQty: string;
  purchaseUnit: string;
  packSize: string;
  packUnit: string;
  packCost: string;
  unitCost: string;
  sellingPrice: string;
  notes: string;
  productCode: string;
}

const HEADER_MAP: Record<string, keyof Omit<RawRow, "rowNumber">> = {
  itemname: "itemName", item: "itemName", name: "itemName", product: "itemName", description: "itemName",
  supplier: "supplier", suppliername: "supplier",
  group: "group", itemgroup: "group",
  category: "category",
  itemtype: "itemType", type: "itemType",
  purchasequantity: "purchaseQty", purchaseqty: "purchaseQty", qty: "purchaseQty", quantity: "purchaseQty",
  purchaseunit: "purchaseUnit",
  packsize: "packSize",
  packunit: "packUnit",
  packcost: "packCost", cost: "packCost", price: "packCost", purchaseprice: "packCost", costprice: "packCost",
  calculatedunitcost: "unitCost", unitcost: "unitCost",
  referencesellingprice: "sellingPrice", sellingprice: "sellingPrice",
  notes: "notes", note: "notes",
  productcode: "productCode", code: "productCode", sku: "productCode", itemcode: "productCode",
  suppliercode: "productCode", supplierref: "productCode", articlenumber: "productCode",
};

const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

export type FieldKey = keyof Omit<RawRow, "rowNumber">;

export const IMPORT_FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: "itemName", label: "Item Name", required: true },
  { key: "supplier", label: "Supplier" },
  { key: "group", label: "Group" },
  { key: "category", label: "Category" },
  { key: "itemType", label: "Item Type" },
  { key: "purchaseQty", label: "Purchase Quantity" },
  { key: "purchaseUnit", label: "Purchase Unit" },
  { key: "packSize", label: "Pack Size" },
  { key: "packUnit", label: "Pack Unit" },
  { key: "packCost", label: "Pack Cost" },
  { key: "unitCost", label: "Calculated Unit Cost" },
  { key: "sellingPrice", label: "Reference Selling Price" },
  { key: "notes", label: "Notes" },
  { key: "productCode", label: "Supplier Product Code" },
];

export type ColumnMapping = Record<FieldKey, number | null>;

export interface SheetGrid {
  headers: string[];
  headerRow: number; // 1-based sheet row of the header
  rows: string[][];
}

/** Reads the first sheet. Header = first row naming an item column, else row 1. */
export async function readStockGrid(file: File): Promise<SheetGrid> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" })
    .map((r) => r.map((c) => String(c ?? "").trim()));
  if (!grid.length) throw new Error("The file is empty.");
  let headerIdx = grid.findIndex((r) => r.some((c) => HEADER_MAP[headerKey(c)] === "itemName"));
  if (headerIdx < 0) headerIdx = 0;
  return { headers: grid[headerIdx], headerRow: headerIdx + 1, rows: grid.slice(headerIdx + 1) };
}

export function autoMapColumns(headers: string[]): ColumnMapping {
  const m = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, null])) as ColumnMapping;
  headers.forEach((h, i) => {
    const k = HEADER_MAP[headerKey(h)];
    if (k && m[k] == null) m[k] = i;
  });
  return m;
}

export function buildRows(grid: SheetGrid, mapping: ColumnMapping): RawRow[] {
  const out: RawRow[] = [];
  grid.rows.forEach((r, idx) => {
    const row = { rowNumber: grid.headerRow + idx + 1 } as RawRow;
    for (const f of IMPORT_FIELDS) {
      const c = mapping[f.key];
      (row[f.key] as string) = c == null ? "" : (r[c] ?? "").trim();
    }
    if (IMPORT_FIELDS.every((f) => !row[f.key])) return;
    out.push(row);
  });
  return out;
}

// ---------- normalisation ----------

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ltd|limited|plc|inc|co|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Common kitchen synonyms / spellings, mapped to one token. Suggestion only. */
const SYNONYMS: Record<string, string> = {
  courgette: "zucchini", aubergine: "eggplant", coriander: "cilantro", rocket: "arugula",
  scallion: "springonion", spring: "spring", capsicum: "pepper", prawn: "shrimp", mince: "minced",
  ground: "minced", chilli: "chili", chile: "chili", yoghurt: "yogurt", fillet: "filet",
  breast: "breast", supreme: "supreme", tomatoe: "tomato", potatoe: "potato", mayo: "mayonnaise",
  veg: "vegetable", choc: "chocolate", bbq: "barbecue", ketchup: "ketchup", catsup: "ketchup",
};

function singular(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(oes|ches|shes|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function tokens(s: string): string[] {
  return normalizeName(s).split(" ").filter(Boolean).map((w) => {
    const sg = singular(w);
    return SYNONYMS[sg] ?? sg;
  });
}

/** Looser key used only to SUGGEST a possible match (never auto-merges). */
function looseKey(s: string): string {
  return tokens(s).sort().join(" ");
}

/** Numbers / sizes / grades that make two products genuinely different. */
const DISTINGUISHING = /^(\d+([.,]\d+)?[a-z]*|small|medium|large|xl|jumbo|organic|free|range|frozen|fresh|smoked|unsmoked|salted|unsalted|skinless|boneless|bone|whole|diced|sliced|minced|light|full|fat|low|zero|diet)$/;
function distinguishingDiffer(a: string, b: string): boolean {
  const da = new Set(tokens(a).filter((t) => DISTINGUISHING.test(t)));
  const db = new Set(tokens(b).filter((t) => DISTINGUISHING.test(t)));
  if (da.size !== db.size) return true;
  for (const t of da) if (!db.has(t)) return true;
  return false;
}

/** 0..1 similarity score for ranking suggestions. */
export function similarity(a: string, b: string): number {
  const la = looseKey(a), lb = looseKey(b);
  if (!la || !lb) return 0;
  if (la === lb) return 0.98;
  const ta = new Set(la.split(" ")), tb = new Set(lb.split(" "));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const jacc = inter / new Set([...ta, ...tb]).size;
  const lev = 1 - levenshtein(la, lb) / Math.max(la.length, lb.length);
  return Math.max(jacc, lev);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Likely the same product? Spelling/plural/synonym variations qualify;
 * different cuts, sizes or grades never do (they stay separate unless the
 * user explicitly picks the existing item).
 */
export function isNearMatch(a: string, b: string): boolean {
  if (distinguishingDiffer(a, b)) return false;
  const la = looseKey(a), lb = looseKey(b);
  if (!la || !lb) return false;
  if (la === lb) return true;
  if (Math.min(la.length, lb.length) >= 6 && levenshtein(la, lb) <= 2) return true;
  return similarity(a, b) >= 0.75 && Math.min(la.length, lb.length) >= 5;
}

export function parseMoney(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[€$£\s]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseNum(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const MEASURE: Record<string, PackUnit> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  g: "g", gr: "g", gram: "g", grams: "g",
  l: "L", lt: "L", ltr: "L", litre: "L", litres: "L", liter: "L", liters: "L",
  ml: "ml", millilitre: "ml", millilitres: "ml",
  each: "each", ea: "each", unit: "each", units: "each", pc: "each", pcs: "each", piece: "each", pieces: "each",
  bottle: "each", bottles: "each", btl: "each", can: "each", cans: "each", portion: "each", portions: "each",
};
const CONTAINERS = new Set(["case", "cases", "box", "boxes", "pack", "packs", "bag", "bags", "crate", "crates", "tray", "trays", "carton", "cartons", "tub", "tubs", "roll", "rolls", "sack", "sacks", "keg", "kegs", "drum", "drums"]);

export function parsePackUnit(s: string): PackUnit | null {
  return MEASURE[s.trim().toLowerCase()] ?? null;
}

const dim = (u: PackUnit) => (u === "kg" || u === "g" ? "w" : u === "L" || u === "ml" ? "v" : "c");

/** "kg" → {1,kg}; "5L" → {5,L}; "case" → container; "" → empty. */
function parsePurchaseUnit(s: string):
  | { kind: "measure"; size: number; unit: PackUnit }
  | { kind: "container"; label: string }
  | { kind: "empty" }
  | { kind: "unknown"; label: string } {
  const t = s.trim().toLowerCase();
  if (!t) return { kind: "empty" };
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*([a-z]+)$/);
  if (m && MEASURE[m[2]]) return { kind: "measure", size: parseFloat(m[1].replace(",", ".")), unit: MEASURE[m[2]] };
  if (MEASURE[t]) return { kind: "measure", size: 1, unit: MEASURE[t] };
  if (CONTAINERS.has(t)) return { kind: "container", label: t };
  return { kind: "unknown", label: t };
}

export function parseGroup(s: string): "food" | "beverage" | "operational" | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (/^(food|kitchen)/.test(t)) return "food";
  if (/^(bev|drink|bar)/.test(t)) return "beverage";
  if (/^(op|cleaning|consumable|non.?food|supplies)/.test(t)) return "operational";
  return null;
}

const CATEGORY_ALIASES: Record<string, string> = {
  meat: "meat", meats: "meat", butcher: "meat",
  poultry: "poultry", chicken: "poultry",
  fish: "fish_seafood", seafood: "fish_seafood", fishseafood: "fish_seafood", fishandseafood: "fish_seafood",
  dairy: "dairy",
  fruit: "fruit", fruits: "fruit",
  veg: "vegetables", vegetable: "vegetables", vegetables: "vegetables", produce: "vegetables",
  drygoods: "dry_goods", dry: "dry_goods", dried: "dry_goods", grocery: "dry_goods", groceries: "dry_goods",
  bakery: "bakery", bread: "bakery",
  frozen: "frozen",
  beer: "beer", beers: "beer", cider: "beer",
  wine: "wine", wines: "wine",
  spirits: "spirits", spirit: "spirits",
  softdrinks: "soft_drinks", softdrink: "soft_drinks", minerals: "soft_drinks", soft: "soft_drinks",
  packaging: "packaging", takeaway: "packaging",
  cleaning: "cleaning", chemicals: "cleaning", hygiene: "cleaning",
  ppe: "ppe", gloves: "ppe",
  other: "other",
};

export function parseCategory(s: string): string | null {
  const t = s.toLowerCase().replace(/[^a-z]/g, "");
  return t ? CATEGORY_ALIASES[t] ?? null : null;
}

export function parseItemType(s: string): InventoryItemType | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("recipe") || t.includes("ingredient")) return "recipe_ingredient";
  if (t.includes("direct") || t.includes("beverage") || t.includes("resale")) return "direct_sale";
  if (t.includes("operational") || t.includes("consumable")) return "operational";
  return null;
}

// ---------- row interpretation ----------

export interface ParsedItem {
  raw: RawRow;
  name: string;
  normalized: string;
  supplierName: string | null;
  group: "food" | "beverage" | "operational" | null;
  category: string | null;
  itemType: InventoryItemType | null;
  packSize: number | null;
  packUnit: PackUnit | null;
  costPerPack: number | null;
  purchaseUnit: PurchaseUnit | null;
  /** Cost per base unit (g / ml / each), or null = unknown. */
  baseCost: number | null;
  baseUnit: "g" | "ml" | "each" | null;
  sellingPrice: number | null;
  /** Supplier's own product code, if the file has one. */
  productCode: string | null;
  issues: string[];
  /** Missing data that leaves a field unknown (still importable). */
  missing: string[];
  /** Blocks creation (no usable name / unit). */
  blocking: string[];
}

const factor = (u: PackUnit) => (u === "kg" || u === "L" ? 1000 : 1);
export const baseOf = (u: PackUnit): "g" | "ml" | "each" => (dim(u) === "w" ? "g" : dim(u) === "v" ? "ml" : "each");

export function interpretRow(raw: RawRow): ParsedItem {
  const issues: string[] = [];
  const missing: string[] = [];
  const blocking: string[] = [];
  const name = raw.itemName.replace(/\s+/g, " ").trim();
  if (!name) blocking.push("No item name");

  const group = parseGroup(raw.group);
  if (raw.group && !group) issues.push(`Unrecognised group "${raw.group}"`);
  const category = parseCategory(raw.category);
  if (raw.category && !category) issues.push(`Unrecognised category "${raw.category}" — left uncategorised`);
  if (!raw.category) missing.push("category");

  let itemType = parseItemType(raw.itemType);
  if (raw.itemType && !itemType) issues.push(`Unrecognised item type "${raw.itemType}"`);
  if (!itemType && group === "operational") itemType = "operational";
  if (!itemType) missing.push("item type");
  if ((group === "operational" || category === "cleaning" || category === "ppe" || category === "packaging") && itemType === "recipe_ingredient") {
    issues.push("Operational supply marked as recipe ingredient — check item type");
  }

  const qty = parseNum(raw.purchaseQty);
  const pu = parsePurchaseUnit(raw.purchaseUnit);
  const explicitSize = parseNum(raw.packSize);
  const explicitUnit = raw.packUnit ? parsePackUnit(raw.packUnit) : null;
  if (raw.packUnit && !explicitUnit) issues.push(`Unrecognised pack unit "${raw.packUnit}"`);
  if (pu.kind === "unknown") issues.push(`Unrecognised purchase unit "${raw.purchaseUnit}"`);

  let packSize: number | null = null;
  let packUnit: PackUnit | null = null;
  let ambiguous = false;

  if (explicitSize != null && explicitSize > 0) {
    packSize = explicitSize;
    packUnit = explicitUnit ?? (pu.kind === "measure" ? pu.unit : null);
    if (pu.kind === "measure" && packUnit && dim(pu.unit) !== dim(packUnit)) {
      issues.push(`Purchase unit "${raw.purchaseUnit}" and pack unit "${raw.packUnit}" don't match`);
      ambiguous = true;
    }
  } else if (pu.kind === "measure") {
    if (explicitUnit && dim(explicitUnit) !== dim(pu.unit)) {
      issues.push(`Purchase unit "${raw.purchaseUnit}" and pack unit "${raw.packUnit}" don't match`);
      ambiguous = true;
    } else {
      packSize = pu.size;
      packUnit = pu.unit;
    }
  } else {
    packUnit = explicitUnit;
    if (pu.kind === "container") missing.push(`pack size (how many per ${pu.label})`);
    else missing.push("pack size");
  }
  if (!packUnit) missing.push("unit");

  if (qty != null && qty !== 1 && qty > 0) {
    issues.push(`Purchase quantity ${qty}: unclear whether the cost is per unit or for all ${qty}`);
    ambiguous = true;
  }

  const packCost = parseMoney(raw.packCost);
  const unitCostCol = parseMoney(raw.unitCost);
  let costPerPack: number | null = null;
  if (packCost != null && packCost <= 0) issues.push("Pack cost is zero — treated as unknown");
  if (!ambiguous && packSize && packUnit) {
    if (packCost != null && packCost > 0) costPerPack = packCost;
    else if (unitCostCol != null && unitCostCol > 0) costPerPack = unitCostCol * packSize;
  } else if (!ambiguous && !packSize && packUnit && unitCostCol != null && unitCostCol > 0 && pu.kind !== "container") {
    packSize = 1;
    costPerPack = unitCostCol;
  }
  if (costPerPack == null) missing.push("price");

  const baseUnit = packUnit ? baseOf(packUnit) : null;
  const baseCost = costPerPack != null && packSize && packUnit ? costPerPack / (packSize * factor(packUnit)) : null;

  if (baseCost != null && unitCostCol != null && unitCostCol > 0 && packUnit) {
    const perPackUnit = costPerPack! / packSize!;
    if (Math.abs(perPackUnit - unitCostCol) / unitCostCol > 0.02) {
      issues.push(`File unit cost €${unitCostCol.toFixed(2)} differs from calculated €${perPackUnit.toFixed(2)} per ${packUnit}`);
    }
  }

  const purchaseUnit: PurchaseUnit | null =
    pu.kind === "container" && /^(case|box|crate|carton)/.test(pu.label) ? "case" :
    pu.kind === "measure" && pu.size === 1 ? pu.unit : packUnit;

  if (!packUnit) blocking.push("No usable unit — cannot create without guessing");

  return {
    raw, name, normalized: normalizeName(name),
    supplierName: raw.supplier.trim() || null,
    group, category, itemType,
    packSize, packUnit, costPerPack, purchaseUnit, baseCost, baseUnit,
    sellingPrice: parseMoney(raw.sellingPrice),
    productCode: raw.productCode.trim() || null,
    issues, missing, blocking,
  };
}

export function defaultStorage(category: string | null, group: string | null): "freezer" | "fridge" | "dry" {
  if (category === "frozen") return "freezer";
  if (["meat", "poultry", "fish_seafood", "dairy"].includes(category ?? "")) return "fridge";
  if (group === "beverage") return "dry";
  return "dry";
}

// ---------- Photo / PDF extraction (read-only AI step) ----------
export const EXTRACT_FIELDS = ["supplier", "itemName", "productCode", "packSize", "packUnit", "packCost", "purchaseUnit", "notes"] as const;
export type ExtractField = typeof EXTRACT_FIELDS[number];
export interface ExtractedCell { value: string | null; status: "clear" | "unclear" | "absent"; raw: string | null }
export type ExtractedRow = Record<ExtractField, ExtractedCell>;

/** Editable working copy: value + whether an unclear cell has been resolved by the user. */
export interface EditableRow { id: number; skip: boolean; cells: Record<ExtractField, { value: string; unclear: boolean; raw: string | null; resolved: boolean }> }

export function toEditable(rows: ExtractedRow[]): EditableRow[] {
  return rows.map((r, i) => ({
    id: i + 1,
    skip: false,
    cells: Object.fromEntries(EXTRACT_FIELDS.map((f) => {
      const c = r?.[f];
      const unclear = c?.status === "unclear";
      return [f, { value: unclear ? "" : (c?.value ?? "").trim(), unclear, raw: c?.raw ?? null, resolved: !unclear }];
    })) as EditableRow["cells"],
  }));
}

export const unresolvedCells = (rows: EditableRow[]) =>
  rows.reduce((n, r) => n + (r.skip ? 0 : EXTRACT_FIELDS.filter((f) => !r.cells[f].resolved).length), 0);

const EXTRACT_HEADERS: Record<ExtractField, string> = {
  supplier: "Supplier", itemName: "Item Name", productCode: "Product Code", packSize: "Pack Size",
  packUnit: "Pack Unit", packCost: "Pack Cost", purchaseUnit: "Purchase Unit", notes: "Notes",
};

/** Builds the same grid the spreadsheet path produces, so the existing review runs unchanged. */
export function extractedToGrid(rows: EditableRow[]): SheetGrid {
  return {
    headers: EXTRACT_FIELDS.map((f) => EXTRACT_HEADERS[f]),
    headerRow: 0,
    rows: rows.filter((r) => !r.skip).map((r) => EXTRACT_FIELDS.map((f) => r.cells[f].value.trim())),
  };
}
