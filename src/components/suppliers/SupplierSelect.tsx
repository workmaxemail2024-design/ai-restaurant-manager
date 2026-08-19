import { useState } from "react";
import { CreatableSelect } from "@/components/common/CreatableSelect";
import { useSuppliers } from "@/hooks/useSuppliers";
import { QuickAddSupplierDialog } from "@/components/suppliers/QuickAddSupplierDialog";

interface Props {
  /** Current supplier id, or the `noneValue` when nothing is selected. */
  value: string | undefined;
  onValueChange: (value: string) => void;
  /** Provide to render a "None" entry, e.g. { value: "_none", label: "No supplier" }. */
  noneOption?: { value: string; label: string };
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
}

/** Supplier selector with the shared "create on the spot" pattern. */
export function SupplierSelect({
  value,
  onValueChange,
  noneOption,
  placeholder = "Select supplier",
  disabled,
  triggerClassName,
  contentClassName,
}: Props) {
  const { data: suppliers = [] } = useSuppliers();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  return (
    <>
      <CreatableSelect
        value={value}
        onValueChange={onValueChange}
        options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        noneOption={noneOption}
        placeholder={placeholder}
        createLabel="Add new supplier"
        onCreateNew={() => setQuickAddOpen(true)}
        disabled={disabled}
        triggerClassName={triggerClassName}
        contentClassName={contentClassName}
      />
      <QuickAddSupplierDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        onCreated={(id) => onValueChange(id)}
      />
    </>
  );
}
