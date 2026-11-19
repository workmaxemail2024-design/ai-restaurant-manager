import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Settings } from "lucide-react";
import { useLocations, useCreateLocation, useUpdateLocation, useDeleteLocation, useUpdateOperatingHours, Location, LocationInsert } from "@/hooks/useLocations";
import { OperatingHoursEditor, OperatingHours } from "@/components/locations/OperatingHoursEditor";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useLocationActivity } from "@/hooks/useLocationActivity";
import { LOCATION_ACTIVITY_LABEL } from "@/lib/locationActivity";
import { LocationAccessPanel } from "@/components/locations/LocationAccessPanel";

export default function LocationsPage() {
  const { data: locations = [], isLoading } = useLocations();
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const deleteLocation = useDeleteLocation();
  const updateOperatingHours = useUpdateOperatingHours();
  
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Location | null>(null);
  const [formData, setFormData] = useState<LocationInsert>({ name: "", address: "" });
  const [hoursSheetLocation, setHoursSheetLocation] = useState<Location | null>(null);

  const activityQ = useLocationActivity(locations.map((l) => l.id));
  const activity = activityQ.data;
  const quietCount = activity ? Object.values(activity).filter((a) => a.activity !== "trading").length : 0;

  const columns = [
    { key: "name", header: "Name" },
    { key: "address", header: "Address" },
    {
      key: "timezone",
      header: "Time zone",
      render: (item: Location) => (item as any).timezone ?? "—",
    },
    {
      key: "activity",
      header: "Data",
      render: (item: Location) => {
        if (activityQ.isError) return <span className="text-xs text-destructive">Could not check</span>;
        const a = activity?.[item.id];
        if (!a) return <span className="text-xs text-muted-foreground">Checking…</span>;
        return (
          <div className="space-y-0.5">
            <Badge variant={a.activity === "trading" ? "default" : a.activity === "setup_only" ? "secondary" : "destructive"}>
              {LOCATION_ACTIVITY_LABEL[a.activity]}
            </Badge>
            <p className="text-xs text-muted-foreground">{a.sales} sales · {a.summaries} POS days · {a.staged} staged · {a.integrations} POS link{a.integrations === 1 ? "" : "s"}</p>
          </div>
        );
      },
    },
    { 
      key: "created_at", 
      header: "Created",
      render: (item: Location) => new Date(item.created_at).toLocaleDateString()
    },
    {
      key: "actions",
      header: "Hours",
      render: (item: Location) => (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setHoursSheetLocation(item);
          }}
        >
          <Settings className="h-4 w-4 mr-1" />
          {item.operating_hours ? "Edit" : "Set"}
        </Button>
      )
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      await updateLocation.mutateAsync({ id: editingItem.id, ...formData });
    } else {
      await createLocation.mutateAsync(formData);
    }
    handleClose();
  };

  const handleEdit = (item: Location) => {
    setEditingItem(item);
    setFormData({ name: item.name, address: item.address || "" });
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setEditingItem(null);
    setFormData({ name: "", address: "" });
  };

  const handleSaveHours = async (hours: OperatingHours) => {
    if (!hoursSheetLocation) return;
    await updateOperatingHours.mutateAsync({ id: hoursSheetLocation.id, operating_hours: hours });
    // Update local state to reflect changes
    setHoursSheetLocation(prev => prev ? { ...prev, operating_hours: hours } : null);
  };

  return (
    <PageLayout title="Locations" subtitle="Manage your restaurant locations and their operating hours.">
      {quietCount > 0 && (
        <div role="note" className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium">{quietCount} location record{quietCount === 1 ? " has" : "s have"} no booked sales yet.</p>
          <p className="text-muted-foreground mt-1">
            Nothing is hidden or deleted. To confirm your real restaurants, compare each row's Captiva store code, sales and POS days.
            Records you don't recognise still appear in "All locations" totals; decide what to do with them before removing anything.
          </p>
        </div>
      )}
      <div className="flex justify-end mb-4">
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Location
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Location" : "Add Location"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address || ""}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button type="submit" disabled={createLocation.isPending || updateLocation.isPending}>
                  {editingItem ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={locations}
        columns={columns}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={(item) => deleteLocation.mutate(item.id)}
      />

      <LocationAccessPanel />

      <Sheet open={!!hoursSheetLocation} onOpenChange={(open) => !open && setHoursSheetLocation(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Operating Hours - {hoursSheetLocation?.name}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {hoursSheetLocation && (
              <OperatingHoursEditor
                value={hoursSheetLocation.operating_hours}
                onSave={handleSaveHours}
                isSaving={updateOperatingHours.isPending}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}
