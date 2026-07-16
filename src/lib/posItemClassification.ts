// Infer a coarse item type from a Captiva-style department label.
// Keep the buckets small and predictable so the UI can filter reliably.

export type PosItemType = 'food' | 'drink' | 'modifier' | 'other';

const FOOD_KEYWORDS = [
  'starter', 'appetiser', 'appetizer', 'main', 'mains', 'entree', 'entrée',
  'pasta', 'pizza', 'brunch', 'breakfast', 'lunch', 'dinner', 'dessert',
  'burger', 'salad', 'soup', 'kids', 'sandwich', 'grill', 'meat', 'fish',
  'seafood', 'rice', 'noodle', 'special', 'platter', 'sharing', 'bakery',
];

const DRINK_KEYWORDS = [
  'drink', 'drinks', 'beverage', 'wine', 'wines', 'beer', 'beers', 'cocktail',
  'cocktails', 'spirit', 'spirits', 'coffee', 'tea', 'juice', 'soft',
  'softs', 'water', 'shot', 'shots', 'liqueur', 'aperitif', 'digestif',
  'champagne', 'prosecco', 'bar',
];

const MODIFIER_KEYWORDS = [
  'default', 'modifier', 'modifiers', 'add-on', 'addon', 'add on', 'extras',
  'extra', 'side', 'sides', 'sauce', 'sauces', 'topping', 'toppings',
  'option', 'options', 'dip', 'dips', 'condiment',
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
  const haystack = `${dept} ${nm}`;

  if (MODIFIER_KEYWORDS.some((k) => dept.includes(k))) return 'modifier';
  if (DRINK_KEYWORDS.some((k) => haystack.includes(k))) return 'drink';
  if (FOOD_KEYWORDS.some((k) => haystack.includes(k))) return 'food';

  // Fallback: empty department or unknown → other (so it doesn't pollute charts)
  if (!dept) return 'other';
  return 'other';
}

export const ITEM_TYPE_LABEL: Record<PosItemType, string> = {
  food: 'Food',
  drink: 'Drink',
  modifier: 'Modifier / Side',
  other: 'Other',
};
