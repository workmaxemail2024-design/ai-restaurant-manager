import { useState } from "react";
import { Plus, Clock, Pencil, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Menu, useMenus, useArchiveMenu, useRestoreMenu, useMenuDishCounts } from "@/hooks/useMenus";
import { MenuEditDialog } from "./MenuEditDialog";
import { useLocation } from "@/contexts/LocationContext";
import { cn } from "@/lib/utils";

interface MenuSelectorProps {
  selectedMenuId: string | null;
  onMenuSelect: (menuId: string | null) => void;
}

const dayLabels: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${minutes}${ampm}`;
}

function getDaysDisplay(days: string[]): string {
  const sortedDays = [...days].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
  const isAllWeekdays = sortedDays.length === 5 && 
    sortedDays.every(d => ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(d));
  const isWeekend = sortedDays.length === 2 && 
    sortedDays.every(d => ["saturday", "sunday"].includes(d));
  const isEveryDay = sortedDays.length === 7;

  if (isEveryDay) return "Daily";
  if (isAllWeekdays) return "Weekdays";
  if (isWeekend) return "Weekends";
  return sortedDays.map(d => dayLabels[d]).join(", ");
}

export function MenuSelector({ selectedMenuId, onMenuSelect }: MenuSelectorProps) {
  const { selectedLocationId } = useLocation();
  const { data: menus = [], isLoading } = useMenus(selectedLocationId, "active");
  const { data: dishCounts = {} } = useMenuDishCounts();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);

  const handleEditMenu = (e: React.MouseEvent, menu: Menu) => {
    e.stopPropagation();
    setEditingMenu(menu);
    setEditDialogOpen(true);
  };

  const handleAddMenu = () => {
    setEditingMenu(null);
    setEditDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-20 w-40 flex-shrink-0 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {/* All Dishes Card */}
        <button
          onClick={() => onMenuSelect(null)}
          className={cn(
            "flex-shrink-0 min-w-[140px] rounded-lg border p-3 text-left transition-all",
            "hover:shadow-md hover:border-primary/50",
            selectedMenuId === null
              ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
              : "border-border bg-card"
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <UtensilsCrossed className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">All Dishes</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Show complete menu
          </p>
        </button>

        {/* Menu Cards */}
        {menus.map(menu => {
          const dishCount = dishCounts[menu.id] || 0;
          const isSelected = selectedMenuId === menu.id;
          
          return (
            <button
              key={menu.id}
              onClick={() => onMenuSelect(menu.id)}
              className={cn(
                "group flex-shrink-0 min-w-[160px] max-w-[200px] rounded-lg border p-3 text-left transition-all relative",
                "hover:shadow-md hover:border-primary/50",
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                  : "border-border bg-card"
              )}
            >
              {/* Edit button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => handleEditMenu(e, menu)}
              >
                <Pencil className="h-3 w-3" />
              </Button>

              {/* Menu Name */}
              <h3 className="font-medium text-sm truncate pr-6 mb-1">
                {menu.name}
              </h3>

              {/* Schedule info */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                <Clock className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">
                  {formatTime(menu.start_time)}–{formatTime(menu.end_time)}
                </span>
              </div>

              {/* Days + Dish count */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground truncate">
                  {getDaysDisplay(menu.days)}
                </span>
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 flex-shrink-0">
                  {dishCount}
                </Badge>
              </div>
            </button>
          );
        })}

        {/* Add Menu Card */}
        <button
          onClick={handleAddMenu}
          className={cn(
            "flex-shrink-0 min-w-[120px] rounded-lg border border-dashed p-3",
            "flex flex-col items-center justify-center gap-1.5",
            "text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all"
          )}
        >
          <Plus className="h-5 w-5" />
          <span className="text-xs font-medium">Add Menu</span>
        </button>
      </div>

      <MenuEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        menu={editingMenu}
      />
    </>
  );
}
