import { useState } from "react";
import { CreatableSelect } from "@/components/common/CreatableSelect";
import { QuickAddInventoryItemDialog } from "@/components/inventory/QuickAddInventoryItemDialog";
import { useIngredients, isRecipeIngredient, itemTypeLabel } from "@/hooks/useIngredients";

interface Props {
  value: string | undefined;
  onValueChange: (value: string) => void;
  /** Restrict to items valid inside dish recipes. */
  recipeOnly?: boolean;
  placeholder?: string;
  noneOption?: { value: string; label: string };
  disabled?: boolean;
  triggerClassName?: string;
}

/**
 * Inventory item selector with the shared "create on the spot" pattern.
 * General stock / count / adjustment selectors show every inventory item;
 * recipe selectors pass `recipeOnly` so only recipe ingredients are offered.
 */
export function InventoryItemSelect({
  value,
  onValueChange,
  recipeOnly,
  placeholder = "Select inventory item",
  noneOption,
  disabled,
  triggerClassName,
}: Props) {
  const { data: items = [] } = useIngredients();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const visible = recipeOnly ? items.filter(isRecipeIngredient) : items;

  return (
    <>
      <CreatableSelect
        value={value}
        onValueChange={onValueChange}
        options={visible.map((i) => ({
          value: i.id,
          label: recipeOnly ? i.name : `${i.name} — ${itemTypeLabel(i.item_type)}`,
        }))}
        noneOption={noneOption}
        placeholder={placeholder}
        createLabel={recipeOnly ? "Add new ingredient" : "Add new inventory item"}
        onCreateNew={() => setQuickAddOpen(true)}
        disabled={disabled}
        triggerClassName={triggerClassName}
      />
      <QuickAddInventoryItemDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        fixedItemType={recipeOnly ? "recipe_ingredient" : undefined}
        onCreated={(id) => onValueChange(id)}
      />
    </>
  );
}
