import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronUp, ChevronDown, Pencil, Trash2, RotateCcw, Plus, Check, X, Merge } from "lucide-react";
import {
  useDishCategories, useAddCategory, useRenameCategory, useReorderCategories,
  useRemoveCategory, useSetCategoryArchived, type DishCategory,
} from "@/hooks/useDishCategories";
import { usePermissions } from "@/hooks/usePermissions";

const plural = (n: number) => `${n} dish${n === 1 ? "" : "es"}`;

interface Props { open: boolean; onOpenChange: (o: boolean) => void }

export function ManageCategoriesDialog({ open, onOpenChange }: Props) {
  const { data: cats = [], isLoading } = useDishCategories();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("menu" as any, "edit" as any);
  const add = useAddCategory();
  const rename = useRenameCategory();
  const reorder = useReorderCategories();
  const remove = useRemoveCategory();
  const setArchived = useSetCategoryArchived();

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [mergeTarget, setMergeTarget] = useState<{ from: DishCategory; to: DishCategory } | null>(null);
  const [mergePick, setMergePick] = useState<DishCategory | null>(null);
  const [mergePickTo, setMergePickTo] = useState<string>("");
  const [removeCat, setRemoveCat] = useState<DishCategory | null>(null);
  const [moveTo, setMoveTo] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);

  const active = cats.filter((c) => !c.archived_at);
  const archived = cats.filter((c) => c.archived_at);
  const findByName = (n: string, exceptId?: string) =>
    cats.find((c) => c.id !== exceptId && c.name.trim().toLowerCase() === n.trim().toLowerCase());

  const addCategory = () => {
    const n = newName.trim();
    if (!n) return;
    if (findByName(n)) return add.mutate({ name: n, sort_order: 0 }); // server reports duplicate
    const max = cats.reduce((m, c) => Math.max(m, c.sort_order), 0);
    add.mutate({ name: n, sort_order: max + 10 }, { onSuccess: () => setNewName("") });
  };

  const saveRename = (c: DishCategory) => {
    const n = editName.trim();
    if (!n || n === c.name) return setEditId(null);
    const existing = findByName(n, c.id);
    if (existing) return setMergeTarget({ from: c, to: existing });
    rename.mutate({ id: c.id, name: n }, { onSuccess: () => setEditId(null) });
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= active.length) return;
    const list = [...active];
    [list[idx], list[j]] = [list[j], list[idx]];
    const updates = list
      .map((c, i) => ({ id: c.id, sort_order: (i + 1) * 10, old: c.sort_order }))
      .filter((u) => u.sort_order !== u.old)
      .map(({ id, sort_order }) => ({ id, sort_order }));
    reorder.mutate(updates);
  };

  const confirmMerge = () => {
    if (!mergeTarget) return;
    rename.mutate(
      { id: mergeTarget.from.id, name: mergeTarget.to.name, merge: true },
      { onSuccess: () => { setMergeTarget(null); setEditId(null); setMergePick(null); setMergePickTo(""); } },
    );
  };

  const confirmRemove = () => {
    if (!removeCat) return;
    remove.mutate(
      { id: removeCat.id, moveTo: removeCat.dish_count > 0 ? moveTo : null },
      { onSuccess: () => { setRemoveCat(null); setMoveTo(""); } },
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] flex flex-col p-0 gap-0">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>
              Order here is your menu order. Renaming updates every dish using that category.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-2">
            {canEdit && (
              <div className="flex gap-2 pb-2">
                <Input
                  placeholder="New category name"
                  value={newName}
                  maxLength={80}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCategory()}
                  className="h-11"
                />
                <Button className="h-11" onClick={addCategory} disabled={!newName.trim() || add.isPending}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            )}

            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

            {active.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border bg-card p-2">
                {canEdit && (
                  <div className="flex flex-col">
                    <Button variant="ghost" size="icon" className="h-9 w-11" aria-label={`Move ${c.name} up`}
                      disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}>
                      <ChevronUp className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-11" aria-label={`Move ${c.name} down`}
                      disabled={i === active.length - 1 || reorder.isPending} onClick={() => move(i, 1)}>
                      <ChevronDown className="h-5 w-5" />
                    </Button>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {editId === c.id ? (
                    <Input autoFocus value={editName} maxLength={80} className="h-11"
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(c); if (e.key === "Escape") setEditId(null); }} />
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{c.name}</span>
                      <Badge variant="secondary">{plural(c.dish_count)}</Badge>
                    </div>
                  )}
                </div>
                {canEdit && (editId === c.id ? (
                  <>
                    <Button size="icon" className="h-11 w-11" aria-label="Save name" onClick={() => saveRename(c)} disabled={rename.isPending}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-11 w-11" aria-label="Cancel" onClick={() => setEditId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="icon" variant="ghost" className="h-11 w-11" aria-label={`Rename ${c.name}`}
                      onClick={() => { setEditId(c.id); setEditName(c.name); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-11 w-11" aria-label={`Merge ${c.name}`}
                      onClick={() => { setMergePick(c); setMergePickTo(""); }}>
                      <Merge className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-11 w-11 text-destructive" aria-label={`Remove ${c.name}`}
                      onClick={() => { setRemoveCat(c); setMoveTo(""); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                ))}
              </div>
            ))}

            {archived.length > 0 && (
              <div className="pt-3">
                <Button variant="ghost" className="h-11" onClick={() => setShowArchived((s) => !s)}>
                  {showArchived ? "Hide" : "Show"} archived ({archived.length})
                </Button>
                {showArchived && archived.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-lg border border-dashed p-2 mt-2 opacity-80">
                    <span className="flex-1">{c.name} <Badge variant="outline" className="ml-2">{plural(c.dish_count)}</Badge></span>
                    {canEdit && (
                      <Button variant="outline" className="h-11" onClick={() => setArchived.mutate({ id: c.id, archived: false })}>
                        <RotateCcw className="h-4 w-4 mr-1" /> Restore
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t p-4 flex justify-end">
            <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pick merge target */}
      <AlertDialog open={!!mergePick} onOpenChange={(o) => !o && setMergePick(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge "{mergePick?.name}" into…</AlertDialogTitle>
            <AlertDialogDescription>All its dishes will move to the category you choose, and "{mergePick?.name}" will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <Select value={mergePickTo} onValueChange={setMergePickTo}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Choose category" /></SelectTrigger>
            <SelectContent>
              {active.filter((c) => c.id !== mergePick?.id).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name} ({plural(c.dish_count)})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <Button className="h-11" disabled={!mergePickTo} onClick={() => {
              const to = cats.find((c) => c.id === mergePickTo);
              if (mergePick && to) setMergeTarget({ from: mergePick, to });
            }}>Continue</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Merge confirmation */}
      <AlertDialog open={!!mergeTarget} onOpenChange={(o) => !o && setMergeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge categories?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p className="text-base font-medium text-foreground">
                  {mergeTarget?.from.name} ({plural(mergeTarget?.from.dish_count ?? 0)}) → {mergeTarget?.to.name} ({plural(mergeTarget?.to.dish_count ?? 0)})
                </p>
                <p>All dishes in "{mergeTarget?.from.name}" will move to "{mergeTarget?.to.name}" in one step, and "{mergeTarget?.from.name}" will be removed.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-11" onClick={confirmMerge} disabled={rename.isPending}>Merge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeCat} onOpenChange={(o) => !o && setRemoveCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{removeCat?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeCat && removeCat.dish_count > 0
                ? `This category is used by ${plural(removeCat.dish_count)}. Choose where to move them first.`
                : "No dishes use this category. It will be removed from your list."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeCat && removeCat.dish_count > 0 && (
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Move dishes to…" /></SelectTrigger>
              <SelectContent>
                {active.filter((c) => c.id !== removeCat.id).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({plural(c.dish_count)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={confirmRemove}
              disabled={remove.isPending || (!!removeCat && removeCat.dish_count > 0 && !moveTo)}>
              {removeCat && removeCat.dish_count > 0 ? "Move dishes & remove" : "Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
