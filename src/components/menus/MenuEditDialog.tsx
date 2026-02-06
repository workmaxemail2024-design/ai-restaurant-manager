import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Calendar, UtensilsCrossed, Search, X, Check } from "lucide-react";
import { Menu, MenuInsert, useCreateMenu, useUpdateMenu, useMenuDishes, useSetMenuDishes } from "@/hooks/useMenus";
import { useDishes } from "@/hooks/useDishes";
import { useLocations } from "@/hooks/useLocations";
import { useLocation } from "@/contexts/LocationContext";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";

interface MenuEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menu: Menu | null;
}

const daysOfWeek = [
  { id: "monday", label: "Mon" },
  { id: "tuesday", label: "Tue" },
  { id: "wednesday", label: "Wed" },
  { id: "thursday", label: "Thu" },
  { id: "friday", label: "Fri" },
  { id: "saturday", label: "Sat" },
  { id: "sunday", label: "Sun" },
];

const timePresets = [
  { label: "Breakfast", start: "06:00", end: "11:00" },
  { label: "Brunch", start: "10:00", end: "14:00" },
  { label: "Lunch", start: "11:30", end: "15:00" },
  { label: "Dinner", start: "17:00", end: "22:00" },
  { label: "All Day", start: "00:00", end: "23:59" },
];

export function MenuEditDialog({ open, onOpenChange, menu }: MenuEditDialogProps) {
  const { selectedLocationId } = useLocation();
  const { data: locations = [] } = useLocations();
  const { data: allDishes = [] } = useDishes();
  const { data: menuDishes = [] } = useMenuDishes(menu?.id || null);
  
  const createMenu = useCreateMenu();
  const updateMenu = useUpdateMenu();
  const setMenuDishes = useSetMenuDishes();
  
  const [activeTab, setActiveTab] = useState("details");
  const [dishSearch, setDishSearch] = useState("");
  
  // Form state
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("11:00");
  const [endTime, setEndTime] = useState("15:00");
  const [selectedDishIds, setSelectedDishIds] = useState<string[]>([]);
  
  // Reset form when dialog opens/closes or menu changes
  useEffect(() => {
    if (open) {
      if (menu) {
        setName(menu.name);
        setLocationId(menu.location_id);
        setSelectedDays(menu.days);
        setStartTime(menu.start_time.slice(0, 5)); // Remove seconds
        setEndTime(menu.end_time.slice(0, 5));
        // Load existing dish IDs
        const dishIds = menuDishes.map(md => md.dish_id);
        setSelectedDishIds(dishIds);
      } else {
        setName("");
        setLocationId(selectedLocationId);
        setSelectedDays(["monday", "tuesday", "wednesday", "thursday", "friday"]);
        setStartTime("11:00");
        setEndTime("15:00");
        setSelectedDishIds([]);
      }
      setActiveTab("details");
      setDishSearch("");
    }
  }, [open, menu, selectedLocationId, menuDishes]);

  const handleDayToggle = (dayId: string) => {
    setSelectedDays(prev => 
      prev.includes(dayId) 
        ? prev.filter(d => d !== dayId)
        : [...prev, dayId]
    );
  };

  const handleTimePreset = (start: string, end: string) => {
    setStartTime(start);
    setEndTime(end);
  };

  const handleDishToggle = (dishId: string) => {
    setSelectedDishIds(prev =>
      prev.includes(dishId)
        ? prev.filter(id => id !== dishId)
        : [...prev, dishId]
    );
  };

  const handleSelectAllDishes = () => {
    const visibleDishIds = filteredDishes.map(d => d.id);
    setSelectedDishIds(prev => {
      const allSelected = visibleDishIds.every(id => prev.includes(id));
      if (allSelected) {
        return prev.filter(id => !visibleDishIds.includes(id));
      } else {
        return [...new Set([...prev, ...visibleDishIds])];
      }
    });
  };

  const filteredDishes = allDishes.filter(dish => 
    dish.name.toLowerCase().includes(dishSearch.toLowerCase()) ||
    (dish.category?.toLowerCase() || "").includes(dishSearch.toLowerCase())
  );

  // Group dishes by category
  const groupedDishes = filteredDishes.reduce((acc, dish) => {
    const cat = dish.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(dish);
    return acc;
  }, {} as Record<string, typeof allDishes>);

  const handleSubmit = async () => {
    const menuData: MenuInsert = {
      name,
      location_id: locationId,
      days: selectedDays,
      start_time: startTime,
      end_time: endTime,
    };

    try {
      if (menu) {
        await updateMenu.mutateAsync({ id: menu.id, ...menuData });
        // Update dishes
        await setMenuDishes.mutateAsync({ menuId: menu.id, dishIds: selectedDishIds });
      } else {
        const newMenu = await createMenu.mutateAsync(menuData);
        // Add dishes to new menu
        if (newMenu && selectedDishIds.length > 0) {
          await setMenuDishes.mutateAsync({ menuId: newMenu.id, dishIds: selectedDishIds });
        }
      }
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isValid = name.trim() && selectedDays.length > 0 && startTime && endTime;
  const isPending = createMenu.isPending || updateMenu.isPending || setMenuDishes.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{menu ? "Edit Menu" : "Create Menu"}</DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="details" className="gap-2">
              <Clock className="h-4 w-4" />
              Details
            </TabsTrigger>
            <TabsTrigger value="dishes" className="gap-2">
              <UtensilsCrossed className="h-4 w-4" />
              Dishes
              {selectedDishIds.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {selectedDishIds.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="flex-1 overflow-auto space-y-4 mt-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Menu Name</Label>
              <Input
                id="name"
                placeholder="e.g., Lunch Menu, Weekend Brunch"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            
            {/* Location */}
            <div className="space-y-2">
              <Label>Location (optional)</Label>
              <Select value={locationId || "_all"} onValueChange={(v) => setLocationId(v === "_all" ? null : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All locations</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Days */}
            <div className="space-y-2">
              <Label>Active Days</Label>
              <div className="flex flex-wrap gap-2">
                {daysOfWeek.map(day => (
                  <Button
                    key={day.id}
                    type="button"
                    variant={selectedDays.includes(day.id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDayToggle(day.id)}
                    className="h-9 px-3"
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDays(["monday", "tuesday", "wednesday", "thursday", "friday"])}
                  className="text-xs h-7"
                >
                  Weekdays
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDays(["saturday", "sunday"])}
                  className="text-xs h-7"
                >
                  Weekends
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDays(daysOfWeek.map(d => d.id))}
                  className="text-xs h-7"
                >
                  Every Day
                </Button>
              </div>
            </div>
            
            {/* Time window */}
            <div className="space-y-2">
              <Label>Time Window</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-32"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-32"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {timePresets.map(preset => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTimePreset(preset.start, preset.end)}
                    className="text-xs h-7"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="dishes" className="flex-1 overflow-hidden flex flex-col mt-4">
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search dishes..."
                value={dishSearch}
                onChange={(e) => setDishSearch(e.target.value)}
                className="pl-10"
              />
              {dishSearch && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => setDishSearch("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            
            {/* Select all */}
            <div className="flex items-center justify-between mb-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectAllDishes}
                className="text-xs"
              >
                {filteredDishes.every(d => selectedDishIds.includes(d.id))
                  ? "Deselect All"
                  : "Select All Visible"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {selectedDishIds.length} selected
              </span>
            </div>
            
            {/* Dish list */}
            <ScrollArea className="flex-1 -mx-2 px-2">
              {Object.entries(groupedDishes).length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No dishes found
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedDishes).map(([category, dishes]) => (
                    <div key={category}>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">
                        {category}
                      </h4>
                      <div className="space-y-1">
                        {dishes.map(dish => (
                          <button
                            key={dish.id}
                            type="button"
                            onClick={() => handleDishToggle(dish.id)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                              selectedDishIds.includes(dish.id)
                                ? "bg-primary/10 border border-primary/20"
                                : "hover:bg-muted/50"
                            )}
                          >
                            <div className={cn(
                              "h-5 w-5 rounded border flex items-center justify-center flex-shrink-0",
                              selectedDishIds.includes(dish.id)
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-input"
                            )}>
                              {selectedDishIds.includes(dish.id) && (
                                <Check className="h-3 w-3" />
                              )}
                            </div>
                            <span className="flex-1 truncate">{dish.name}</span>
                            <span className="text-sm text-muted-foreground">
                              {formatCurrency(Number(dish.selling_price))}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
        
        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isPending}>
            {isPending ? "Saving..." : menu ? "Save Changes" : "Create Menu"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
