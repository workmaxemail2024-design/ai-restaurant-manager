/**
 * Unit-safe recipe quantity handling. Mirrors the database functions
 * `normalize_unit`, `unit_factor`, `get_ingredient_cost_unit` and
 * `convert_recipe_qty` exactly, so UI and costing never disagree.
 *
 * Unknown or missing units are ALWAYS unknown (null) — never silently "each".
 */

export type RecipeUnit = "g" | "kg" | "oz" | "ml" | "L" | "each";
/** Normalised costing dimension unit. */
export type BaseUnit = "g" | "ml" | "each";

export const RECIPE_UNITS: { value: RecipeUnit; label: string }[] = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "oz", label: "oz" },
  { value: "ml", label: "ml" },
  { value: "L", label: "L" },
  { value: "each", label: "each" },
];

export function normalizeUnit(u?: string | null): BaseUnit | null {
  switch ((u ?? "").trim().toLowerCase()) {
    case "g":
    case "kg":
    case "oz":
      return "g";
    case "ml":
    case "l":
      return "ml";
    case "each":
      return "each";
    default:
      return null;
  }
}

export function unitFactor(u?: string | null): number | null {
  switch ((u ?? "").trim().toLowerCase()) {
    case "g":
      return 1;
    case "kg":
      return 1000;
    case "oz":
      return 28.349523125;
    case "ml":
      return 1;
    case "l":
      return 1000;
    case "each":
      return 1;
    default:
      return null;
  }
}

/** The unit an ingredient's cost is expressed per. null = cannot be determined. */
export function getIngredientCostUnit(ing?: {
  pack_size?: number | null;
  cost_per_pack?: number | null;
  pack_unit?: string | null;
  unit?: string | null;
} | null): BaseUnit | null {
  if (!ing) return null;
  const hasPack =
    ing.pack_size != null && ing.pack_size > 0 && ing.cost_per_pack != null && ing.cost_per_pack > 0;
  return normalizeUnit(hasPack ? ing.pack_unit : ing.unit);
}

/** Units a user may enter for this ingredient (same dimension as its costing unit). */
export function compatibleUnits(costUnit: BaseUnit | null): RecipeUnit[] {
  if (costUnit === "g") return ["g", "kg", "oz"];
  if (costUnit === "ml") return ["ml", "L"];
  if (costUnit === "each") return ["each"];
  return [];
}

/**
 * Convert a recipe quantity into the ingredient's costing unit.
 * null = unknown (missing unit, unsupported unit, or incompatible dimension).
 */
export function convertRecipeQty(
  ing: Parameters<typeof getIngredientCostUnit>[0],
  quantity: number | null | undefined,
  unit?: string | null
): number | null {
  if (quantity == null || Number.isNaN(quantity)) return null;
  const costUnit = getIngredientCostUnit(ing);
  if (!costUnit) return null;
  if (!(unit ?? "").trim()) return null;
  if (normalizeUnit(unit) !== costUnit) return null;
  const factor = unitFactor(unit);
  if (factor == null) return null;
  return quantity * factor;
}
