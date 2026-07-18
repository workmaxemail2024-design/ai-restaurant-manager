import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2, Eye, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DishMenuBadges } from "@/components/menus/DishMenuBadges";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import type { Dish } from "@/hooks/useDishes";

interface DishCategorySectionProps {
  category: string;
  dishes: Dish[];
  defaultExpanded?: boolean;
  onEdit: (dish: Dish) => void;
  onDelete: (dish: Dish) => void;
  onViewRecipe: (dish: Dish) => void;
  sessionKey: string;
}

// Drink sub-categories for special handling
const drinkSubCategories = ["Soft Drinks", "Cocktails", "Spirits", "Wine", "Beer", "Hot Drinks"];

export function DishCategorySection({
  category,
  dishes,
  defaultExpanded = true,
  onEdit,
  onDelete,
  onViewRecipe,
  sessionKey,
}: DishCategorySectionProps) {
  const storageKey = `dish-category-expanded-${sessionKey}-${category}`;
  const [isOpen, setIsOpen] = useState(() => {
    const stored = sessionStorage.getItem(storageKey);
    return stored !== null ? stored === "true" : defaultExpanded;
  });

  useEffect(() => {
    sessionStorage.setItem(storageKey, String(isOpen));
  }, [isOpen, storageKey]);

  // Check if this is a drinks category
  const isDrinksCategory = category.toLowerCase().includes("beverage") || 
    category.toLowerCase().includes("drink") ||
    category.toLowerCase() === "drinks";

  // Group drinks by sub-category if applicable
  const groupedDrinks = isDrinksCategory
    ? drinkSubCategories.reduce((acc, sub) => {
        const matching = dishes.filter(d => 
          d.name.toLowerCase().includes(sub.toLowerCase().replace("s", "")) ||
          (d.category?.toLowerCase() || "").includes(sub.toLowerCase())
        );
        if (matching.length > 0) {
          acc[sub] = matching;
        }
        return acc;
      }, {} as Record<string, Dish[]>)
    : null;

  // Get ungrouped drinks (ones that don't match any sub-category)
  const ungroupedDrinks = isDrinksCategory && groupedDrinks
    ? dishes.filter(d => !Object.values(groupedDrinks).flat().includes(d))
    : [];

  const hasSubGroups = groupedDrinks && Object.keys(groupedDrinks).length > 1;

  if (dishes.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-muted-foreground">{category}</span>
              <Badge variant="secondary" className="text-xs">0 items</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          No dishes in this category yet
        </CardContent>
      </Card>
    );
  }

  const renderDishRow = (dish: Dish, compact = false) => (
    <TableRow key={dish.id} className={cn("group", compact && "h-9")}>
      <TableCell className={cn("font-medium", compact ? "py-1.5" : "py-2")}>
        <div className="flex flex-col gap-1">
          <span>{dish.name}</span>
          <DishMenuBadges dishId={dish.id} maxShow={2} />
        </div>
      </TableCell>
      <TableCell className={cn("text-muted-foreground", compact ? "py-1.5" : "py-2")}>
        {dish.locations?.name || "All"}
      </TableCell>
      <TableCell className={cn(compact ? "py-1.5" : "py-2")}>
        {formatCurrency(Number(dish.selling_price))}
      </TableCell>
      <TableCell className={cn("text-muted-foreground text-sm", compact ? "py-1.5" : "py-2")}>
        {dish.has_cost ? formatCurrency(Number(dish.dish_cost || 0)) : (
          <span className="text-warning">Missing</span>
        )}
      </TableCell>
      <TableCell className={cn(compact ? "py-1.5" : "py-2")}>
        {dish.profit_margin === null || dish.profit_margin === undefined ? (
          <Badge variant="secondary" className="text-xs bg-warning/15 text-warning">Incomplete</Badge>
        ) : (
          <Badge 
            variant="secondary"
            className={cn(
              "text-xs",
              dish.profit_margin >= 60 ? "bg-success/15 text-success" : 
              dish.profit_margin >= 40 ? "bg-warning/15 text-warning" : 
              "bg-destructive/15 text-destructive"
            )}
          >
            {dish.profit_margin.toFixed(0)}%
          </Badge>
        )}
      </TableCell>
      <TableCell className={cn(compact ? "py-1.5" : "py-2")}>
        {dish.captiva_external_id ? (
          <Badge variant="secondary" className="bg-success/15 text-success font-mono text-xs">
            <Link2 className="h-3 w-3 mr-1" />{dish.captiva_external_id.slice(0, 8)}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell className={cn("text-right", compact ? "py-1.5" : "py-2")}>
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onViewRecipe(dish)}
            title="View recipe"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(dish)}
            title="Edit dish"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(dish)}
            title="Delete dish"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  const renderDishTable = (dishList: Dish[], compact = false) => (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[30%]">Name</TableHead>
          <TableHead className="w-[12%]">Location</TableHead>
          <TableHead className="w-[10%]">Price</TableHead>
          <TableHead className="w-[10%]">Cost</TableHead>
          <TableHead className="w-[10%]">Margin</TableHead>
          <TableHead className="w-[12%]">POS ID</TableHead>
          <TableHead className="w-[16%] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dishList.map(dish => renderDishRow(dish, compact))}
      </TableBody>
    </Table>
  );

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isOpen ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-lg font-semibold">{category}</span>
                <Badge variant="secondary" className="text-xs font-normal">
                  {dishes.length} {dishes.length === 1 ? "item" : "items"}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Avg margin: </span>
                <Badge 
                  variant="secondary"
                  className={cn(
                    "text-xs",
                    dishes.reduce((sum, d) => sum + (d.profit_margin || 0), 0) / dishes.length >= 60 
                      ? "bg-success/15 text-success" 
                      : "bg-warning/15 text-warning"
                  )}
                >
                  {(dishes.reduce((sum, d) => sum + (d.profit_margin || 0), 0) / dishes.length).toFixed(0)}%
                </Badge>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 px-0 pb-2">
            {hasSubGroups ? (
              <div className="space-y-4">
                {Object.entries(groupedDrinks!).map(([subCategory, subDishes]) => (
                  <div key={subCategory} className="px-4">
                    <div className="flex items-center gap-2 mb-2 pb-1 border-b border-border/50">
                      <span className="text-sm font-medium text-muted-foreground">{subCategory}</span>
                      <Badge variant="outline" className="text-xs">{subDishes.length}</Badge>
                    </div>
                    {renderDishTable(subDishes, true)}
                  </div>
                ))}
                {ungroupedDrinks.length > 0 && (
                  <div className="px-4">
                    <div className="flex items-center gap-2 mb-2 pb-1 border-b border-border/50">
                      <span className="text-sm font-medium text-muted-foreground">Other</span>
                      <Badge variant="outline" className="text-xs">{ungroupedDrinks.length}</Badge>
                    </div>
                    {renderDishTable(ungroupedDrinks, true)}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4">
                {renderDishTable(dishes, isDrinksCategory)}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
