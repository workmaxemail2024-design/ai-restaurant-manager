import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { RequirePermission } from "@/components/RequirePermission";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Euro, Building2, CalendarClock, MapPin } from "lucide-react";
import { format } from "date-fns";
import { useLocation as useLocationContext } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import {
  useOverheads, useCreateOverhead, useUpdateOverhead, useDeleteOverhead,
  OVERHEAD_CATEGORIES, OVERHEAD_FREQUENCIES, ALLOCATION_MODES,
  FREQUENCY_LABELS, ALLOCATION_LABELS, toMonthlyAmount,
  type Overhead, type OverheadCategory, type OverheadFrequency, type AllocationMode,
} from "@/hooks/useOverheads";
import { formatCurrency } from "@/lib/currency";

interface OverheadFormData {
  name: string;
  category: OverheadCategory;
  amount: string;
  frequency: OverheadFrequency;
  location_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  allocation_mode: AllocationMode;
  allocation_details: Record<string, string>;
}

const defaultFormData: OverheadFormData = {
  name: "", category: "Other", amount: "", frequency: "monthly",
  location_id: "all", start_date: "", end_date: "", is_active: true,
  allocation_mode: "equal", allocation_details: {},
};

function SummaryTotals({ overheads }: { overheads: Overhead[] }) {
  const activeOverheads = overheads.filter((o) => o.is_active);
  const recurringOverheads = activeOverheads.filter(o => o.frequency !== 'one_time');
  const oneTimeOverheads = activeOverheads.filter(o => o.frequency === 'one_time');

  const monthlyTotal = recurringOverheads.reduce((sum, o) => sum + toMonthlyAmount(o.amount, o.frequency), 0);
  const dailyEquivalent = monthlyTotal / 30;
  const oneTimeTotal = oneTimeOverheads.reduce((sum, o) => sum + o.amount, 0);

  return (
    <div className="flex items-center gap-6 p-4 bg-muted/50 rounded-lg border flex-wrap">
      <div>
        <p className="text-sm text-muted-foreground">Monthly Recurring</p>
        <p className="text-xl font-semibold">{formatCurrency(monthlyTotal)}</p>
      </div>
      <div className="h-8 w-px bg-border" />
      <div>
        <p className="text-sm text-muted-foreground">Daily Equivalent</p>
        <p className="text-xl font-semibold">{formatCurrency(dailyEquivalent)}</p>
      </div>
      {oneTimeTotal > 0 && (
        <>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="text-sm text-muted-foreground">One-time Costs</p>
            <p className="text-xl font-semibold">{formatCurrency(oneTimeTotal)}</p>
          </div>
        </>
      )}
      <div className="ml-auto text-sm text-muted-foreground">
        {activeOverheads.length} active / {overheads.length} total
      </div>
    </div>
  );
}

function OverheadsContent() {
  const { selectedLocationId } = useLocationContext();
  const { data: overheads, isLoading } = useOverheads(selectedLocationId);
  const { data: locations } = useLocations();
  const createOverhead = useCreateOverhead();
  const updateOverhead = useUpdateOverhead();
  const deleteOverhead = useDeleteOverhead();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOverhead, setEditingOverhead] = useState<Overhead | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState<OverheadFormData>(defaultFormData);

  const openCreateDialog = () => {
    setEditingOverhead(null);
    setFormData({ ...defaultFormData, location_id: selectedLocationId || "all" });
    setIsDialogOpen(true);
  };

  const openEditDialog = (overhead: Overhead) => {
    setEditingOverhead(overhead);
    const details: Record<string, string> = {};
    if (overhead.allocation_details) {
      Object.entries(overhead.allocation_details).forEach(([k, v]) => {
        details[k] = String(v);
      });
    }
    setFormData({
      name: overhead.name, category: overhead.category,
      amount: overhead.amount.toString(), frequency: overhead.frequency,
      location_id: overhead.location_id || "all",
      start_date: overhead.start_date || "", end_date: overhead.end_date || "",
      is_active: overhead.is_active,
      allocation_mode: overhead.allocation_mode || 'equal',
      allocation_details: details,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(formData.amount);
    if (!formData.name.trim() || isNaN(parsedAmount) || parsedAmount < 0) return;

    const allocationDetails: Record<string, number> = {};
    Object.entries(formData.allocation_details).forEach(([k, v]) => {
      allocationDetails[k] = parseFloat(v) || 0;
    });

    const isGlobal = formData.location_id === "all";

    const payload = {
      name: formData.name.trim(),
      category: formData.category,
      amount: parsedAmount,
      frequency: formData.frequency,
      location_id: isGlobal ? null : formData.location_id,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      is_active: formData.is_active,
      allocation_mode: isGlobal ? formData.allocation_mode : ('single' as AllocationMode),
      allocation_details: isGlobal ? allocationDetails : {},
    };

    if (editingOverhead) {
      await updateOverhead.mutateAsync({ id: editingOverhead.id, ...payload });
    } else {
      await createOverhead.mutateAsync(payload);
    }

    setIsDialogOpen(false);
    setFormData(defaultFormData);
    setEditingOverhead(null);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteOverhead.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const getCategoryColor = (category: OverheadCategory) => {
    const colors: Record<string, string> = {
      Rent: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      Utilities: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      Insurance: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      Marketing: "bg-pink-500/10 text-pink-500 border-pink-500/20",
      Software: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
      Licences: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
      Waste: "bg-orange-500/10 text-orange-500 border-orange-500/20",
      Internet: "bg-teal-500/10 text-teal-500 border-teal-500/20",
      Other: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    };
    return colors[category] || colors.Other;
  };

  const isGlobalSelected = formData.location_id === "all";
  const showAllocationMode = isGlobalSelected && (locations?.length || 0) > 1;

  return (
    <PageLayout
      title="Overheads"
      description="Recurring fixed costs used for profit and break-even calculations"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Euro className="h-4 w-4" />
            <span>{overheads?.length || 0} overhead{overheads?.length !== 1 ? "s" : ""} configured</span>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Overhead
          </Button>
        </div>

        {!isLoading && overheads && overheads.length > 0 && (
          <SummaryTotals overheads={overheads} />
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : overheads?.length === 0 ? (
          <div className="border border-dashed rounded-lg p-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No overheads configured</h3>
            <p className="text-muted-foreground mb-4">
              Add fixed costs like rent, utilities, and subscriptions to calculate accurate profit margins.
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Overhead
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead className="text-right">Amount (€)</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overheads?.map((overhead) => (
                  <TableRow key={overhead.id} className={!overhead.is_active ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{overhead.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getCategoryColor(overhead.category)}>
                        {overhead.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <CalendarClock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{FREQUENCY_LABELS[overhead.frequency]}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(overhead.amount)}
                    </TableCell>
                    <TableCell>
                      {overhead.location_id ? (
                        <span className="text-sm flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {overhead.locations?.name || "Unknown"}
                        </span>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          All ({ALLOCATION_LABELS[overhead.allocation_mode] || 'Equal'})
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={overhead.is_active ? "default" : "secondary"}>
                        {overhead.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {overhead.start_date ? format(new Date(overhead.start_date), "dd MMM yy") : "—"}
                      {overhead.end_date ? ` → ${format(new Date(overhead.end_date), "dd MMM yy")}` : ""}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(overhead)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(overhead.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>{editingOverhead ? "Edit Overhead" : "Add Overhead"}</DialogTitle>
            <DialogDescription>
              {editingOverhead
                ? "Update the overhead details below."
                : "Add a recurring or one-time cost to track in profit calculations."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name" value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Monthly Rent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v: OverheadCategory) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OVERHEAD_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Frequency *</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(v: OverheadFrequency) => setFormData({ ...formData, frequency: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OVERHEAD_FREQUENCIES.map((freq) => (
                      <SelectItem key={freq} value={freq}>{FREQUENCY_LABELS[freq]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Amount (€) *</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label>Location</Label>
                <Select
                  value={formData.location_id}
                  onValueChange={(v) => setFormData({ ...formData, location_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="All Locations" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations?.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Allocation mode - only for global overheads with multiple locations */}
            {showAllocationMode && (
              <div className="grid gap-2">
                <Label>Allocation Method</Label>
                <Select
                  value={formData.allocation_mode}
                  onValueChange={(v: AllocationMode) => setFormData({ ...formData, allocation_mode: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equal">Equal split across all locations</SelectItem>
                    <SelectItem value="percentage">Percentage split per location</SelectItem>
                    <SelectItem value="manual">Manual amount per location</SelectItem>
                  </SelectContent>
                </Select>

                {/* Percentage / Manual inputs per location */}
                {(formData.allocation_mode === 'percentage' || formData.allocation_mode === 'manual') && locations && (
                  <div className="border rounded-md p-3 space-y-2 mt-1">
                    <p className="text-xs text-muted-foreground">
                      {formData.allocation_mode === 'percentage'
                        ? 'Enter the % allocated to each location (should total 100%)'
                        : `Enter the ${FREQUENCY_LABELS[formData.frequency].toLowerCase()} amount for each location`}
                    </p>
                    {locations.map((loc) => (
                      <div key={loc.id} className="flex items-center gap-2">
                        <span className="text-sm flex-1 truncate">{loc.name}</span>
                        <Input
                          type="number" min="0" step={formData.allocation_mode === 'percentage' ? "1" : "0.01"}
                          className="w-24 h-8 text-sm"
                          placeholder={formData.allocation_mode === 'percentage' ? "%" : "€"}
                          value={formData.allocation_details[loc.id] || ""}
                          onChange={(e) => setFormData({
                            ...formData,
                            allocation_details: { ...formData.allocation_details, [loc.id]: e.target.value },
                          })}
                        />
                        <span className="text-xs text-muted-foreground w-4">
                          {formData.allocation_mode === 'percentage' ? '%' : '€'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start Date {formData.frequency === 'one_time' ? '*' : '(optional)'}</Label>
                <Input
                  type="date" value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>End Date (optional)</Label>
                <Input
                  type="date" value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch
                id="is_active" checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.name.trim() || !formData.amount ||
                (formData.frequency === 'one_time' && !formData.start_date) ||
                createOverhead.isPending || updateOverhead.isPending
              }
            >
              {createOverhead.isPending || updateOverhead.isPending
                ? "Saving..."
                : editingOverhead ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Overhead?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this overhead from your financial calculations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteOverhead.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}

export default function OverheadsPage() {
  return (
    <RequirePermission resource="settings" action="view" redirectTo="/">
      <OverheadsContent />
    </RequirePermission>
  );
}
