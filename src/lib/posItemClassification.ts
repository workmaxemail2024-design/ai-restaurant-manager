// Infer a coarse item type from a Captiva-style department label.
// Order of checks is important — modifiers first (strongest signal), then
// specific food/drink dept names, then broader keyword search.

export type PosItemType = 'food' | 'drink' | 'modifier' | 'other';

// Exact / substring matches on the DEPARTMENT column
const FOOD_DEPTS = [
  'starter', 'starters', 'main', 'mains', 'from the sea', 'the butchers block',
  'butchers block', 'butcher', 'pasta', 'pizza', 'brunch', 'risotto', 'kids',
  'desserts', 'dessert', 'breakfast', 'lunch', 'dinner', 'burger', 'salad',
  'soup', 'grill', 'sandwich', 'seafood', 'platter', 'sharing', 'bakery',
  'sides',
];

const DRINK_DEPTS = [
  'soft drinks', 'soft drink', 'softs', 'drink', 'drinks', 'beverage', 'wine',
  'white wine', 'red wine', 'rose wine', 'rosé wine', 'beer', 'beers',
  'spirits', 'spirit', 'cocktail', 'cocktails', 'tea', 'coffee', 'prosecco',
  'champagne', 'juice', 'water', 'liqueur', 'aperitif', 'digestif', 'bar',
  'shots',
];

const MODIFIER_DEPTS = [
  'default', 'modifier', 'modifiers', 'add-on', 'addon', 'add on', 'extras',
  'extra', 'sauce', 'sauces', 'topping', 'toppings', 'option', 'options',
  'dip', 'dips', 'condiment',
];

// Name-level hints for individual modifier items (used when the department
// alone is ambiguous, e.g. "Sides")
const MODIFIER_NAME_HINTS = [
  'no tomato', 'no cheese', 'no onion', 'no sauce', 'extra ',
  'add ', 'parmesan shave', 'tomato sauce', 'garlic dip', 'garlic sauce',
  'ketchup', 'mayo', 'mayonnaise', 'chilli sauce', 'chili sauce', 'gravy',
  'dressing', 'dip',
];

function normalise(value: string | null | undefined): string {
  return (value || '').toString().toLowerCase().trim();
}

export function inferItemType(
  department: string | null | undefined,
  name?: string | null,
): PosItemType {
  const dept = normalise(department);
  const nm = normalise(name);

  // 1. Department-based modifier match is the strongest signal
  if (MODIFIER_DEPTS.some((k) => dept === k || dept.includes(k))) return 'modifier';

  // 2. Name-level modifier hints (only when dept doesn't already claim food/drink)
  const looksLikeFoodDept = FOOD_DEPTS.some((k) => dept.includes(k));
  const looksLikeDrinkDept = DRINK_DEPTS.some((k) => dept.includes(k));
  if (!looksLikeFoodDept && !looksLikeDrinkDept) {
    if (MODIFIER_NAME_HINTS.some((k) => nm.includes(k))) return 'modifier';
  }

  // 3. Drink department wins over food (avoids "coffee cake" style edge cases
  //    where the dept is clearly drink-oriented)
  if (looksLikeDrinkDept) return 'drink';
  if (looksLikeFoodDept) return 'food';

  return 'other';
}

export const ITEM_TYPES: PosItemType[] = ['food', 'drink', 'modifier', 'other'];

export const ITEM_TYPE_LABEL: Record<PosItemType, string> = {
  food: 'Food',
  drink: 'Drink',
  modifier: 'Modifier / Side',
  other: 'Other',
};
