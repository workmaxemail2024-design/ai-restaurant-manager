import { useRef, useState } from "react";
import { format } from "date-fns";
import { Camera, ExternalLink, FileText, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useDayDocuments, useUploadDocument } from "@/hooks/useDocuments";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/** Category + notes marker used to identify labour / Captiva hours evidence. */
export const LABOUR_DOC_CATEGORY = "Payroll / Labour";
export const LABOUR_DOC_TYPE = "Captiva Hours";

export function isLabourEvidence(doc: { category: string; notes: string | null }): boolean {
  return doc.category === LABOUR_DOC_CATEGORY && (doc.notes ?? "").includes(LABOUR_DOC_TYPE);
}

interface Props {
  /** Work date (yyyy-MM-dd) the evidence belongs to */
  date: string;
  locationId: string | null;
  disabled?: boolean;
}

/**
 * Take Photo / Upload Captiva Hours. Reuses the existing documents storage
 * architecture — the file is stored against the restaurant, location and work
 * date and tagged as labour attendance evidence. It does not create attendance
 * records; the manager reads it while entering employee hours.
 */
export function LabourEvidenceCard({ date, locationId, disabled }: Props) {
  const queryClient = useQueryClient();
  const upload = useUploadDocument();
  const { data: dayDocs = [] } = useDayDocuments(date, locationId);
  const [busy, setBusy] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const docs = dayDocs.filter(isLabourEvidence);

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!locationId) {
      toast({ title: "Select a single location to attach labour evidence", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await upload.mutateAsync({
        file,
        category: LABOUR_DOC_CATEGORY,
        locationId,
        supplierId: null,
        documentDate: date,
        notes: `${JSON.stringify({ type: LABOUR_DOC_TYPE, work_date: date })}`,
      });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openDoc = async (storagePath: string) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(storagePath, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: "Could not open document", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Captiva hours evidence</p>
        <Badge variant="secondary">
          {docs.length} file{docs.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {format(new Date(date), "EEE d MMM yyyy")} · attach the printed or on-screen Captiva hours
        report for this day. Uploading does not create attendance records.
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-1"
          disabled={disabled || busy || !locationId}
          onClick={() => cameraRef.current?.click()}
        >
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
          Take Photo
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-1"
          disabled={disabled || busy || !locationId}
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip className="h-4 w-4 mr-2" />
          Upload File
        </Button>
      </div>
      {!locationId && (
        <p className="text-xs text-muted-foreground">
          Select a single location to attach labour evidence.
        </p>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {docs.length > 0 && (
        <div className="space-y-1">
          {docs.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => openDoc(d.storage_path)}
              className="w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
            >
              <span className="flex items-center gap-2 truncate">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{d.filename}</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
