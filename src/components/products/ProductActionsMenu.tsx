import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoreHorizontal, Pencil, Archive, ArchiveRestore, Trash2, Loader2, ShieldAlert } from "lucide-react";
import {
  PRODUCT_CLASS_LABEL,
  PRODUCT_CLASS_OPTIONS,
  type ProductClass,
} from "@/lib/productClassification";
import {
  useArchiveCanonicalProduct,
  useDeleteCanonicalProduct,
  useEditCanonicalProduct,
  useProductDependencies,
  type CanonicalProductRef,
} from "@/hooks/useProductLifecycle";

export interface CanonicalProductActionTarget extends CanonicalProductRef {
  /** Raw imported name (never overwritten). */
  external_item_name: string | null;
  /** Manual name override, if any. */
  display_name: string | null;
  /** Raw imported department. */
  department: string | null;
  manual_department: string | null;
  productClass: ProductClass;
  needs_review: boolean;
  archived_at: string | null;
}

interface Props {
  item: CanonicalProductActionTarget | null;
  /** Fallback label when there is no canonical record yet. */
  fallbackName?: string;
}

/**
 * Shared Actions menu (Edit / Archive / Delete permanently) for the canonical
 * POS product record. Used identically by Menu Performance and Product
 * Intelligence so behaviour never diverges.
 */
export function ProductActionsMenu({ item, fallbackName }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const edit = useEditCanonicalProduct();
  const archive = useArchiveCanonicalProduct();
  const del = useDeleteCanonicalProduct();

  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [cls, setCls] = useState<ProductClass>("other");
  const [reviewed, setReviewed] = useState(true);

  useEffect(() => {
    if (!editOpen || !item) return;
    setName(item.display_name ?? item.external_item_name ?? "");
    setDept(item.manual_department ?? item.department ?? "");
    setCls(item.productClass === "drink" ? "other" : item.productClass);
    setReviewed(!item.needs_review);
  }, [editOpen, item]);

  const { data: deps, isFetching: depsLoading } = useProductDependencies(item, deleteOpen);

  if (!item) {
    return (
      <Button size="sm" variant="ghost" disabled title={`No canonical POS record for ${fallbackName ?? "this item"}`}>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    );
  }

  const isArchived = !!item.archived_at;

  const save = async () => {
    await edit.mutateAsync({
      id: item.id,
      display_name: name,
      manual_department: dept,
      productClass: cls,
      needs_review: !reviewed,
    });
    setEditOpen(false);
  };

  const confirmDelete = async () => {
    await del.mutateAsync(item);
    setDeleteOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" aria-label="Product actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">
            {item.display_name ?? item.external_item_name ?? "Product"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => archive.mutate({ id: item.id, archived: !isArchived })}
            disabled={archive.isPending}
          >
            {isArchived ? (
              <>
                <ArchiveRestore className="h-4 w-4 mr-2" /> Restore
              </>
            ) : (
              <>
                <Archive className="h-4 w-4 mr-2" /> Archive
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete permanently
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
            <DialogDescription>
              Manual corrections apply everywhere this canonical product appears. The original POS
              identifier and imported name are preserved for future matching.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prod-name">Display name</Label>
              <Input id="prod-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" />
              <p className="text-xs text-muted-foreground">
                Imported name: <span className="font-mono">{item.external_item_name || "—"}</span> · POS ID:{" "}
                <span className="font-mono">{item.external_item_id}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prod-dept">Department / category</Label>
              <Input id="prod-dept" value={dept} onChange={(e) => setDept(e.target.value)} placeholder="e.g. Starters" />
              <p className="text-xs text-muted-foreground">
                Imported department: {item.department || "—"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={cls} onValueChange={(v) => setCls(v as ProductClass)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_CLASS_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>{PRODUCT_CLASS_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Saving here marks the type as manually confirmed — imports will not overwrite it.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Switch id="prod-reviewed" checked={reviewed} onCheckedChange={setReviewed} />
              <Label htmlFor="prod-reviewed">Reviewed</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={edit.isPending}>
              {edit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product permanently?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {depsLoading && (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking dependencies…</span>
                )}
                {!depsLoading && deps && !deps.canDelete && (
                  <>
                    <span className="flex items-start gap-2 text-destructive">
                      <ShieldAlert className="h-4 w-4 mt-0.5" />
                      This product has historical or mapped data. Archive it instead.
                    </span>
                    <ul className="text-xs list-disc pl-5">
                      {deps.posSalesImports > 0 && <li>{deps.posSalesImports} dated POS sales record(s)</li>}
                      {deps.historicalRows > 0 && <li>{deps.historicalRows} historical aggregate row(s)</li>}
                      {deps.dishMapping > 0 && <li>Mapped to a dish</li>}
                      {deps.dishSales > 0 && <li>{deps.dishSales} sale(s) on the mapped dish</li>}
                      {deps.inventoryLinks > 0 && <li>{deps.inventoryLinks} direct-sale inventory link(s)</li>}
                      {deps.mergedChildren > 0 && <li>{deps.mergedChildren} merged product reference(s)</li>}
                    </ul>
                    <span className="text-xs">Historical sales are never deleted to make this possible.</span>
                  </>
                )}
                {!depsLoading && deps?.canDelete && (
                  <span>
                    No sales, historical rows or mappings reference this product. This cannot be undone.
                  </span>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {deps && !deps.canDelete ? (
              <Button
                variant="secondary"
                onClick={() => {
                  archive.mutate({ id: item.id, archived: true });
                  setDeleteOpen(false);
                }}
              >
                <Archive className="h-4 w-4 mr-2" /> Archive instead
              </Button>
            ) : (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirmDelete();
                }}
                disabled={depsLoading || del.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {del.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Delete permanently
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
