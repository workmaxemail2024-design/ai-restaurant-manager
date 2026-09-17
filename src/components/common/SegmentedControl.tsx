import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface Props<T extends string> {
  value: T | null;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Accessible group label. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Accessible segmented choice. Selection is exposed as a radio group (not colour
 * alone) and the selected segment carries the persistent primary fill, while
 * hovering an unselected segment gives a subtle primary tint.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: Props<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex gap-2", className)}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (value == null && o === options[0]) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const i = options.findIndex((x) => x.value === value);
                const next = e.key === "ArrowRight" ? i + 1 : i - 1;
                const target = options[(next + options.length) % options.length];
                if (target) onChange(target.value);
              }
            }}
            className={cn(
              "flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                : "border-input bg-background text-foreground hover:border-primary/60 hover:bg-primary/10 hover:text-foreground",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
