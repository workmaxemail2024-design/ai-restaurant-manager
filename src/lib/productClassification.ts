// Canonical, shared product classification.
//
// Source of truth = public.external_pos_items.manual_type / manual_drink_type
// (the POS-mapped canonical product record). Both Menu Performance (daily POS
// sales) and Product Intelligence (historical aggregates) read and write this
// single source, so a change in one place applies everywhere.
//
// IMPORTANT: this is a SALES classification (what the product is on the menu).
// It is deliberately separate from the INVENTORY behaviour stored on
// ingredients.item_type (recipe_ingredient / direct_sale / operational).

import { inferItemType, inferDrinkType, type PosItemType, type DrinkType } from './posItemClassification';

export type ProductClass =
  | 'food'
  | 'drink_alcoholic'
  | 'drink_non_alcoholic'
  | 'drink' // drink with unknown subtype (inferred only, not user-selectable)
  | 'side'
  | 'modifier'
  | 'other';

export const PRODUCT_CLASS_LABEL: Record<ProductClass, string> = {
  food: 'Food',
  drink_alcoholic: 'Alcoholic Drink',
  drink_non_alcoholic: 'Non-Alcoholic Drink',
  drink: 'Drink (unclassified)',
  side: 'Side',
  modifier: 'Modifier',
  other: 'Other / Unclassified',
};

/** Options offered in the inline / bulk type pickers. */
export const PRODUCT_CLASS_OPTIONS: ProductClass[] = [
  'food',
  'drink_alcoholic',
  'drink_non_alcoholic',
  'side',
  'modifier',
  'other',
];

export interface StoredClassification {
  manual_type: 'food' | 'drink' | 'side' | 'modifier' | 'other';
  manual_drink_type: 'alcoholic' | 'non_alcoholic' | 'unknown' | null;
}

/** Convert a canonical class into the persisted columns. */
export function toStoredClassification(c: ProductClass): StoredClassification {
  switch (c) {
    case 'food':
      return { manual_type: 'food', manual_drink_type: null };
    case 'drink_alcoholic':
      return { manual_type: 'drink', manual_drink_type: 'alcoholic' };
    case 'drink_non_alcoholic':
      return { manual_type: 'drink', manual_drink_type: 'non_alcoholic' };
    case 'drink':
      return { manual_type: 'drink', manual_drink_type: 'unknown' };
    case 'side':
      return { manual_type: 'side', manual_drink_type: null };
    case 'modifier':
      return { manual_type: 'modifier', manual_drink_type: null };
    case 'other':
      return { manual_type: 'other', manual_drink_type: null };
  }
}

function combine(type: PosItemType | string, drink: DrinkType | string | null): ProductClass {
  if (type === 'drink') {
    if (drink === 'alcoholic') return 'drink_alcoholic';
    if (drink === 'non_alcoholic') return 'drink_non_alcoholic';
    return 'drink';
  }
  if (type === 'side') return 'side';
  if (type === 'modifier') return 'modifier';
  if (type === 'food') return 'food';
  return 'other';
}

export interface ResolvedClassification {
  /** Effective canonical class (manual wins over inferred). */
  productClass: ProductClass;
  /** True when a human confirmed it — future imports must never overwrite it. */
  isManual: boolean;
  /** What the automatic rules suggest (always computed, for transparency). */
  inferredClass: ProductClass;
}

/**
 * Resolve the effective classification for a canonical product.
 * Manual values always override inferred ones.
 */
export function resolveProductClass(params: {
  department?: string | null;
  name?: string | null;
  manualType?: string | null;
  manualDrinkType?: string | null;
}): ResolvedClassification {
  const { department, name, manualType, manualDrinkType } = params;
  const inferredClass = combine(
    inferItemType(department, name),
    inferDrinkType(department, name),
  );

  if (manualType) {
    return {
      productClass: combine(manualType, manualDrinkType ?? null),
      isManual: true,
      inferredClass,
    };
  }
  return { productClass: inferredClass, isManual: false, inferredClass };
}

/** Broad grouping helpers used by summary cards / filters. */
export const isDrinkClass = (c: ProductClass) =>
  c === 'drink' || c === 'drink_alcoholic' || c === 'drink_non_alcoholic';

/** Sides & modifiers are excluded from "main sellable item" analytics. */
export const isAccompanimentClass = (c: ProductClass) => c === 'side' || c === 'modifier';
