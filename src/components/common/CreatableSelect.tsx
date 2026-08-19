import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const CREATE_NEW_VALUE = "__create_new__";

export interface CreatableSelectOption {
  value: string;
  label: string;
}

interface CreatableSelectProps {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: CreatableSelectOption[];
  placeholder?: string;
  /** Optional "no selection" entry rendered first. */
  noneOption?: { value: string; label: string };
  /** Label of the secondary create action, e.g. "Add new supplier". */
  createLabel: string;
  onCreateNew: () => void;
  disabled?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
}

/**
 * Reusable "create on the spot" selector: selecting an existing record stays the
 * primary action, with a clearly secondary "+ Add new ..." entry at the bottom.
 */
export function CreatableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  noneOption,
  createLabel,
  onCreateNew,
  disabled,
  triggerClassName,
  contentClassName,
}: CreatableSelectProps) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        if (v === CREATE_NEW_VALUE) {
          onCreateNew();
          return;
        }
        onValueChange(v);
      }}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={cn(contentClassName)}>
        {noneOption && <SelectItem value={noneOption.value}>{noneOption.label}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={CREATE_NEW_VALUE} className="text-primary">
          <span className="flex items-center gap-2">
            <Plus className="h-3.5 w-3.5" />
            {createLabel}
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
