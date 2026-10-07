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
};

const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

export async function parseStockFile(file: File): Promise<RawRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  // Header = first row that names an item column.
  const headerIdx = grid.findIndex((r) => r.some((c) => HEADER_MAP[headerKey(String(c))] === "itemName"));
  if (headerIdx < 0) throw new Error("Could not find an 'Item Name' column header.");
  const headers = grid[headerIdx].map((c) => HEADER_MAP[headerKey(String(c))]);
  const rows: RawRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    const row: RawRow = {
      rowNumber: i + 1, itemName: "", supplier: "", group: "", category: "", itemType: "",
      purchaseQty: "", purchaseUnit: "", packSize: "", packUnit: "", packCost: "", unitCost: "",
      sellingPrice: "", notes: "",
    };
    headers.forEach((k, j) => {
      if (k && !row[k]) (row[k] as string) = String(r[j] ?? "").trim();
    });
    if (Object.values(row).every((v) => v === "" || typeof v === "number")) continue;
    rows.push(row);
  }
  return rows;
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

/** Looser key used only to SUGGEST a possible match (never auto-merges). */
function looseKey(s: string): string {
  return normalizeName(s)
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .sort()
    .join(" ");
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

export function isNearMatch(a: string, b: string): boolean {
  const la = looseKey(a), lb = looseKey(b);
  if (!la || !lb) return false;
  if (la === lb) return true;
  const na = normalizeName(a), nb = normalizeName(b);
  if (Math.min(na.length, nb.length) >= 6 && levenshtein(na, nb) <= 2) return true;
  return false;
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
    issues, missing, blocking,
  };
}

export function defaultStorage(category: string | null, group: string | null): "freezer" | "fridge" | "dry" {
  if (category === "frozen") return "freezer";
  if (["meat", "poultry", "fish_seafood", "dairy"].includes(category ?? "")) return "fridge";
  if (group === "beverage") return "dry";
  return "dry";
}
