import { useNavigate } from "react-router-dom";
import { Camera, Clock, Euro, Package, Plus, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  locationId: string | null;
  onSupplierDoc: () => void;
  onExpense: () => void;
  onLabour: () => void;
  onStock: () => void;
}

/**
 * Large, touch-friendly entry points to the EXISTING daily flows.
 * No new functionality — every button opens a dialog or page that already exists.
 */
export function DailyActionsBar({
  locationId,
  onSupplierDoc,
  onExpense,
  onLabour,
  onStock,
}: Props) {
  const navigate = useNavigate();

  const actions = [
    {
      key: "sales",
      label: "Enter / Review Sales",
      icon: Euro,
      primary: false,
      onClick: () => navigate("/sales"),
      disabled: false,
    },
    {
      key: "labour",
      label: "Review Labour",
      icon: Clock,
      primary: false,
      onClick: onLabour,
      disabled: false,
    },
    {
      key: "doc",
      label: "Take Photo / Upload Supplier Doc",
      icon: Camera,
      primary: true,
      onClick: onSupplierDoc,
      disabled: !locationId,
    },
    {
      key: "expense",
      label: "Add / Review Expenses",
      icon: Plus,
      primary: false,
      onClick: onExpense,
      disabled: !locationId,
    },
    {
      key: "stock",
      label: "Record Wastage / Review Stock",
      icon: Package,
      primary: false,
      onClick: onStock,
      disabled: !locationId,
    },
    {
      key: "bookings",
      label: "Review Bookings",
      icon: CalendarDays,
      primary: false,
      onClick: () => navigate("/reservations"),
      disabled: false,
    },
  ];

  return (
    <Card className="mt-4">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-base font-semibold">Daily Actions</h3>
          {!locationId && (
            <span className="text-xs text-muted-foreground">
              Select a location to record supplier docs, expenses or wastage.
            </span>
          )}
        </div>

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((a) => (
            <Button
              key={a.key}
              variant={a.primary ? "default" : "outline"}
              disabled={a.disabled}
              onClick={a.onClick}
              className={cn(
                "h-16 justify-start gap-3 px-4 text-left text-sm sm:text-base font-medium whitespace-normal"
              )}
            >
              <a.icon className="h-5 w-5 shrink-0" />
              <span className="leading-tight">{a.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
