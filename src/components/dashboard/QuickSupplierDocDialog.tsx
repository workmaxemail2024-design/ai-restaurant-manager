import { useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, Paperclip, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useUploadDocument } from "@/hooks/useDocuments";
import { useSuppliers } from "@/hooks/useSuppliers";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { useLocations } from "@/hooks/useLocations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const DOC_TYPES = ["Delivery Docket", "Invoice", "Receipt", "Other"] as const;
type DocType = typeof DOC_TYPES[number];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Selected dashboard day (yyyy-MM-dd) */
  date: string;
  /** Selected dashboard location */
  locationId: string | null;
}

export function QuickSupplierDocDialog({ open, onOpenChange, date, locationId }: Props) {
  const queryClient = useQueryClient();
  const upload = useUploadDocument();
  const { data: suppliers = [] } = useSuppliers();
  const { data: locations = [] } = useLocations();

  const [supplierId, setSupplierId] = useState<string>("");
  const [docType, setDocType] = useState<DocType>("Delivery Docket");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSupplierId("");
      setDocType("Delivery Docket");
      setNotes("");
      setFile(null);
    }
  }, [open]);

  const locationName = locationId
    ? locations.find((l) => l.id === locationId)?.name ?? "Selected location"
    : "All locations";

  const canSubmit = !!file && !!supplierId && !busy;

  const handleSubmit = async () => {
    if (!file || !supplierId) return;
    setBusy(true);
    try {
      // Reuse existing document type metadata pattern (JSON prefix inside notes)
      const notesPayload = `${JSON.stringify({ type: docType })}${notes ? `\n${notes}` : ""}`;

      const doc = await upload.mutateAsync({
        file,
        category: docType === "Invoice" ? "Supplier Invoice" : "Other",
        locationId,
        supplierId,
        documentDate: date,
        notes: notesPayload,
      });

      // Kick off existing OCR/extraction pipeline (best effort)
      if (doc?.id) {
        supabase.functions
          .invoke("document-extract", { body: { documentId: doc.id } })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["documents"] });
          })
          .catch(() => {
            /* extraction failures are surfaced on the Documents page */
          });
      }

      queryClient.invalidateQueries({ queryKey: ["documents"] });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const pickButton = (
    label: string,
    Icon: typeof Camera,
    ref: React.RefObject<HTMLInputElement>
  ) => (
    <Button
      type="button"
      variant="outline"
      className="h-20 flex-1 flex-col gap-2 text-sm"
      onClick={() => ref.current?.click()}
    >
      <Icon className="h-6 w-6" />
      {label}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Supplier Document</DialogTitle>
          <DialogDescription>
            {format(new Date(date), "EEE d MMM yyyy")} • {locationName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Capture options */}
          <div className="flex gap-2">
            {pickButton("Take photo", Camera, cameraRef)}
            {pickButton("Photo library", ImageIcon, photoRef)}
            {pickButton("File", Paperclip, fileRef)}
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <div
            className={cn(
              "rounded-md border p-3 text-sm",
              file ? "border-primary/40 bg-primary/5" : "bg-muted/40 text-muted-foreground"
            )}
          >
            {file ? file.name : "No file selected yet"}
          </div>

          <div className="space-y-2">
            <Label>Supplier (required)</Label>
            <SupplierSelect
              value={supplierId}
              onValueChange={setSupplierId}
              triggerClassName="h-12"
              contentClassName="z-[60]"
            />
          </div>

          <div className="space-y-2">
            <Label>Document type</Label>
            <div className="grid grid-cols-2 gap-2">
              {DOC_TYPES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={docType === t ? "default" : "outline"}
                  className="h-12"
                  onClick={() => setDocType(t)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth flagging about this delivery or invoice"
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 h-12"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button className="flex-1 h-12" onClick={handleSubmit} disabled={!canSubmit}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save document
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
