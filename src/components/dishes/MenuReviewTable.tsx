import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, Pencil } from "lucide-react";
import { formatCurrency, currencySymbol } from "@/lib/currency";
import { cn } from "@/lib/utils";

export interface ExtractedDish {
  id: string;
  name: string;
  category: string;
  price: number | null;
  confidence: number;
  selected: boolean;
}

const categories = ["Appetizers", "Mains", "Desserts", "Beverages", "Sides", "Salads", "Soups", "Pizza", "Pasta", "Sandwiches", "Seafood", "Grills", "Other"];

interface MenuReviewTableProps {
  dishes: ExtractedDish[];
  onDishesChange: (dishes: ExtractedDish[]) => void;
  onConfirm: (dishes: ExtractedDish[]) => void;
  onCancel: () => void;
}

export function MenuReviewTable({ dishes, onDishesChange, onConfirm, onCancel }: MenuReviewTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const selectedCount = dishes.filter(d => d.selected).length;
  const allSelected = dishes.length > 0 && selectedCount === dishes.length;
  const someSelected = selectedCount > 0 && selectedCount < dishes.length;

  const toggleSelectAll = () => {
    const newSelected = !allSelected;
    onDishesChange(dishes.map(d => ({ ...d, selected: newSelected })));
  };

  const toggleSelect = (id: string) => {
    onDishesChange(dishes.map(d => 
      d.id === id ? { ...d, selected: !d.selected } : d
    ));
  };

  const updateDish = (id: string, updates: Partial<ExtractedDish>) => {
    onDishesChange(dishes.map(d => 
      d.id === id ? { ...d, ...updates } : d
    ));
  };

  const removeDish = (id: string) => {
    onDishesChange(dishes.filter(d => d.id !== id));
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.9) return <Badge variant="default" className="bg-success/20 text-success text-xs">High</Badge>;
    if (confidence >= 0.7) return <Badge variant="default" className="bg-warning/20 text-warning text-xs">Med</Badge>;
    return <Badge variant="default" className="bg-destructive/20 text-destructive text-xs">Low</Badge>;
  };

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {dishes.length} dish{dishes.length !== 1 ? "es" : ""} found • {selectedCount} selected
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSelectAll}
            className="text-xs"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 border rounded-lg max-h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) (el as any).indeterminate = someSelected;
                  }}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Dish Name</TableHead>
              <TableHead className="w-[140px]">Category</TableHead>
              <TableHead className="w-[100px]">Price</TableHead>
              <TableHead className="w-[60px]">Conf.</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dishes.map((dish) => (
              <TableRow 
                key={dish.id} 
                className={cn(!dish.selected && "opacity-50")}
              >
                <TableCell>
                  <Checkbox
                    checked={dish.selected}
                    onCheckedChange={() => toggleSelect(dish.id)}
                  />
                </TableCell>
                <TableCell>
                  {editingId === dish.id ? (
                    <Input
                      value={dish.name}
                      onChange={(e) => updateDish(dish.id, { name: e.target.value })}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                      autoFocus
                      className="h-8"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingId(dish.id)}
                      className="text-left w-full hover:text-primary flex items-center gap-1 group"
                    >
                      <span className="truncate">{dish.name}</span>
                      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50" />
                    </button>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={dish.category}
                    onValueChange={(v) => updateDish(dish.id, { category: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground text-xs">{currencySymbol}</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={dish.price ?? ""}
                      onChange={(e) => updateDish(dish.id, { price: parseFloat(e.target.value) || 0 })}
                      className="h-8 w-16 text-xs"
                    />
                  </div>
                </TableCell>
                <TableCell>
                  {getConfidenceBadge(dish.confidence)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeDish(dish.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {dishes.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No dishes extracted
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      <div className="flex justify-between items-center pt-2 border-t">
        <p className="text-xs text-muted-foreground">
          Tip: Click dish names to edit • Adjust categories and prices before creating
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(dishes)} disabled={selectedCount === 0}>
            <Check className="h-4 w-4 mr-2" />
            Create {selectedCount} Dish{selectedCount !== 1 ? "es" : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
