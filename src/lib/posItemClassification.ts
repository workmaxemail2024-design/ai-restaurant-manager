// Infer a coarse item type from a Captiva-style department label.
// Order of checks is important — modifiers first (strongest signal), then
// specific food/drink dept names, then broader keyword search.

export type PosItemType = 'food' | 'drink' | 'side' | 'modifier' | 'other';
export type DrinkType = 'alcoholic' | 'non_alcoholic' | 'unknown';

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

// Alcohol classification keywords (matched against dept OR name)
const ALCOHOL_KEYWORDS = [
  'wine', 'white wine', 'red wine', 'rose wine', 'rosé wine', 'prosecco',
  'champagne', 'beer', 'lager', 'ale', 'stout', 'cider', 'spirit', 'spirits',
  'gin', 'vodka', 'whiskey', 'whisky', 'rum', 'tequila', 'brandy', 'cognac',
  'cocktail', 'cocktails', 'aperol', 'spritz', 'margarita', 'mojito',
  'liqueur', 'shots', 'shot', 'sangria', 'martini', 'negroni', 'bourbon',
  'baileys', 'jager', 'jägermeister', 'amaretto', 'sambuca',
];

const NON_ALCOHOL_KEYWORDS = [
  'soft drink', 'soft drinks', 'softs', 'tea', 'coffee', 'cappuccino',
  'latte', 'americano', 'espresso', 'macchiato', 'mocha', 'flat white',
  'water', 'juice', 'coke', 'cola', 'fanta', 'sprite', '7up', 'seven up',
  'lemonade', 'mocktail', 'smoothie', 'milkshake', 'hot chocolate',
  'iced tea', 'iced coffee', 'kids drink',
];

function normalise(value: string | null | undefined): string {
  return (value || '').toString().toLowerCase().trim();
}

function containsAny(haystacks: string[], needles: string[]): boolean {
  return needles.some((n) => haystacks.some((h) => h.includes(n)));
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

  // 3. Alcohol keywords are a very strong drink signal even without a dept match
  if (containsAny([dept, nm], ALCOHOL_KEYWORDS)) return 'drink';

  // 4. Drink department wins over food
  if (looksLikeDrinkDept) return 'drink';
  if (looksLikeFoodDept) return 'food';

  return 'other';
}

export function inferDrinkType(
  department: string | null | undefined,
  name?: string | null,
): DrinkType {
  const dept = normalise(department);
  const nm = normalise(name);
  if (containsAny([dept, nm], ALCOHOL_KEYWORDS)) return 'alcoholic';
  if (containsAny([dept, nm], NON_ALCOHOL_KEYWORDS)) return 'non_alcoholic';
  return 'unknown';
}

export const ITEM_TYPES: PosItemType[] = ['food', 'drink', 'side', 'modifier', 'other'];

export const ITEM_TYPE_LABEL: Record<PosItemType, string> = {
  food: 'Food',
  drink: 'Drink',
  side: 'Side',
  modifier: 'Modifier',
  other: 'Other',
};

export const DRINK_TYPE_LABEL: Record<DrinkType, string> = {
  alcoholic: 'Alcoholic',
  non_alcoholic: 'Non-alcoholic',
  unknown: 'Unknown',
};
