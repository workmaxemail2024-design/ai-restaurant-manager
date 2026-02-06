import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Archive, Clock, Calendar, X, Filter } from "lucide-react";
import { MenuCard } from "@/components/menus/MenuCard";
import { MenuEditDialog } from "@/components/menus/MenuEditDialog";
import { useMenus, useMenuDishCounts, useArchiveMenu, useRestoreMenu, Menu } from "@/hooks/useMenus";
import { useLocations } from "@/hooks/useLocations";
import { useLocation } from "@/contexts/LocationContext";

export default function MenusPage() {
  const { selectedLocationId } = useLocation();
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  
  const { data: menus = [], isLoading } = useMenus(
    locationFilter !== "all" ? locationFilter : (selectedLocationId || null),
    activeTab
  );
  const { data: dishCounts = {} } = useMenuDishCounts();
  const { data: locations = [] } = useLocations();
  const archiveMenu = useArchiveMenu();
  const restoreMenu = useRestoreMenu();

  // Filter menus by search
  const filteredMenus = menus.filter(menu => 
    menu.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (menu: Menu) => {
    setEditingMenu(menu);
    setIsEditOpen(true);
  };

  const handleCreate = () => {
    setEditingMenu(null);
    setIsEditOpen(true);
  };

  const handleArchive = (menuId: string) => {
    archiveMenu.mutate(menuId);
  };

  const handleRestore = (menuId: string) => {
    restoreMenu.mutate(menuId);
  };

  const handleDialogClose = () => {
    setIsEditOpen(false);
    setEditingMenu(null);
  };

  return (
    <PageLayout 
      title="Menus" 
      subtitle="Manage time-based menus like Brunch, Lunch, and Dinner"
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "archived")}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              <Clock className="h-4 w-4" />
              Active Menus
            </TabsTrigger>
            <TabsTrigger value="archived" className="gap-2">
              <Archive className="h-4 w-4" />
              Archived
            </TabsTrigger>
          </TabsList>
          
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Menu
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search menus..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearch("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map(loc => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-sm text-muted-foreground">
            {filteredMenus.length} {filteredMenus.length === 1 ? "menu" : "menus"}
          </div>
        </div>

        <TabsContent value="active" className="mt-0">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-6 w-32 mb-3" />
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-4 w-36" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredMenus.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">No Active Menus</h3>
                <p className="text-muted-foreground mb-4">
                  {search 
                    ? "No menus match your search" 
                    : "Create your first menu to organize dishes by time of day"}
                </p>
                {!search && (
                  <Button onClick={handleCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Menu
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMenus.map(menu => (
                <MenuCard
                  key={menu.id}
                  menu={menu}
                  dishCount={dishCounts[menu.id] || 0}
                  onEdit={() => handleEdit(menu)}
                  onArchive={() => handleArchive(menu.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="archived" className="mt-0">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2].map(i => (
                <Card key={i} className="opacity-60">
                  <CardContent className="p-4">
                    <Skeleton className="h-6 w-32 mb-3" />
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-4 w-36" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredMenus.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Archive className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">No Archived Menus</h3>
                <p className="text-muted-foreground">
                  Archived menus are preserved for historical reference
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMenus.map(menu => (
                <MenuCard
                  key={menu.id}
                  menu={menu}
                  dishCount={dishCounts[menu.id] || 0}
                  onEdit={() => handleEdit(menu)}
                  onRestore={() => handleRestore(menu.id)}
                  isArchived
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <MenuEditDialog
        open={isEditOpen}
        onOpenChange={handleDialogClose}
        menu={editingMenu}
      />
    </PageLayout>
  );
}
