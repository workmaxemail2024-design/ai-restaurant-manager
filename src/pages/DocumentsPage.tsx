import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Upload, Search, Trash2, ExternalLink, CalendarIcon, FileText, Loader2, Sparkles, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

const DOCUMENT_TYPES = ["Invoice", "Receipt", "Statement", "Payroll", "Other"] as const;
type DocumentType = typeof DOCUMENT_TYPES[number];
import { cn } from "@/lib/utils";
import {
  useDocuments,
  useUploadDocument,
  useDeleteDocument,
  DOCUMENT_CATEGORIES,
  Document,
  DocumentFilters,
} from "@/hooks/useDocuments";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useLocations } from "@/hooks/useLocations";
import { useLocation } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export default function DocumentsPage() {
  const { selectedLocationId } = useLocation();
  const [filters, setFilters] = useState<DocumentFilters>({});
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const [viewTextDoc, setViewTextDoc] = useState<Document | null>(null);

  const { data: documents = [], isLoading } = useDocuments(filters);
  const { data: suppliers = [] } = useSuppliers();
  const { data: locations = [] } = useLocations();

  return (
    <PageLayout title="Documents" description="Upload and manage operational documents">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search filename or notes..."
              value={filters.search || ""}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="pl-9"
            />
          </div>
        </div>

        <Select
          value={filters.category || "all"}
          onValueChange={(v) => setFilters((f) => ({ ...f, category: v === "all" ? undefined : v }))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.supplierId || "all"}
          onValueChange={(v) => setFilters((f) => ({ ...f, supplierId: v === "all" ? undefined : v }))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button className="ml-auto">
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
            </DialogHeader>
            <UploadForm
              locations={locations}
              suppliers={suppliers}
              defaultLocationId={selectedLocationId}
              onSuccess={() => setUploadDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-[150px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No documents found
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  document={doc}
                  onDelete={() => setDeleteDoc(doc)}
                  onViewText={() => setViewTextDoc(doc)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDoc} onOpenChange={(o) => !o && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteDoc?.filename}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <DeleteButton document={deleteDoc!} onDone={() => setDeleteDoc(null)} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Extracted Text Modal */}
      <Dialog open={!!viewTextDoc} onOpenChange={(o) => !o && setViewTextDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Extracted Text - {viewTextDoc?.filename}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4">
              {viewTextDoc?.extracted_data && Object.keys(viewTextDoc.extracted_data as Record<string, string>).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Extracted Data</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm bg-muted/50 p-3 rounded-md">
                    {Object.entries(viewTextDoc.extracted_data as Record<string, string>).map(([key, value]) => (
                      <div key={key} className="flex">
                        <span className="font-medium text-muted-foreground mr-2">{key}:</span>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h4 className="text-sm font-medium mb-2">Full Text</h4>
                <pre className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md font-mono">
                  {viewTextDoc?.extracted_text || "No text extracted"}
                </pre>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

function DocumentRow({ 
  document, 
  onDelete,
  onViewText 
}: { 
  document: Document; 
  onDelete: () => void;
  onViewText: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const queryClient = useQueryClient();

  const handleView = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(document.storage_path, 3600);
      
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      console.error("Error getting document URL:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExtract = async () => {
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("document-extract", {
        body: { documentId: document.id },
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Extraction failed",
          description: data.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Extraction complete",
          description: "Text has been extracted from the document",
        });
      }

      // Refresh documents list
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (err) {
      console.error("Extraction error:", err);
      toast({
        title: "Extraction failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } finally {
      setExtracting(false);
    }
  };

  // Extract document_type from notes (stored as JSON prefix)
  const docType = document.notes?.startsWith("{\"type\":")
    ? JSON.parse(document.notes.split("\n")[0])?.type || "Other"
    : "Other";

  // Get processing status
  const status = document.processing_status || "uploaded";

  const getStatusBadge = () => {
    switch (status) {
      case "processing":
        return <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Processing...</Badge>;
      case "processed":
        return <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Processed</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-xs">Failed</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Uploaded</Badge>;
    }
  };

  return (
    <TableRow>
      <TableCell>
        {document.document_date
          ? format(new Date(document.document_date), "dd MMM yyyy")
          : "—"}
      </TableCell>
      <TableCell>{document.category}</TableCell>
      <TableCell className="text-sm">{docType}</TableCell>
      <TableCell>{document.supplier?.name || "—"}</TableCell>
      <TableCell>{document.location?.name || "All Locations"}</TableCell>
      <TableCell>
        <button
          onClick={handleView}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-50"
        >
          <FileText className="h-4 w-4" />
          {document.filename}
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
        </button>
      </TableCell>
      <TableCell>
        {getStatusBadge()}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {format(new Date(document.created_at), "dd MMM yyyy")}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleExtract} 
            disabled={extracting || status === "processing"}
            title="Extract text (OCR)"
          >
            {extracting || status === "processing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-amber-500" />
            )}
          </Button>
          {status === "processed" && document.extracted_text && (
            <Button variant="ghost" size="icon" onClick={onViewText} title="View extracted text">
              <Eye className="h-4 w-4 text-blue-500" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleView} disabled={loading}>
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function DeleteButton({ document, onDone }: { document: Document; onDone: () => void }) {
  const deleteDocument = useDeleteDocument();

  const handleDelete = async () => {
    await deleteDocument.mutateAsync(document);
    onDone();
  };

  return (
    <AlertDialogAction
      onClick={handleDelete}
      disabled={deleteDocument.isPending}
      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
    >
      {deleteDocument.isPending ? "Deleting..." : "Delete"}
    </AlertDialogAction>
  );
}

interface UploadFormProps {
  locations: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  defaultLocationId: string | null;
  onSuccess: () => void;
}

function UploadForm({ locations, suppliers, defaultLocationId, onSuccess }: UploadFormProps) {
  const uploadDocument = useUploadDocument();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>("");
  const [docType, setDocType] = useState<DocumentType>("Invoice");
  const [locationId, setLocationId] = useState<string>(defaultLocationId || "all");
  const [supplierId, setSupplierId] = useState<string>("none");
  const [documentDate, setDocumentDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !category) return;

    // Store docType as JSON prefix in notes field
    const notesWithType = `{"type":"${docType}"}\n${notes.trim()}`;

    await uploadDocument.mutateAsync({
      file,
      category,
      locationId: locationId === "all" ? null : locationId,
      supplierId: supplierId === "none" ? null : supplierId,
      documentDate: documentDate ? format(documentDate, "yyyy-MM-dd") : null,
      notes: notesWithType,
    });

    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* File Input */}
      <div className="space-y-2">
        <Label htmlFor="file">File *</Label>
        <Input
          id="file"
          type="file"
          accept="image/*,application/pdf,.csv,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label>Category *</Label>
        <Select value={category} onValueChange={setCategory} required>
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Document Type */}
      <div className="space-y-2">
        <Label>Document Type *</Label>
        <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {DOCUMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label>Location</Label>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger>
            <SelectValue placeholder="All Locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Supplier */}
      <div className="space-y-2">
        <Label>Supplier (optional)</Label>
        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Document Date */}
      <div className="space-y-2">
        <Label>Document Date (optional)</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !documentDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {documentDate ? format(documentDate, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={documentDate}
              onSelect={setDocumentDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any notes..."
          rows={2}
        />
      </div>

      <Button type="submit" className="w-full" disabled={!file || !category || uploadDocument.isPending}>
        {uploadDocument.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </>
        )}
      </Button>
    </form>
  );
}
