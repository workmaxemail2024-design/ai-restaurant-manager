import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Link2, AlertCircle } from "lucide-react";
import { useStaff, useCreateStaff, useUpdateStaff, useDeleteStaff, Staff, StaffInsert, StaffRole, StaffStatus } from "@/hooks/useStaff";
import { useLocations } from "@/hooks/useLocations";
import { usePOSMappings, useUpdatePOSMapping } from "@/hooks/usePOS";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/usePermissions";

const roles: StaffRole[] = ["chef", "waiter", "manager", "host", "bartender", "kitchen_assistant", "cleaner"];
const statuses: StaffStatus[] = ["active", "inactive", "on_leave"];

export default function StaffPage() {
  const { data: staff = [], isLoading } = useStaff();
  const { data: locations = [] } = useLocations();
  const { data: posMappings = [] } = usePOSMappings(undefined, "captiva");
  const { hasPermission } = usePermissions();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();
  const updateMapping = useUpdatePOSMapping();

  const canEditPOSMapping = hasPermission("staff", "admin") || hasPermission("pos", "admin");

  const [open, setOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [form, setForm] = useState<StaffInsert>({
    first_name: "",
    last_name: "",
    role: "waiter",
    hourly_rate: 0,
    status: "active",
    location_id: null,
    email: null,
    phone: null,
    captiva_operator_code: null,
  });

  // Get unmapped staff from POS
  const staffMappings = posMappings.filter(m => m.mapping_type === "staff");
  const unmappedStaffMappings = staffMappings.filter(m => !m.is_verified);

  const resetForm = () => {
    setForm({ first_name: "", last_name: "", role: "waiter", hourly_rate: 0, status: "active", location_id: null, email: null, phone: null, captiva_operator_code: null });
    setEditingStaff(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingStaff) {
      await updateStaff.mutateAsync({ id: editingStaff.id, ...form });
    } else {
      await createStaff.mutateAsync(form);
    }
    setOpen(false);
    resetForm();
  };

  const handleEdit = (item: Staff) => {
    setEditingStaff(item);
    setForm({
      first_name: item.first_name,
      last_name: item.last_name,
      role: item.role,
      hourly_rate: item.hourly_rate,
      status: item.status,
      location_id: item.location_id,
      email: item.email,
      phone: item.phone,
      captiva_operator_code: item.captiva_operator_code,
    });
    setOpen(true);
  };

  const handleMapStaff = (mappingId: string, staffId: string) => {
    updateMapping.mutate({ id: mappingId, internal_id: staffId, is_verified: true });
  };

  const columns = [
    { key: "first_name", header: "First Name" },
    { key: "last_name", header: "Last Name" },
    { 
      key: "role", 
      header: "Role",
      render: (item: Staff) => (
        <Badge variant="outline" className="capitalize">{item.role.replace("_", " ")}</Badge>
      )
    },
    { 
      key: "status", 
      header: "Status",
      render: (item: Staff) => (
        <Badge variant={item.status === "active" ? "default" : "secondary"} className="capitalize">
          {item.status.replace("_", " ")}
        </Badge>
      )
    },
    { key: "hourly_rate", header: "Hourly Rate", render: (item: Staff) => `$${item.hourly_rate.toFixed(2)}` },
    { key: "location", header: "Location", render: (item: Staff) => item.locations?.name || "-" },
    {
      key: "pos_mapping",
      header: "POS Mapping",
      render: (item: Staff) => (
        item.captiva_operator_code ? (
          <Badge variant="default" className="bg-green-500/20 text-green-700">
            <Link2 className="h-3 w-3 mr-1" />{item.captiva_operator_code}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-amber-600">
            <AlertCircle className="h-3 w-3 mr-1" />Unmapped
          </Badge>
        )
      )
    },
  ];

  return (
    <PageLayout
      title="Staff Management"
      description="Manage your team members"
      action={
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Staff</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingStaff ? "Edit Staff" : "Add New Staff"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as StaffRole })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as StaffStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statuses.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Hourly Rate ($)</Label>
                  <Input type="number" step="0.01" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select value={form.location_id || "_none"} onValueChange={(v) => setForm({ ...form, location_id: v === "_none" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No location</SelectItem>
                      {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value || null })} />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value || null })} />
                </div>
              </div>
              {canEditPOSMapping && (
                <div className="space-y-2">
                  <Label>Captiva Operator Code</Label>
                  <Input 
                    value={form.captiva_operator_code || ""} 
                    onChange={(e) => setForm({ ...form, captiva_operator_code: e.target.value || null })} 
                    placeholder="e.g., OP001"
                  />
                  <p className="text-xs text-muted-foreground">Used for POS staff mapping</p>
                </div>
              )}
              <Button type="submit" className="w-full">{editingStaff ? "Update" : "Create"} Staff</Button>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <Tabs defaultValue="staff" className="space-y-4">
        <TabsList>
          <TabsTrigger value="staff">Staff List</TabsTrigger>
          <TabsTrigger value="mapping" className="relative">
            POS Mapping
            {unmappedStaffMappings.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {unmappedStaffMappings.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff">
          <DataTable
            data={staff}
            columns={columns}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDelete={(item) => deleteStaff.mutate(item.id)}
          />
        </TabsContent>

        <TabsContent value="mapping">
          <Card>
            <CardHeader>
              <CardTitle>Staff POS Mapping</CardTitle>
              <CardDescription>Map Captiva operator codes to your staff members</CardDescription>
            </CardHeader>
            <CardContent>
              {staffMappings.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No staff imported from POS yet. Run a sync first.
                </p>
              ) : (
                <div className="space-y-3">
                  {staffMappings.map(mapping => (
                    <div key={mapping.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{mapping.external_name || mapping.external_id}</p>
                        <p className="text-sm text-muted-foreground">Code: {mapping.external_id}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {mapping.is_verified ? (
                          <Badge variant="default" className="bg-green-500">Mapped</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-amber-600">
                            <AlertCircle className="h-3 w-3 mr-1" />Unmapped
                          </Badge>
                        )}
                        <Select 
                          value={mapping.internal_id || ""} 
                          onValueChange={v => handleMapStaff(mapping.id, v)}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Select staff member" />
                          </SelectTrigger>
                          <SelectContent>
                            {staff.map(s => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.first_name} {s.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
