import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXTRACT_FIELDS, unresolvedCells, type EditableRow, type ExtractField } from "@/lib/stockListImport";

const LABEL: Record<ExtractField, string> = {
  supplier: "Supplier", itemName: "Item", productCode: "Code", packSize: "Pack size",
  packUnit: "Pack unit", packCost: "Pack cost €", purchaseUnit: "Bought as", notes: "Notes",
};

interface Props {
  rows: EditableRow[];
  onChange: (rows: EditableRow[]) => void;
  previewUrl: string;
  mimeType: string;
  fileName: string;
}

/** Original document beside editable extracted rows. Unclear cells must be resolved by the user. */
export function ExtractedRowsReview({ rows, onChange, previewUrl, mimeType, fileName }: Props) {
  const [zoom, setZoom] = useState(1);
  const open = unresolvedCells(rows);

  const update = (id: number, fn: (r: EditableRow) => EditableRow) => onChange(rows.map((r) => (r.id === id ? fn(r) : r)));
  const setCell = (id: number, f: ExtractField, patch: Partial<EditableRow["cells"][ExtractField]>) =>
    update(id, (r) => ({ ...r, cells: { ...r.cells, [f]: { ...r.cells[f], ...patch } } }));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-2 lg:sticky lg:top-0 lg:self-start">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm text-muted-foreground">{fileName}</p>
          {mimeType !== "application/pdf" && (
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.5))}><Minus className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.5))}><Plus className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
        <div className="h-[40dvh] overflow-auto rounded-lg border bg-muted touch-pan-x touch-pan-y lg:h-[60dvh]">
          {mimeType === "application/pdf" ? (
            <iframe src={previewUrl} title="Original document" className="h-full w-full" />
          ) : (
            <img src={previewUrl} alt="Original stock list" style={{ width: `${zoom * 100}%` }} className="max-w-none" />
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className={cn("text-sm", open ? "text-warning" : "text-muted-foreground")}>
          {rows.length} rows read. {open
            ? `${open} unclear value(s) need checking — type the correct value, leave it blank, or skip the row.`
            : "All values checked. Blank prices stay Unknown, never €0. Stock quantities are not read."}
        </p>
        {rows.map((r) => {
          const rowOpen = EXTRACT_FIELDS.filter((f) => !r.cells[f].resolved).length;
          return (
            <div key={r.id} className={cn("space-y-2 rounded-lg border p-3", r.skip && "opacity-50")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Line {r.id}</span>
                <div className="flex items-center gap-2">
                  {!r.skip && rowOpen > 0 && <Badge className="bg-warning/15 text-warning">{rowOpen} unclear</Badge>}
                  <Button variant="outline" className="h-11" onClick={() => update(r.id, (x) => ({ ...x, skip: !x.skip }))}>
                    {r.skip ? "Include row" : "Skip row"}
                  </Button>
                </div>
              </div>
              {!r.skip && (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {EXTRACT_FIELDS.map((f) => {
                    const c = r.cells[f];
                    return (
                      <div key={f} className={cn("space-y-1", f === "itemName" && "sm:col-span-2")}>
                        <label className="text-xs text-muted-foreground">{LABEL[f]}</label>
                        <Input
                          className={cn("h-11", !c.resolved && "border-warning bg-warning/10")}
                          value={c.value}
                          inputMode={f === "packSize" || f === "packCost" ? "decimal" : undefined}
                          placeholder={c.unclear && c.raw ? `Seen: ${c.raw}` : ""}
                          onChange={(e) => setCell(r.id, f, { value: e.target.value, resolved: true })}
                        />
                        {c.unclear && (
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-warning">Unclear{c.raw ? ` — seen "${c.raw}"` : ""}</span>
                            {!c.resolved && (
                              <button type="button" className="min-h-[44px] px-2 underline" onClick={() => setCell(r.id, f, { value: "", resolved: true })}>
                                Leave blank
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
