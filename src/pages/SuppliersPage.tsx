import { CatalogueLocations } from "@/components/inventory/CatalogueLocations";
import { useLocation } from "@/contexts/LocationContext";
import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, BarChart3, FileText, Wallet, Scale } from "lucide-react";
import { SupplierInvoicesTab } from "@/components/suppliers/SupplierInvoicesTab";
import { SupplierPaymentsTab } from "@/components/suppliers/SupplierPaymentsTab";
import { SupplierStatementsTab } from "@/components/suppliers/SupplierStatementsTab";
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, Supplier, SupplierInsert } from "@/hooks/useSuppliers";
import { SupplierAnalytics } from "@/components/suppliers/SupplierAnalytics";

export default function SuppliersPage() {
  const { selectedLocationId } = useLocation();
  return <SuppliersList key={selectedLocationId ?? "all"} locationId={selectedLocationId} />;
}

function SuppliersList({ locationId }: { locationId: string | null }) {
  const [assigned, setAssigned] = useState<string[]>([]);
  const { data: suppliers = [], isLoading, isError } = useSuppliers(locationId);
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();
  
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<SupplierInsert>({ name: "", contact_name: "", phone: "", email: "" });

  const columns = [
    { key: "name", header: "Name" },
    { key: "contact_name", header: "Contact" },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      await updateSupplier.mutateAsync({ id: editingItem.id, ...formData, assigned_location_ids: assigned });
    } else {
      await createSupplier.mutateAsync({ ...formData, assigned_location_ids: assigned });
    }
    handleClose();
  };

  const handleEdit = (item: Supplier) => {
    setEditingItem(item);
    setAssigned(item.assigned_location_ids ?? []);
    setFormData({ 
      name: item.name, 
      contact_name: item.contact_name || "", 
      phone: item.phone || "", 
      email: item.email || "" 
    });
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setEditingItem(null);
    setFormData({ name: "", contact_name: "", phone: "", email: "" });
  };

  return (
    <PageLayout title="Suppliers" subtitle="Manage suppliers and review purchasing, pricing and price history.">
      {isError && <p role="alert">Could not load the supplier list for this location.</p>}
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="list" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Suppliers
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Invoices
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Payments
          </TabsTrigger>
          <TabsTrigger value="statements" className="flex items-center gap-2">
            <Scale className="h-4 w-4" /> Statements
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
              <DialogTrigger asChild>
                <Button onClick={() => { setAssigned(locationId ? [locationId] : []); setIsOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" /> Add Supplier
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingItem ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <CatalogueLocations value={assigned} onChange={setAssigned} />
                <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact_name">Contact Name</Label>
                    <Input
                      id="contact_name"
                      value={formData.contact_name || ""}
                      onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone || ""}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email || ""}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                    <Button type="submit" disabled={createSupplier.isPending || updateSupplier.isPending}>
                      {editingItem ? "Update" : "Create"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <DataTable
            data={suppliers}
            columns={columns}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDelete={(item) => deleteSupplier.mutate(item.id)}
          />
        </TabsContent>

        <TabsContent value="invoices"><SupplierInvoicesTab /></TabsContent>
        <TabsContent value="payments">{locationId ? <p>Switch to All locations to view supplier payments recorded for the whole account.</p> : <SupplierPaymentsTab />}</TabsContent>
        <TabsContent value="statements">{locationId ? <p>Switch to All locations to view supplier statements recorded for the whole account.</p> : <SupplierStatementsTab />}</TabsContent>

        <TabsContent value="analytics">
          <SupplierAnalytics />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
