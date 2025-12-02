import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { useLocations, useCreateLocation, useUpdateLocation, useDeleteLocation, Location, LocationInsert } from "@/hooks/useLocations";

export default function LocationsPage() {
  const { data: locations = [], isLoading } = useLocations();
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const deleteLocation = useDeleteLocation();
  
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Location | null>(null);
  const [formData, setFormData] = useState<LocationInsert>({ name: "", address: "" });

  const columns = [
    { key: "name", header: "Name" },
    { key: "address", header: "Address" },
    { 
      key: "created_at", 
      header: "Created",
      render: (item: Location) => new Date(item.created_at).toLocaleDateString()
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

  return (
    <PageLayout title="Locations" subtitle="Manage your restaurant locations">
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
    </PageLayout>
  );
}
