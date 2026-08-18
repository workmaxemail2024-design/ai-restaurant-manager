import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Camera, Loader2, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useQueryClient } from "@tanstack/react-query";
import { useLocations } from "@/hooks/useLocations";
import { useUploadDocument } from "@/hooks/useDocuments";
import {
  DAILY_EXPENSE_CATEGORIES,
  useCreateDailyExpense,
  useDailyExpenses,
  useDeleteDailyExpense,
} from "@/hooks/useDailyExpenses";
import { formatCurrency } from "@/lib/currency";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Selected dashboard day (yyyy-MM-dd) */
  date: string;
  /** Selected dashboard location (null = All locations) */
  locationId: string | null;
}

export function QuickExpenseDialog({ open, onOpenChange, date, locationId }: Props) {
  const queryClient = useQueryClient();
  const { data: locations = [] } = useLocations();
  const createExpense = useCreateDailyExpense();
  const deleteExpense = useDeleteDailyExpense();
  const uploadDocument = useUploadDocument();

  const [targetLocation, setTargetLocation] = useState<string>(locationId ?? "");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Emergency Purchase");
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: expenses = [] } = useDailyExpenses(date, targetLocation || locationId);

  useEffect(() => {
    if (open) {
      setTargetLocation(locationId ?? "");
      setAmount("");
      setCategory("Emergency Purchase");
      setNote("");
      setReceipt(null);
    }
  }, [open, locationId]);

  const parsedAmount = Number(amount);
  const canSave =
    !!targetLocation && Number.isFinite(parsedAmount) && parsedAmount > 0 && !busy;

  const dayTotal = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      let documentId: string | null = null;

      if (receipt) {
        const doc = await uploadDocument.mutateAsync({
          file: receipt,
          category: "Other",
          locationId: targetLocation,
          supplierId: null,
          documentDate: date,
          notes: `${JSON.stringify({ type: "Receipt" })}\nDaily expense: ${category}`,
        });
        documentId = doc?.id ?? null;
      }

      await createExpense.mutateAsync({
        locationId: targetLocation,
        entryDate: date,
        amount: parsedAmount,
        category,
        note: note.trim() || null,
        documentId,
      });

      queryClient.invalidateQueries({ queryKey: ["daily-ledger"] });
      setAmount("");
      setNote("");
      setReceipt(null);
    } catch (err) {
      toast({
        title: "Could not save expense",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
          <DialogDescription>
            {format(new Date(date), "EEE d MMM yyyy")} • one-off daily costs only (rent,
            utilities and other recurring overheads stay in Overheads)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!locationId && (
            <div className="space-y-2">
              <Label>Location (required)</Label>
              <Select value={targetLocation} onValueChange={setTargetLocation}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Choose a location" />
                </SelectTrigger>
                <SelectContent className="z-[60]">
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Amount (€)</Label>
            <Input
              className="h-14 text-lg"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <div className="grid grid-cols-2 gap-2">
              {DAILY_EXPENSE_CATEGORIES.map((c) => (
                <Button
                  key={c}
                  type="button"
                  variant={category === c ? "default" : "outline"}
                  className="h-12 text-sm"
                  onClick={() => setCategory(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description / note</Label>
            <Input
              className="h-12"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. emergency milk run"
            />
          </div>

          <div className="space-y-2">
            <Label>Receipt (optional)</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera className="h-4 w-4 mr-2" />
                Photo
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1"
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip className="h-4 w-4 mr-2" />
                File
              </Button>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            />
            <p
              className={cn(
                "text-xs",
                receipt ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {receipt ? receipt.name : "No receipt attached"}
            </p>
          </div>

          <Button className="h-12 w-full" onClick={handleSave} disabled={!canSave}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save expense
          </Button>

          {/* Today's entries */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                {expenses.length} expense{expenses.length === 1 ? "" : "s"} this day
              </span>
              <span className="text-sm font-semibold">{formatCurrency(dayTotal)}</span>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {expenses.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{e.category}</p>
                    {e.note && (
                      <p className="text-xs text-muted-foreground truncate">{e.note}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span>{formatCurrency(Number(e.amount))}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => deleteExpense.mutate(e.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
