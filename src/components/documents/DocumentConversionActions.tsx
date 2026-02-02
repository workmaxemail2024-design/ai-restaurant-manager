import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO } from "date-fns";
import { CalendarIcon, Receipt, Users, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Document } from "@/hooks/useDocuments";
import { useCreateOverhead, OVERHEAD_CATEGORIES, OVERHEAD_FREQUENCIES, OverheadCategory, OverheadFrequency } from "@/hooks/useOverheads";
import { useLocations } from "@/hooks/useLocations";
import { useStaffWithContracts, useCreateShift } from "@/hooks/useShifts";
import { formatCurrency } from "@/lib/currency";

interface DocumentConversionActionsProps {
  document: Document;
}

export function DocumentConversionActions({ document }: DocumentConversionActionsProps) {
  const [overheadDialogOpen, setOverheadDialogOpen] = useState(false);
  const [payrollDialogOpen, setPayrollDialogOpen] = useState(false);

  // Only show conversion actions for processed documents with extracted data
  const hasExtractedData = document.processing_status === "processed" && document.extracted_data;

  if (!hasExtractedData) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOverheadDialogOpen(true)}
        title="Convert to Overhead"
        className="text-primary hover:text-primary"
      >
        <Receipt className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setPayrollDialogOpen(true)}
        title="Convert to Payroll Entry"
        className="text-secondary-foreground hover:text-secondary-foreground"
      >
        <Users className="h-4 w-4" />
      </Button>

      <ConvertToOverheadDialog
        document={document}
        open={overheadDialogOpen}
        onOpenChange={setOverheadDialogOpen}
      />
      <ConvertToPayrollDialog
        document={document}
        open={payrollDialogOpen}
        onOpenChange={setPayrollDialogOpen}
      />
    </>
  );
}

// Convert to Overhead Dialog
function ConvertToOverheadDialog({
  document,
  open,
  onOpenChange,
}: {
  document: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: locations = [] } = useLocations();
  const createOverhead = useCreateOverhead();

  const extractedData = document.extracted_data as Record<string, string> | null;

  // Pre-populate from extracted data
  const [name, setName] = useState(extractedData?.vendor || extractedData?.supplier || document.filename);
  const [category, setCategory] = useState<OverheadCategory>("Other");
  const [amount, setAmount] = useState(extractedData?.total || extractedData?.amount || "");
  const [frequency, setFrequency] = useState<OverheadFrequency>("monthly");
  const [locationId, setLocationId] = useState<string>(document.location_id || "_all");
  const [startDate, setStartDate] = useState<Date | undefined>(
    document.document_date ? parseISO(document.document_date) : undefined
  );

  // Auto-detect category from document category
  const detectCategory = (): OverheadCategory => {
    const docCategory = document.category.toLowerCase();
    if (docCategory.includes("utility")) return "Utilities";
    if (docCategory.includes("rent") || docCategory.includes("lease")) return "Rent";
    return "Other";
  };

  // Reset form on open
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setName(extractedData?.vendor || extractedData?.supplier || document.filename);
      setCategory(detectCategory());
      setAmount(extractedData?.total || extractedData?.amount || "");
      setFrequency("monthly");
      setLocationId(document.location_id || "_all");
      setStartDate(document.document_date ? parseISO(document.document_date) : undefined);
    }
    onOpenChange(newOpen);
  };

  const handleConfirm = async () => {
    const numericAmount = parseFloat(amount.replace(/[^0-9.-]/g, ""));
    if (!name || isNaN(numericAmount) || numericAmount <= 0) {
      toast({
        title: "Invalid data",
        description: "Please provide a valid name and amount",
        variant: "destructive",
      });
      return;
    }

    try {
      await createOverhead.mutateAsync({
        name,
        category,
        amount: numericAmount,
        frequency,
        location_id: locationId === "_all" ? null : locationId,
        start_date: startDate ? format(startDate, "yyyy-MM-dd") : null,
        is_active: true,
      });

      toast({
        title: "Overhead created",
        description: `Created "${name}" overhead entry for ${formatCurrency(numericAmount)}`,
      });
      onOpenChange(false);
    } catch (error) {
      // Error toast handled by hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convert to Overhead</DialogTitle>
          <DialogDescription>
            Review and confirm the extracted data before creating an overhead entry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Monthly Rent" />
          </div>

          <div className="space-y-2">
            <Label>Category *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as OverheadCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OVERHEAD_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Amount *</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              type="text"
            />
          </div>

          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as OverheadFrequency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OVERHEAD_FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Locations</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Start Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={createOverhead.isPending}>
            {createOverhead.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Overhead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Convert to Payroll Dialog
function ConvertToPayrollDialog({
  document,
  open,
  onOpenChange,
}: {
  document: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: locations = [] } = useLocations();
  const { data: staff = [] } = useStaffWithContracts();
  const createShift = useCreateShift();

  const extractedData = document.extracted_data as Record<string, string> | null;

  // Pre-populate from extracted data
  const [staffId, setStaffId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>(document.location_id || "");
  const [hoursWorked, setHoursWorked] = useState(extractedData?.hours || extractedData?.hours_worked || "");
  const [shiftDate, setShiftDate] = useState<Date | undefined>(
    document.document_date ? parseISO(document.document_date) : undefined
  );
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [notes, setNotes] = useState(`From document: ${document.filename}`);

  // Reset form on open
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setStaffId("");
      setLocationId(document.location_id || "");
      setHoursWorked(extractedData?.hours || extractedData?.hours_worked || "");
      setShiftDate(document.document_date ? parseISO(document.document_date) : undefined);
      setStartTime("09:00");
      setEndTime("17:00");
      setNotes(`From document: ${document.filename}`);
    }
    onOpenChange(newOpen);
  };

  const handleConfirm = async () => {
    if (!staffId || !locationId || !shiftDate) {
      toast({
        title: "Missing data",
        description: "Please select a staff member, location, and date",
        variant: "destructive",
      });
      return;
    }

    try {
      const shiftStart = new Date(shiftDate);
      const [startH, startM] = startTime.split(":").map(Number);
      shiftStart.setHours(startH, startM, 0, 0);

      const shiftEnd = new Date(shiftDate);
      const [endH, endM] = endTime.split(":").map(Number);
      shiftEnd.setHours(endH, endM, 0, 0);

      await createShift.mutateAsync({
        staff_id: staffId,
        location_id: locationId,
        shift_start: shiftStart.toISOString(),
        shift_end: shiftEnd.toISOString(),
        notes,
        is_draft: false,
      });

      const staffMember = staff.find((s) => s.id === staffId);
      toast({
        title: "Shift created",
        description: `Created shift for ${staffMember?.first_name} ${staffMember?.last_name}`,
      });
      onOpenChange(false);
    } catch (error) {
      // Error toast handled by hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convert to Payroll Entry</DialogTitle>
          <DialogDescription>
            Create a shift record from the extracted document data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Staff Member *</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} ({s.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Location *</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Shift Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !shiftDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {shiftDate ? format(shiftDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={shiftDate} onSelect={setShiftDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          {hoursWorked && (
            <p className="text-sm text-muted-foreground">
              Extracted hours: <span className="font-medium">{hoursWorked}</span>
            </p>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={createShift.isPending}>
            {createShift.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
