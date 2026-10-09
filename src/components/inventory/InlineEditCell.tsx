import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared look: plain text, subtle dotted underline only when editable. */
const triggerCls = "min-h-[36px] -mx-1 rounded px-1 text-left underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface SaveFn { (): Promise<void> }

function useSaver() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: SaveFn) => {
    setSaving(true); setError(null);
    try { await fn(); return true; }
    catch (e) { setError((e as Error).message || "Save failed"); return false; }
    finally { setSaving(false); }
  };
  return { saving, error, setError, run };
}

function Status({ saving, error }: { saving: boolean; error: string | null }) {
  if (saving) return <Loader2 className="ml-1 inline h-3 w-3 animate-spin text-muted-foreground" aria-label="Saving" />;
  if (error) return <div className="mt-0.5 max-w-[14rem] text-xs text-destructive">Not saved: {error}</div>;
  return null;
}

/** Dropdown cell: choosing an option saves immediately. */
export function InlineSelectCell({
  editable, display, value, options, onSave, label,
}: {
  editable: boolean; display: ReactNode; value: string; label: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const s = useSaver();
  if (!editable) return <>{display}</>;
  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={triggerCls} aria-label={`Edit ${label}`} disabled={s.saving}>{display}</button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-1" align="start">
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            {options.map((o) => (
              <button key={o.value} type="button"
                className={cn("flex min-h-[44px] w-full items-center justify-between rounded px-3 text-left text-sm hover:bg-muted", o.value === value && "font-medium")}
                onClick={async () => {
                  setOpen(false);
                  if (o.value !== value) await s.run(() => onSave(o.value));
                }}>
                {o.label}{o.value === value && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Status saving={s.saving} error={s.error} />
    </div>
  );
}

/** Text cell: Enter saves, Escape / blur cancels. */
export function InlineTextCell({
  editable, value, onSave, label,
}: { editable: boolean; value: string; label: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const s = useSaver();
  if (!editable) return <>{value}</>;
  if (editing) {
    return (
      <div>
        <Input autoFocus className="h-11 min-w-[12rem]" value={draft} aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={async (e) => {
            if (e.key === "Escape") { setEditing(false); return; }
            if (e.key !== "Enter") return;
            const v = draft.trim();
            if (!v) { s.setError("Name cannot be blank"); return; }
            if (v.length > 200) { s.setError("Name is too long"); return; }
            setEditing(false);
            if (v !== value) await s.run(() => onSave(v));
          }} />
        <Status saving={false} error={s.error} />
      </div>
    );
  }
  return (
    <div>
      <button type="button" className={cn(triggerCls, "font-medium")} aria-label={`Edit ${label}`} disabled={s.saving}
        onClick={() => { setDraft(value); s.setError(null); setEditing(true); }}>{value}</button>
      <Status saving={s.saving} error={s.error} />
    </div>
  );
}

/** Popover with custom body and explicit Confirm (used for unit / pack size). */
export function InlineConfirmCell({
  editable, display, label, children, onConfirm, canConfirm, onOpen,
}: {
  editable: boolean; display: ReactNode; label: string; children: ReactNode;
  onConfirm: () => Promise<void>; canConfirm: boolean; onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const s = useSaver();
  if (!editable) return <>{display}</>;
  return (
    <div>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { s.setError(null); onOpen?.(); } }}>
        <PopoverTrigger asChild>
          <button type="button" className={triggerCls} aria-label={`Edit ${label}`} disabled={s.saving}>{display}</button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3" align="start">
          {children}
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="h-11" disabled={!canConfirm} onClick={async () => {
              setOpen(false);
              await s.run(onConfirm);
            }}>Confirm</Button>
          </div>
        </PopoverContent>
      </Popover>
      <Status saving={s.saving} error={s.error} />
    </div>
  );
}
