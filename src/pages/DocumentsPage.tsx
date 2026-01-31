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
import { Upload, Search, Trash2, ExternalLink, CalendarIcon, FileText, Loader2 } from "lucide-react";
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

export default function DocumentsPage() {
  const { selectedLocationId } = useLocation();
  const [filters, setFilters] = useState<DocumentFilters>({});
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);

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
              <TableHead>Supplier</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No documents found
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  document={doc}
                  onDelete={() => setDeleteDoc(doc)}
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
    </PageLayout>
  );
}

function DocumentRow({ document, onDelete }: { document: Document; onDelete: () => void }) {
  const [loading, setLoading] = useState(false);

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

  return (
    <TableRow>
      <TableCell>
        {document.document_date
          ? format(new Date(document.document_date), "dd MMM yyyy")
          : "—"}
      </TableCell>
      <TableCell>{document.category}</TableCell>
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
      <TableCell className="text-muted-foreground text-sm">
        {format(new Date(document.created_at), "dd MMM yyyy")}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
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
  const [locationId, setLocationId] = useState<string>(defaultLocationId || "all");
  const [supplierId, setSupplierId] = useState<string>("none");
  const [documentDate, setDocumentDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !category) return;

    await uploadDocument.mutateAsync({
      file,
      category,
      locationId: locationId === "all" ? null : locationId,
      supplierId: supplierId === "none" ? null : supplierId,
      documentDate: documentDate ? format(documentDate, "yyyy-MM-dd") : null,
      notes: notes.trim() || null,
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
