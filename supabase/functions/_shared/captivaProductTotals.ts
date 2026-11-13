import type { CaptivaJournalPreview } from "./captivaJournal.ts";

export interface CaptivaProductTotal {
  external_item_id: string;
  plu: string;
  name: string;
  quantity: number;
  gross_cents: number;
  receipt_count: number;
  modifier_count: number;
}

/** Stable, exact-name identity: Captiva reuses some PLUs for unrelated buttons. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function toCaptivaProductTotals(journal: CaptivaJournalPreview): CaptivaProductTotal[] {
  const totals = new Map<string, CaptivaProductTotal & { receipts: Set<string> }>();
  for (const line of journal.lines) {
    const name = line.name.trim();
    const key = `${line.product_id}\u0000${name}`;
    const old = totals.get(key);
    if (old) {
      old.quantity += line.quantity;
      old.gross_cents += line.gross_cents;
      old.modifier_count += line.nested_options.length;
      old.receipts.add(line.receipt_id);
    } else {
      totals.set(key, {
        external_item_id: `${line.product_id}#${fnv1a(name)}`,
        plu: line.product_id,
        name,
        quantity: line.quantity,
        gross_cents: line.gross_cents,
        modifier_count: line.nested_options.length,
        receipt_count: 0,
        receipts: new Set([line.receipt_id]),
      });
    }
  }
  const rows = [...totals.values()].map(({ receipts, ...row }) => ({
    ...row,
    receipt_count: receipts.size,
  })).sort((a,b) => a.external_item_id.localeCompare(b.external_item_id));
  if (rows.reduce((n, r) => n + r.gross_cents, 0) !== journal.gross_cents) {
    throw new Error("Aggregated product revenue does not reconcile to the journal");
  }
  if (new Set(rows.map(r => r.external_item_id)).size !== rows.length) {
    throw new Error("Two Captiva product names produced the same identifier");
  }
  return rows;
}
