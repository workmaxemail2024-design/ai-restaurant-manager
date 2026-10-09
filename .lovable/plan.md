# Inline cell editing on Inventory Items

## What you will get

- **Click to edit** cells in the existing table, with the same look as today. A thin dotted underline appears only for users who can edit.
  - **Group, Category, Item Type, Storage, Supplier**: a compact dropdown (44px+ rows for iPad) with the existing valid options. Choosing one saves at once. Category is limited to the item's group, as in the pencil editor.
  - **Name**: a text box. Enter saves, Escape or clicking away cancels. Blank names are rejected.
  - **Unit** and **Pack Size**: a small confirm panel instead of an instant save (see Safety rules).
  - **Costs** (cost per pack and base cost) stay **pencil-editor only**. The pencil editor is already the safe price workflow, so I'm not duplicating it.
- **Saving feedback**: a small spinner in the cell while saving. If the save fails, the cell goes back to its old value and a short error message appears.
- **Read-only users** see the plain table with no edit affordances, and the pencil and delete buttons stay as they are today. Archived view stays read-only.
- **Base cost precision**: small values show enough decimals, e.g. €3.50/kg shows as **€0.0035/g**, with the per-kg/per-L figure underneath. Pack Size uses the same rule.

## Safety rules for Unit and Pack Size

How it works today (checked in the database): changing pack size, pack unit or unit lets the existing price-history trigger record **one new dated price from today**. Past history is never rewritten.

- The confirm panel shows **before → after base cost** and how many recipe lines and stock records use the item. Nothing is saved until you press Confirm.
- **Pack Size**: cost per pack is kept as-is. If the per-g/ml/each cost would change, the panel says so explicitly, e.g. "€0.0035/g → €0.0070/g from today".
- **Unit**: only changes within the same kind are offered (kg/g/oz, L/ml, each). Changing between weight, volume and count (e.g. kg → each) is blocked inline if the item has recipe lines, stock or price history. Those changes still go through the pencil editor. Stock quantities are never converted or changed.

## Something you should know (security)

Server-side, the inventory table currently only checks that the user belongs to the restaurant. It does **not** check Inventory Edit permission, and neither does today's pencil editor. This build hides all editing in the app for read-only users. Truly enforcing it on the server needs a small database change: requiring the existing `can_edit_inventory` check for changes to inventory items. I can propose that as a separate migration for your approval. It's not included here, since you asked to avoid database changes.

## Not changing

No database changes. Price-history rules, recipe costing, stock quantities and the import process are unchanged. The pencil editor and delete/archive work as before.

## Technical details

- `formatUnitCost(value)` in `src/lib/currency.ts`: 2 decimals at €1 and above, otherwise up to 4 significant digits (€0.0035, €0.00042). Used for the Base Cost column and the editor's calculated cost.
- New `src/components/inventory/InlineEditCell.tsx` variants (select / text / custom popover), built on Popover + Command with large touch rows. Saves through the existing `useUpdateIngredient` with partial updates (`{ id, field }`). Its success toast is suppressed for inline saves via a silent flag; errors are shown inline and the row is reverted by invalidating the `["ingredients"]` query after an optimistic update.
- Supplier options come from existing `useSuppliers` (restaurant-scoped), including "None".
- Unit/Pack confirm uses the existing `ingredient_dependencies` RPC for usage counts and `calculateBaseCost`/`getBaseUnit` for before/after.
- Permission: `hasFullAccess() || hasPermission("inventory","edit")`, the same check already used on this page.
- `DataTable`: columns gain an optional `onCellClick`-free render. The cell renderers handle editing themselves, so `DataTable` itself is unchanged.
- Verification: unit test for `formatUnitCost` (3.5/1000 → €0.0035). Code-level checks of the save, revert and permission paths. A signed-in browser test isn't possible in this project's setup.
