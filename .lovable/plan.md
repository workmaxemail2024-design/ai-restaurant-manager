# Manageable Dish Categories

## What exists today (inspected, nothing changed)

- **No category table.** Each dish stores its category as plain text (`dishes.category`).
- **Add/Edit Dish uses a fixed list in the app code:** Appetizers, Mains, Desserts, Beverages, Sides, Other. That is why **Starters never appeared**, even though 25 of your dishes are already in "Starters". Those came from the Captiva import, which writes the POS department name as the category text.
- The page groups and filters dishes by whatever text is on each dish, and orders them with a second fixed list.
- Your restaurant currently has about 45 distinct category names. Several are near-duplicates: White Wine / White Wines, Red Wine / Red Wines, Tea+Coffee / Tea +Coffee, Kids / Kids Menu, Sides / Side Dishes, Appetizers (1 dish) / Starters.

## Approach

Add a small per-restaurant category list, and keep the text on each dish exactly as it is today. Reports, Captiva import, Menu Performance and other screens that read the category text keep working untouched.

1. **New category list per restaurant** (name, order, archived). It is seeded once from the category names already on your dishes, so nothing is lost and no dish is edited.
2. **Manage Categories** (Dishes page button) lets you add, rename, reorder (up/down, iPad-friendly), archive and restore categories.
3. **Rename** updates the list and every dish using that name in one step. Appetizers → Starters happens instantly, with no per-dish editing. If the new name already exists, you get a warning with a "Merge into existing" choice, so no duplicate is created.
4. **Delete/archive:** it shows "Used by N dishes". You can move those dishes to another category and then archive, or cancel. A category with no dishes and no sales history is deleted permanently. Otherwise it is archived: hidden from dropdowns, while existing dishes and past reports are unchanged.
5. **Add/Edit Dish dropdown** uses the restaurant's active list in your chosen order, and updates immediately after changes. The fixed list is removed.
6. **Dish Overview:** Category becomes a dropdown with Save.
7. **Dishes page** groups sections in your custom order, with anything not in the list shown last.
8. **Captiva import:** new POS departments are added to the list automatically, so imported dishes always have a matching category. Existing import logic is otherwise unchanged.

## Security

- Categories are scoped to the restaurant with the same database rules as dishes.
- Viewing requires restaurant membership.
- Adding, renaming, reordering and archiving require Menu **Edit** permission (Owner, or Managers granted it in Role Builder).
- Permanent delete requires Menu **Admin**.
- Rename, merge and move-then-archive run as single checked database actions, so they cannot touch another restaurant's dishes.

## Technical details (database change, needs your approval)

- New table `dish_categories(id, restaurant_id NOT NULL, name, sort_order, archived_at, created_at, updated_at)`, with a unique rule on (restaurant, lower(name)), grants and RLS on the pattern described above.
- Backfill: one row per distinct non-empty `dishes.category` per restaurant. Seeded order follows the current display order, then A–Z.
- Two checked database actions (security-definer, restaurant and permission verified):
  - `rename_dish_category(id, new_name, merge boolean)` updates `dishes.category` text for that restaurant.
  - `archive_dish_category(id, move_to_id nullable)` optionally moves dishes, then archives, or deletes when it is unused.
- No change to `dishes` structure, existing dish values, sales, POS data or reports.
- Frontend: `useDishCategories` hook; `ManageCategoriesDialog`; DishesPage form, grouping and filter; DishDetailDialog category editor; Captiva import upserts new department names into the list.

## Question before building

Should I also merge the obvious near-duplicates listed above? I'd only do it when you choose it in Manage Categories, and it moves those dishes' category text. By default I will not touch them.
