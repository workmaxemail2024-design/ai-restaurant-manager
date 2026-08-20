import { useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  MoreHorizontal, Pencil, Archive, ArchiveRestore, Trash2, Loader2, ShieldAlert, Merge, Search,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { Dish } from "@/hooks/useDishes";
import {
  useArchiveDish,
  useDishDependencies,
  useMergeDishes,
  useSafeDeleteDish,
} from "@/hooks/useDishLifecycle";

interface Props {
  dish: Dish;
  /** Opens the existing Dish Detail / Edit modal. */
  onEdit: (dish: Dish) => void;
  /** Candidate dishes for the merge picker (excluding this one). */
  allDishes?: Dish[];
  align?: "start" | "end";
}

type FieldChoice = "master" | "duplicate";

function recipeSummary(deps: { recipeLines: number } | undefined, dish: Dish) {
  if (!deps) return "…";
  if (dish.use_direct_cost && dish.direct_cost) return `Direct cost ${formatCurrency(Number(dish.direct_cost))}`;
  if (deps.recipeLines > 0) return `${deps.recipeLines} recipe ingredient(s)`;
  return "No recipe";
}

/**
 * Shared Actions menu (Edit / Archive / Safe delete / Merge) for the canonical
 * dish record. Used identically by Cost Analysis and the Dishes page.
 */
export function DishActionsMenu({ dish, onEdit, allDishes = [], align = "end" }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [otherId, setOtherId] = useState<string | null>(null);
  const [masterIsThis, setMasterIsThis] = useState(true);
  const [nameChoice, setNameChoice] = useState<FieldChoice>("master");
  const [priceChoice, setPriceChoice] = useState<FieldChoice>("master");
  const [categoryChoice, setCategoryChoice] = useState<FieldChoice>("master");
  const [recipeChoice, setRecipeChoice] = useState<FieldChoice>("master");

  const archive = useArchiveDish();
  const del = useSafeDeleteDish();
  const merge = useMergeDishes();

  const isArchived = !!dish.archived_at;

  const { data: deps, isFetching: depsLoading } = useDishDependencies(dish.id, deleteOpen || mergeOpen);

  const other = useMemo(() => allDishes.find((d) => d.id === otherId) || null, [allDishes, otherId]);
  const { data: otherDeps } = useDishDependencies(otherId, mergeOpen && !!otherId);

  const candidates = useMemo(() => {
    const q = mergeSearch.trim().toLowerCase();
    return allDishes
      .filter((d) => d.id !== dish.id && !d.archived_at)
      .filter((d) => (q ? d.name.toLowerCase().includes(q) : true))
      .slice(0, 40);
  }, [allDishes, dish.id, mergeSearch]);

  const master = masterIsThis ? dish : other;
  const duplicate = masterIsThis ? other : dish;
  const masterDeps = masterIsThis ? deps : otherDeps;
  const duplicateDeps = masterIsThis ? otherDeps : deps;

  const bothHaveRecipe = !!(masterDeps?.recipeLines && duplicateDeps?.recipeLines);
  const pricesDiffer = !!(master && duplicate && Number(master.selling_price) !== Number(duplicate.selling_price));

  const resetMerge = () => {
    setOtherId(null);
    setMergeSearch("");
    setMasterIsThis(true);
    setNameChoice("master");
    setPriceChoice("master");
    setCategoryChoice("master");
    setRecipeChoice("master");
  };

  const confirmMerge = async () => {
    if (!master || !duplicate) return;
    await merge.mutateAsync({
      masterId: master.id,
      duplicateId: duplicate.id,
      useDuplicateRecipe: recipeChoice === "duplicate",
      useDuplicatePrice: priceChoice === "duplicate",
      useDuplicateName: nameChoice === "duplicate",
      useDuplicateCategory: categoryChoice === "duplicate",
    });
    setMergeOpen(false);
    resetMerge();
  };

  const ComparisonRow = ({
    label,
    masterValue,
    duplicateValue,
    choice,
    onChoice,
    conflict,
  }: {
    label: string;
    masterValue: string;
    duplicateValue: string;
    choice?: FieldChoice;
    onChoice?: (c: FieldChoice) => void;
    conflict?: boolean;
  }) => (
    <div className={cn("grid grid-cols-[120px_1fr_1fr] gap-3 items-start py-2 border-b last:border-b-0", conflict && "bg-warning/5")}>
      <div className="text-xs uppercase text-muted-foreground pt-1">{label}</div>
      {(["master", "duplicate"] as FieldChoice[]).map((side) => {
        const value = side === "master" ? masterValue : duplicateValue;
        const selectable = !!onChoice;
        return (
          <button
            key={side}
            type="button"
            disabled={!selectable}
            onClick={() => onChoice?.(side)}
            className={cn(
              "text-left text-sm rounded px-2 py-1 border",
              selectable ? "hover:bg-muted/60" : "border-transparent cursor-default",
              selectable && choice === side ? "border-primary bg-primary/5 font-medium" : selectable && "border-transparent",
            )}
          >
            {value}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" aria-label="Dish actions" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56">
          <DropdownMenuLabel className="truncate">{dish.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onEdit(dish)}>
            <Pencil className="h-4 w-4 mr-2" /> Edit dish
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => archive.mutate({ id: dish.id, archived: !isArchived })}
            disabled={archive.isPending}
          >
            {isArchived ? (
              <><ArchiveRestore className="h-4 w-4 mr-2" /> Restore</>
            ) : (
              <><Archive className="h-4 w-4 mr-2" /> Archive</>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMergeOpen(true)} disabled={isArchived}>
            <Merge className="h-4 w-4 mr-2" /> Merge duplicate…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete permanently
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Safe delete */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{dish.name}” permanently?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {depsLoading && (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking linked data…</span>
                )}
                {!depsLoading && deps && !deps.canDelete && (
                  <>
                    <span className="flex items-start gap-2 text-destructive">
                      <ShieldAlert className="h-4 w-4 mt-0.5" />
                      This dish has linked data. Archive it, or merge it into the master dish instead.
                    </span>
                    <ul className="text-xs list-disc pl-5">
                      {deps.sales > 0 && <li>{deps.sales} historical sales record(s)</li>}
                      {deps.posItems > 0 && <li>{deps.posItems} POS product mapping(s)</li>}
                      {deps.posImports > 0 && <li>{deps.posImports} POS import row(s)</li>}
                      {deps.posMappings > 0 && <li>{deps.posMappings} POS mapping record(s)</li>}
                      {deps.recipeLines > 0 && <li>{deps.recipeLines} recipe ingredient line(s)</li>}
                      {deps.menuRefs > 0 && <li>{deps.menuRefs} menu assignment(s)</li>}
                      {deps.inventoryLinks > 0 && <li>{deps.inventoryLinks} direct-sale inventory link(s)</li>}
                      {deps.mergedChildren > 0 && <li>{deps.mergedChildren} dish(es) merged into this one</li>}
                    </ul>
                    <span className="text-xs">Historical sales are never deleted to make a delete possible.</span>
                  </>
                )}
                {!depsLoading && deps?.canDelete && (
                  <span>No sales, recipe, menu or POS references point at this dish. This cannot be undone.</span>
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
                  archive.mutate({ id: dish.id, archived: true });
                  setDeleteOpen(false);
                }}
              >
                <Archive className="h-4 w-4 mr-2" /> Archive instead
              </Button>
            ) : (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  del.mutateAsync({ id: dish.id }).then(() => setDeleteOpen(false)).catch(() => {});
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

      {/* Merge */}
      <Dialog open={mergeOpen} onOpenChange={(o) => { setMergeOpen(o); if (!o) resetMerge(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Merge duplicate dish</DialogTitle>
            <DialogDescription>
              All sales history, POS mappings, menu assignments and inventory links from both records are kept and moved
              onto the master dish. The duplicate is archived, never deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Duplicate to merge with “{dish.name}”</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-10"
                  placeholder="Search dishes…"
                  value={mergeSearch}
                  onChange={(e) => setMergeSearch(e.target.value)}
                />
              </div>
              <div className="max-h-40 overflow-y-auto border rounded-md divide-y">
                {candidates.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setOtherId(d.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm hover:bg-muted/60 flex items-center justify-between gap-2",
                      otherId === d.id && "bg-primary/5 font-medium",
                    )}
                  >
                    <span className="truncate">{d.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {d.category || "—"} · {formatCurrency(Number(d.selling_price))}
                    </span>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No matching dishes.</p>
                )}
              </div>
            </div>

            {other && (
              <>
                <div className="space-y-2">
                  <Label>Which record is the master?</Label>
                  <RadioGroup
                    value={masterIsThis ? "this" : "other"}
                    onValueChange={(v) => {
                      setMasterIsThis(v === "this");
                      setNameChoice("master"); setPriceChoice("master");
                      setCategoryChoice("master"); setRecipeChoice("master");
                    }}
                    className="grid grid-cols-2 gap-2"
                  >
                    <label className={cn("flex items-center gap-2 border rounded-md p-3 cursor-pointer", masterIsThis && "border-primary bg-primary/5")}>
                      <RadioGroupItem value="this" /> <span className="text-sm truncate">{dish.name}</span>
                    </label>
                    <label className={cn("flex items-center gap-2 border rounded-md p-3 cursor-pointer", !masterIsThis && "border-primary bg-primary/5")}>
                      <RadioGroupItem value="other" /> <span className="text-sm truncate">{other.name}</span>
                    </label>
                  </RadioGroup>
                </div>

                {(bothHaveRecipe || pricesDiffer) && (
                  <Alert>
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>Conflicting real data — confirm which record wins</AlertTitle>
                    <AlertDescription className="text-xs">
                      {bothHaveRecipe && <>Both dishes have cost data, so only one recipe/cost source can survive. </>}
                      {pricesDiffer && <>The selling prices differ. </>}
                      Nothing is decided automatically.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="border rounded-md p-3">
                  <div className="grid grid-cols-[120px_1fr_1fr] gap-3 pb-2 border-b text-xs uppercase text-muted-foreground">
                    <span>Field</span>
                    <span className="flex items-center gap-2">Master <Badge variant="secondary" className="text-[10px]">kept</Badge></span>
                    <span>Duplicate (archived)</span>
                  </div>
                  <ComparisonRow
                    label="Name" choice={nameChoice} onChoice={setNameChoice}
                    masterValue={master?.name ?? "—"} duplicateValue={duplicate?.name ?? "—"}
                  />
                  <ComparisonRow
                    label="Selling price" choice={priceChoice} onChoice={setPriceChoice} conflict={pricesDiffer}
                    masterValue={formatCurrency(Number(master?.selling_price ?? 0))}
                    duplicateValue={formatCurrency(Number(duplicate?.selling_price ?? 0))}
                  />
                  <ComparisonRow
                    label="Category / menu" choice={categoryChoice} onChoice={setCategoryChoice}
                    masterValue={`${master?.category || master?.department || "—"} · ${masterDeps?.menuRefs ?? 0} menu ref(s)`}
                    duplicateValue={`${duplicate?.category || duplicate?.department || "—"} · ${duplicateDeps?.menuRefs ?? 0} menu ref(s)`}
                  />
                  <ComparisonRow
                    label="Recipe / cost" choice={recipeChoice} onChoice={setRecipeChoice} conflict={bothHaveRecipe}
                    masterValue={master ? recipeSummary(masterDeps, master) : "—"}
                    duplicateValue={duplicate ? recipeSummary(duplicateDeps, duplicate) : "—"}
                  />
                  <ComparisonRow
                    label="POS mappings"
                    masterValue={`${(masterDeps?.posItems ?? 0) + (masterDeps?.posMappings ?? 0)} mapping(s)`}
                    duplicateValue={`${(duplicateDeps?.posItems ?? 0) + (duplicateDeps?.posMappings ?? 0)} mapping(s)`}
                  />
                  <ComparisonRow
                    label="Sales history"
                    masterValue={`${masterDeps?.sales ?? 0} sale record(s)`}
                    duplicateValue={`${duplicateDeps?.sales ?? 0} sale record(s) — moved to master`}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button>
            <Button onClick={confirmMerge} disabled={!other || merge.isPending}>
              {merge.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Merge into master
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
