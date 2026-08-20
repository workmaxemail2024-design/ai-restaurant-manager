import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PRODUCT_CLASS_LABEL,
  PRODUCT_CLASS_OPTIONS,
  type ProductClass,
} from '@/lib/productClassification';

const CLASS_STYLE: Record<ProductClass, string> = {
  food: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  drink_alcoholic: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
  drink_non_alcoholic: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
  drink: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  side: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  modifier: 'bg-muted text-muted-foreground border-border',
  other: 'bg-muted text-muted-foreground border-border',
};

interface ProductTypeBadgeProps {
  value: ProductClass;
  /** true = manually confirmed, false = automatically inferred suggestion */
  isManual: boolean;
  onChange: (next: ProductClass) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Clickable Type badge. Shared by Menu Performance and Product Intelligence so
 * both always read and write the same canonical classification.
 */
export function ProductTypeBadge({
  value,
  isManual,
  onChange,
  disabled,
  className,
}: ProductTypeBadgeProps) {
  const unclassified = !isManual && (value === 'other' || value === 'drink');

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-medium',
        CLASS_STYLE[value],
        unclassified && 'border-dashed',
        !disabled && 'cursor-pointer hover:opacity-80',
        className,
      )}
    >
      {PRODUCT_CLASS_LABEL[value]}
      {isManual ? (
        <Check className="h-3 w-3 opacity-70" />
      ) : (
        <Sparkles className="h-3 w-3 opacity-60" />
      )}
      {!disabled && <ChevronDown className="h-3 w-3 opacity-60" />}
    </Badge>
  );

  if (disabled) {
    return <span title="No canonical POS product linked — cannot classify">{badge}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Change product type">{badge}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[60]">
        <DropdownMenuLabel className="text-xs">
          {isManual ? 'Manually confirmed' : 'Auto-suggested'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PRODUCT_CLASS_OPTIONS.map((c) => (
          <DropdownMenuItem key={c} onClick={() => onChange(c)}>
            <span className="flex items-center gap-2">
              {PRODUCT_CLASS_LABEL[c]}
              {value === c && <Check className="h-3 w-3" />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
