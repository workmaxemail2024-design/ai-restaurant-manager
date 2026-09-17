import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { useMissingCostDishes } from "@/hooks/useFoodCosting";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string;
  endDate: string;
  locationId: string | null;
  label: string;
}

/** Names the sold items behind the "missing cost" count so they can be fixed. */
export function MissingCostsDialog({
  open,
  onOpenChange,
  startDate,
  endDate,
  locationId,
  label,
}: Props) {
  const { data: items = [], isLoading } = useMissingCostDishes(
    startDate,
    endDate,
    locationId,
    open
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Items missing cost — {label}</DialogTitle>
          <DialogDescription>
            These items were sold but have no recipe and no direct cost, so their cost is
            estimated rather than calculated.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 text-sm text-muted-foreground text-center">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground text-center">
            Every sold item has a cost setup.
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate">{item.name}</span>
                <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                  {item.quantity} × · {formatCurrency(item.revenue)}
                </span>
              </div>
            ))}
          </div>
        )}

        <Button asChild variant="outline" className="w-full h-11">
          <Link to="/dishes" onClick={() => onOpenChange(false)}>
            Add recipes on the Dishes page
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
