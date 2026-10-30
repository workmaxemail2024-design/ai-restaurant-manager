/**
 * Expense Import: reads accountant workbooks (one worksheet per restaurant) or rows
 * read from a PDF/photo, and turns them into review rows. Writes nothing — the
 * reviewed rows go to apply_expense_import in one all-or-nothing call.
 * Never assumes VAT, accounting months or payroll scope: unknown stays unknown
 * until the user chooses.
 */
import * as XLSX from "xlsx";
import { similarity } from "./stockListImport";
import { monthlyEquivalent, type Frequency, type PayrollScope, type VatTreatment } from "./monthlyFinancials";

export const EXPENSE_CATEGORIES = [
  "Rent", "Utilities", "Insurance", "Marketing", "Software", "Licences", "Waste", "Internet",
  "Professional fees", "Bank & card fees", "Repairs & maintenance", "Cleaning", "Equipment", "Other",
] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export type RowKind = "estimate" | "actual" | "payroll" | "skip";

export const KIND_LABELS: Record<RowKind, string> = {
  estimate: "Recurring estimate",
  actual: "Actual bill",
  payroll: "Confirmed payroll",
  skip: "Skip",
};

// ---------- reading ----------

type Field = "category" | "supplier" | "monthly" | "quarterly" | "annual" | "type" | "notes" | "invoiceRef" | "amount" | "billDate" | "vatAmount";

const HEADERS: Record<string, Field> = {
  category: "category", expensecategory: "category", costcategory: "category",
  expensesupplier: "supplier", supplier: "supplier", expense: "supplier", description: "supplier", item: "supplier", payee: "supplier", supplierexpense: "supplier",
  monthlycost: "monthly", monthly: "monthly", permonth: "monthly", monthlyamount: "monthly",
  quarterly: "quarterly", quarterlycost: "quarterly", perquarter: "quarterly",
  annualcost: "annual", annual: "annual", yearly: "annual", peryear: "annual", annualamount: "annual",
  type: "type", costtype: "type", fixedvariable: "type",
  notessource: "notes", notes: "notes", source: "notes", comments: "notes", note: "notes",
  invoiceno: "invoiceRef", invoicenumber: "invoiceRef", invoice: "invoiceRef", reference: "invoiceRef", ref: "invoiceRef", billno: "invoiceRef",
  amount: "amount", total: "amount", cost: "amount", gross: "amount", totalamount: "amount",
  date: "billDate", invoicedate: "billDate", billdate: "billDate",
  vat: "vatAmount", vatamount: "vatAmount",
};
const headerKey = (h: string) => h.toLowerCase().replace(/eur|€/g, "").replace(/[^a-z]/g, "");

export interface SourceRow {
  sheet: string;
  rowNumber: number;
  category: string;
  supplier: string;
  monthly: string;
  quarterly: string;
  annual: string;
  type: string;
  notes: string;
  invoiceRef: string;
  amount: string;
  billDate: string;
  vatAmount: string;
}

export interface SheetResult {
  name: string;
  recognised: boolean;
  rows: SourceRow[];
}

const emptySource = (sheet: string, rowNumber: number): SourceRow => ({
  sheet, rowNumber, category: "", supplier: "", monthly: "", quarterly: "", annual: "", type: "", notes: "",
  invoiceRef: "", amount: "", billDate: "", vatAmount: "",
});

/** One worksheet grid → source rows. Header = first row (of the first 15) naming at least two known columns. */
export function gridToRows(name: string, grid: string[][]): SheetResult {
  let headerIdx = -1;
  let map: (Field | null)[] = [];
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const m = grid[i].map((c) => HEADERS[headerKey(c)] ?? null);
    const known = m.filter(Boolean);
    if (known.length >= 2 && (m.includes("supplier") || m.includes("category"))) { headerIdx = i; map = m; break; }
  }
  if (headerIdx < 0) return { name, recognised: false, rows: [] };
  const seen = new Set<Field>();
  map = map.map((f) => (f && !seen.has(f) ? (seen.add(f), f) : null));
  const rows: SourceRow[] = [];
  grid.slice(headerIdx + 1).forEach((r, i) => {
    const row = emptySource(name, headerIdx + i + 2);
    map.forEach((f, c) => { if (f) row[f] = String(r[c] ?? "").trim(); });
    if (!row.category && !row.supplier && !row.monthly && !row.quarterly && !row.annual && !row.amount) return;
    rows.push(row);
  });
  return { name, recognised: true, rows };
}

/** Reads every worksheet (XLSX) or the single CSV sheet. */
export async function readExpenseWorkbook(file: File): Promise<SheetResult[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const isCsv = /\.csv$/i.test(file.name);
  return wb.SheetNames.map((sheetName) => {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: false, defval: "" })
      .map((r) => r.map((c) => String(c ?? "").trim()));
    return gridToRows(isCsv ? file.name.replace(/\.csv$/i, "") : sheetName, grid);
  });
}

export async function fileHash(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- interpretation ----------

/** Euro amounts like "€1,234.56", "1.234,56", "37382.65". Empty/unparseable → null. */
export function parseAmount(s: string): number | null {
  if (!s) return null;
  let t = s.replace(/[€\s]|eur/gi, "");
  if (/^\(.*\)$/.test(t)) return null; // negatives/credits need manual entry
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.01);

export interface FrequencyResult {
  frequency: Frequency | null;
  amount: number | null;
  conflict: string | null;
}

/** Picks the cost and frequency from the Monthly / Quarterly / Annual columns without guessing. */
export function resolveFrequency(monthly: string, quarterly: string, annual: string): FrequencyResult {
  const m = parseAmount(monthly), q = parseAmount(quarterly), a = parseAmount(annual);
  const filled = [m, q, a].filter((v) => v != null).length;
  if (filled === 0) return { frequency: null, amount: null, conflict: null };
  if (filled === 1) {
    if (m != null) return { frequency: "monthly", amount: m, conflict: null };
    if (q != null) return { frequency: "quarterly", amount: q, conflict: null };
    return { frequency: "yearly", amount: a, conflict: null };
  }
  // Several columns: they must describe the same cost.
  const consistent =
    (m == null || q == null || close(m * 3, q)) &&
    (m == null || a == null || close(m * 12, a)) &&
    (q == null || a == null || close(q * 4, a));
  if (!consistent) {
    return { frequency: null, amount: null, conflict: `Monthly ${monthly || "—"}, quarterly ${quarterly || "—"}, annual ${annual || "—"} disagree` };
  }
  if (m != null) return { frequency: "monthly", amount: m, conflict: null };
  return { frequency: "quarterly", amount: q, conflict: null };
}

const PAYROLL_RE = /payroll|wages?|salar|prsi|paye|labou?r\s*cost|staff\s*cost|employment\s*cost/i;
const FOOD_RE = /\b(food|beverage|drinks?|bar\s*stock|stock\s*purchas\w*|cost\s*of\s*sales|cogs|purchases|meat|fish|produce|vegetables?|dairy|wine|beer|spirits|coffee\s*beans)\b/i;
const TOTAL_RE = /^(sub\s*)?totals?\b|^grand\s*total|^total\s/i;

const CATEGORY_RULES: [RegExp, ExpenseCategory][] = [
  [/\brent|lease\b|landlord/i, "Rent"],
  [/electric|\bgas\b|water|utilit|energy|heating|\boil\b|esb|bord g/i, "Utilities"],
  [/insur/i, "Insurance"],
  [/market|advert|promo|social media|instagram|facebook|google ads/i, "Marketing"],
  [/software|subscription|saas|epos|pos system|app\b/i, "Software"],
  [/licen[cs]|permit|imro|ppi|music rights|tv licen/i, "Licences"],
  [/waste|\bbins?\b|refuse|recycl|grease trap/i, "Waste"],
  [/internet|broadband|phone|telephone|mobile|wifi/i, "Internet"],
  [/accountan|legal|solicitor|professional|bookkeep|audit|consult/i, "Professional fees"],
  [/bank|card fee|merchant|stripe|sumup|square|elavon|global payments|charges/i, "Bank & card fees"],
  [/repair|maintenance|service contract|plumb|electrician|refrigeration/i, "Repairs & maintenance"],
  [/clean|laundry|linen|hygiene|pest/i, "Cleaning"],
  [/equipment|hire\b|rental|smallwares|crockery|cutlery/i, "Equipment"],
];

export function mapCategory(category: string, supplier: string): ExpenseCategory | null {
  const exact = EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === category.trim().toLowerCase());
  if (exact) return exact;
  for (const text of [category, supplier]) {
    if (!text) continue;
    for (const [re, cat] of CATEGORY_RULES) if (re.test(text)) return cat;
  }
  return null;
}

/** VAT treatment only when the file states it; otherwise unknown. */
export function detectVat(...texts: string[]): VatTreatment | null {
  const t = texts.join(" ").toLowerCase();
  if (/\bno vat\b|vat exempt|exempt from vat|zero[- ]rated|0% vat/.test(t)) return "no_vat";
  if (/\b(ex|excl|excluding|exclusive of|net of|plus|\+)\.?\s*vat\b|\bvat excl/.test(t)) return "ex_vat";
  if (/\b(inc|incl|including|inclusive of)\.?\s*vat\b|\bvat incl|\bgross\b(?!\s*wages)/.test(t)) return "inc_vat";
  return null;
}

/** Payroll scope only when the text states it. */
export function detectPayrollScope(...texts: string[]): PayrollScope | null {
  const t = texts.join(" ").toLowerCase();
  const gross = /gross/.test(t);
  const prsi = /employer'?s?\s*prsi|ers\s*prsi|\bprsi\b/.test(t);
  if (/total\s*(employment|staff)\s*cost/.test(t)) return "total_employment_cost";
  if (gross && prsi) return "gross_wages_employer_prsi";
  if (gross) return "gross_wages";
  return null;
}

export function detectCostType(type: string): "fixed" | "variable" | null {
  if (/fixed/i.test(type)) return "fixed";
  if (/variable/i.test(type)) return "variable";
  return null;
}

export interface ReviewRow {
  key: string;
  sheet: string;
  rowNumber: number;
  sourceRef: string;
  kind: RowKind;
  kindReason: string | null;
  name: string;
  supplier: string;
  category: ExpenseCategory | "";
  sourceCategory: string;
  amount: string;
  frequency: Frequency | "";
  frequencyConflict: string | null;
  costType: "fixed" | "variable" | "";
  vat: VatTreatment;
  vatFromFile: boolean;
  vatAmount: string;
  notes: string;
  invoiceRef: string;
  billDate: string;
  /** null = follow the worksheet's location */
  locationOverride: string | null;
  /** YYYY-MM; "" = follow the import-level month (required either way) */
  startMonth: string;
  periodMonth: string;
  replacesOverheadId: string | null;
  replaceSuggested: boolean;
  payrollScope: PayrollScope | "";
  payrollScopeFromFile: boolean;
  payrollScopeNote: string;
  payrollConfirmed: boolean;
  replacePayrollId: string | null;
  changeReason: string;
  confirmDuplicate: boolean;
}

/** Turns one source row into an editable review row. `defaultKind` = what the file mostly contains. */
export function interpretRow(src: SourceRow, defaultKind: "estimate" | "actual", fileHashValue: string): ReviewRow {
  const name = src.supplier || src.category;
  const freq = resolveFrequency(src.monthly, src.quarterly, src.annual);
  const single = parseAmount(src.amount);
  const isPayroll = PAYROLL_RE.test(`${src.category} ${src.supplier}`);
  const isFood = !isPayroll && FOOD_RE.test(src.category);
  const isTotal = TOTAL_RE.test(src.supplier) || TOTAL_RE.test(src.category);
  const vat = detectVat(src.notes, src.type);
  const scope = detectPayrollScope(src.supplier, src.category, src.notes);

  let kind: RowKind = defaultKind;
  let kindReason: string | null = null;
  let amount: number | null = defaultKind === "actual" ? (single ?? freq.amount) : (freq.amount ?? single);
  let frequency: Frequency | "" = defaultKind === "estimate" ? (freq.frequency ?? "") : "";

  if (isTotal) { kind = "skip"; kindReason = "Total row"; }
  else if (isPayroll) {
    kind = "payroll";
    kindReason = "Payroll goes to confirmed monthly labour, not overheads";
    // Payroll needs a monthly total; never derive it from quarterly/annual figures.
    const m = parseAmount(src.monthly) ?? single;
    amount = m;
    frequency = "";
  } else if (isFood) { kind = "skip"; kindReason = "Food & drink purchases come from supplier invoices and stock"; }
  else if (amount == null && !freq.conflict) { kind = "skip"; kindReason = "No amount"; }

  return {
    key: `${src.sheet}:${src.rowNumber}`,
    sheet: src.sheet,
    rowNumber: src.rowNumber,
    sourceRef: `${fileHashValue}:${src.sheet}:${src.rowNumber}`,
    kind,
    kindReason,
    name: name.slice(0, 200),
    supplier: src.supplier,
    category: mapCategory(src.category, src.supplier) ?? "",
    sourceCategory: src.category,
    amount: amount != null ? amount.toFixed(2) : "",
    frequency,
    frequencyConflict: isPayroll ? null : freq.conflict,
    costType: detectCostType(src.type) ?? "",
    vat: vat ?? "unknown",
    vatFromFile: vat != null,
    vatAmount: parseAmount(src.vatAmount)?.toFixed(2) ?? "",
    notes: src.notes,
    invoiceRef: src.invoiceRef,
    billDate: /^\d{4}-\d{2}-\d{2}$/.test(src.billDate) ? src.billDate : "",
    locationOverride: null,
    startMonth: "",
    periodMonth: "",
    replacesOverheadId: null,
    replaceSuggested: false,
    payrollScope: scope ?? "",
    payrollScopeFromFile: scope != null,
    payrollScopeNote: "",
    payrollConfirmed: false,
    replacePayrollId: null,
    changeReason: "",
    confirmDuplicate: false,
  };
}

// ---------- locations ----------

const LOC_STOP = new Set(["restaurant", "the", "bistro", "bar", "winebar", "wine", "and", "cafe", "ltd", "limited", "sheet"]);
const locTokens = (s: string) =>
  s.toLowerCase().replace(/['’]s\b/g, "s").replace(/&/g, " ").replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t && !LOC_STOP.has(t));

export interface LocationMatch { locationId: string | null; confidence: "exact" | "suggested" | "none"; }

/** Worksheet name → location. Only an unambiguous exact match is pre-confirmed. */
export function matchLocation(sheetName: string, locations: { id: string; name: string }[]): LocationMatch {
  const st = locTokens(sheetName);
  if (!st.length) return { locationId: null, confidence: "none" };
  const plain = (x: string) => x.toLowerCase().replace(/['’]s\b/g, "s").replace(/[^a-z0-9]+/g, " ").trim();
  const exact = locations.filter((l) => plain(l.name) === plain(sheetName));
  if (exact.length === 1) return { locationId: exact[0].id, confidence: "exact" };
  const scored = locations
    .map((l) => {
      const lt = locTokens(l.name);
      const overlap = st.filter((t) => lt.includes(t)).length;
      const subset = overlap > 0 && (overlap === st.length || overlap === lt.length);
      return { id: l.id, score: subset ? 0.9 : Math.max(overlap / Math.max(st.length, lt.length), similarity(sheetName, l.name)) };
    })
    .sort((a, b) => b.score - a.score);
  if (scored.length && scored[0].score >= 0.6 && (scored.length === 1 || scored[0].score - scored[1].score >= 0.15)) {
    return { locationId: scored[0].id, confidence: "suggested" };
  }
  return { locationId: null, confidence: "none" };
}

// ---------- duplicates ----------

export const supplierKey = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/\b(ltd|limited|plc|inc|co|company|the)\b/g, " ").replace(/[^a-z0-9]+/g, "");
export const dedupeKey = (supplier: string | null | undefined, description: string, amount: number) =>
  `${supplierKey(supplier)}|${description.toLowerCase().replace(/[^a-z0-9]+/g, "")}|${amount.toFixed(2)}`;
const sameRef = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export interface ExistingActual {
  id: string; location_id: string; period_month: string; supplier_name: string | null; description: string;
  amount: number; invoice_reference: string | null; source_ref: string | null; status: string;
}
export interface ExistingSupplierInvoice {
  id: string; location_id: string; supplier_name: string; invoice_number: string; invoice_date: string;
  gross_amount: number; net_amount: number | null; status: string;
}
export interface ExistingOverhead {
  id: string; location_id: string | null; name: string; supplier_name?: string | null; category: string;
  amount: number; frequency: string; is_active: boolean; start_date: string | null; end_date: string | null;
}
export interface ExistingPayroll { id: string; location_id: string; period_month: string; amount: number; scope: string; status: string; }

export interface DuplicateFinding { level: "definite" | "possible"; message: string; }

export const monthStart = (ym: string) => (ym ? `${ym}-01` : "");

/**
 * Mirrors the server rules so the review shows them up front:
 * definite = same supplier + invoice number (or same file row re-imported) → must skip;
 * possible = same supplier/description/amount/month where an invoice number is missing → you decide.
 * Two bills with different invoice numbers are never flagged.
 */
export function findDuplicate(
  row: { kind: RowKind; locationId: string | null; periodMonth: string; supplier: string; name: string; amount: number | null; invoiceRef: string; sourceRef: string; frequency: string; startMonth: string },
  ctx: { actuals: ExistingActual[]; supplierInvoices: ExistingSupplierInvoice[]; overheads: ExistingOverhead[]; earlierRows: { locationId: string | null; periodMonth: string; supplier: string; name: string; amount: number | null; invoiceRef: string }[] },
): DuplicateFinding | null {
  if (!row.locationId || row.amount == null) return null;
  if (row.kind === "estimate") {
    const n = row.name.trim().toLowerCase();
    const hit = ctx.overheads.find((o) => o.is_active && o.location_id === row.locationId && o.name.trim().toLowerCase() === n
      && Math.abs(Number(o.amount) - row.amount!) < 0.005 && o.frequency === row.frequency);
    return hit ? { level: "definite", message: `Already an active overhead: ${hit.name}` } : null;
  }
  if (row.kind !== "actual") return null;
  const month = monthStart(row.periodMonth);
  const skey = supplierKey(row.supplier);
  const ref = row.invoiceRef.trim();

  const active = ctx.actuals.filter((e) => e.status === "active" && e.location_id === row.locationId);
  if (active.some((e) => e.source_ref && e.source_ref === row.sourceRef)) {
    return { level: "definite", message: "This row of this file was already imported" };
  }
  if (ref) {
    const e = active.find((x) => supplierKey(x.supplier_name) === skey && sameRef(x.invoice_reference, ref));
    if (e) return { level: "definite", message: `Invoice ${ref} is already recorded` };
    const si = ctx.supplierInvoices.find((x) => x.status !== "void" && skey && supplierKey(x.supplier_name) === skey && sameRef(x.invoice_number, ref));
    if (si) return { level: "definite", message: `Invoice ${ref} is already a supplier invoice` };
    const eb = ctx.earlierRows.find((x) => x.locationId === row.locationId && supplierKey(x.supplier) === skey && sameRef(x.invoiceRef, ref));
    if (eb) return { level: "definite", message: `Invoice ${ref} appears twice in this file` };
  }
  if (!month) return null;
  const key = dedupeKey(row.supplier, row.name, row.amount);
  const e = active.find((x) => x.period_month === month && dedupeKey(x.supplier_name, x.description, Number(x.amount)) === key && (!ref || !x.invoice_reference));
  if (e) return { level: "possible", message: `Same supplier, amount and month as an existing bill${e.invoice_reference ? ` (${e.invoice_reference})` : ""}` };
  const eb = ctx.earlierRows.find((x) => x.locationId === row.locationId && monthStart(x.periodMonth) === month && x.amount != null
    && dedupeKey(x.supplier, x.name, x.amount) === key && (!ref || !x.invoiceRef.trim()));
  if (eb) return { level: "possible", message: "Same supplier, amount and month as another row in this file" };
  if (skey && !ref) {
    const si = ctx.supplierInvoices.find((x) => x.status !== "void" && x.location_id === row.locationId && supplierKey(x.supplier_name) === skey
      && x.invoice_date.slice(0, 7) === row.periodMonth && (Math.abs(Number(x.gross_amount) - row.amount!) < 0.005 || (x.net_amount != null && Math.abs(Number(x.net_amount) - row.amount!) < 0.005)));
    if (si) return { level: "possible", message: `Matches supplier invoice ${si.invoice_number}` };
  }
  return null;
}

/** Suggest the recurring estimate an actual bill stands in for (same location only). */
export function suggestReplacedEstimate(row: { locationId: string | null; name: string; supplier: string; category: string }, overheads: ExistingOverhead[]): string | null {
  if (!row.locationId) return null;
  const candidates = overheads.filter((o) => o.is_active && o.location_id === row.locationId);
  const byName = candidates.filter((o) => similarity(o.name, row.name) >= 0.8 || (!!row.supplier && !!o.supplier_name && supplierKey(o.supplier_name) === supplierKey(row.supplier)));
  if (byName.length === 1) return byName[0].id;
  return null;
}

// ---------- validation & payload ----------

export interface RowContext {
  locationId: string | null;
  startMonth: string;
  periodMonth: string;
  duplicate: DuplicateFinding | null;
  existingPayroll: ExistingPayroll | null;
  currentMonth: string; // YYYY-MM
}

export function effective(row: ReviewRow, sheetLocation: string | null, importStart: string, importPeriod: string) {
  return {
    locationId: row.locationOverride ?? sheetLocation,
    startMonth: row.startMonth || importStart,
    periodMonth: row.periodMonth || importPeriod,
  };
}

/** Blocking problems; an empty list means the row can be saved. */
export function rowIssues(row: ReviewRow, ctx: RowContext): string[] {
  if (row.kind === "skip") return [];
  const out: string[] = [];
  const amt = parseAmount(row.amount);
  if (!ctx.locationId) out.push("Choose a location");
  if (amt == null) out.push(row.frequencyConflict ?? "Enter an amount");
  if (row.kind !== "payroll") {
    if (!row.name.trim()) out.push("Enter a name");
    if (!row.category) out.push("Choose a category");
  }
  if (row.kind === "estimate") {
    if (!row.frequency) out.push(row.frequencyConflict ?? "Choose how often");
    if (!ctx.startMonth) out.push("Choose the month it applies from");
  }
  if (row.kind === "actual" || row.kind === "payroll") {
    if (!ctx.periodMonth) out.push("Choose the accounting month");
    else if (ctx.periodMonth > ctx.currentMonth) out.push("Accounting month is in the future");
  }
  if (row.kind === "actual" && row.vatAmount.trim()) {
    const v = parseAmount(row.vatAmount);
    if (v == null) out.push("VAT amount is not a number");
    else if (row.vat === "unknown" || row.vat === "no_vat") out.push("A VAT amount needs Includes or Excludes VAT");
    else if (row.vat === "inc_vat" && amt != null && v >= amt) out.push("VAT must be less than the total");
  }
  if (row.kind === "payroll") {
    if (!row.payrollScope) out.push("Choose what the payroll includes");
    if (row.payrollScope === "other" && !row.payrollScopeNote.trim()) out.push("Describe what the payroll includes");
    if (ctx.existingPayroll) {
      if (row.replacePayrollId !== ctx.existingPayroll.id) out.push("Payroll already confirmed for this month — choose Correct or Skip");
      else if (!row.changeReason.trim()) out.push("Give a reason for the correction");
    }
    if (!row.payrollConfirmed) out.push("Tick to confirm the location, month and scope");
  }
  if (ctx.duplicate?.level === "definite") out.push(`${ctx.duplicate.message} — skip this row`);
  if (ctx.duplicate?.level === "possible" && !row.confirmDuplicate) out.push(`Possible duplicate: ${ctx.duplicate.message} — confirm it is separate or skip`);
  return out;
}

export function toPayloadRow(row: ReviewRow, ctx: RowContext, locationName: string) {
  const base = {
    kind: row.kind,
    row_label: `${row.sheet} row ${row.rowNumber}${locationName ? ` (${locationName})` : ""}`,
    location_id: ctx.locationId,
    amount: parseAmount(row.amount)?.toFixed(2) ?? "",
  };
  if (row.kind === "payroll") {
    return {
      ...base,
      period_month: monthStart(ctx.periodMonth),
      scope: row.payrollScope,
      scope_note: row.payrollScopeNote.trim() || (row.notes ? row.notes.slice(0, 500) : null),
      replace_payroll_id: row.replacePayrollId,
      change_reason: row.changeReason.trim() || null,
    };
  }
  const common = {
    ...base,
    name: row.name.trim(),
    supplier_name: row.supplier.trim() || null,
    category: row.category,
    source_category: row.sourceCategory || null,
    vat_treatment: row.vat,
    cost_type: row.costType || null,
    notes: row.notes || null,
  };
  if (row.kind === "estimate") {
    return { ...common, frequency: row.frequency, start_date: monthStart(ctx.startMonth) };
  }
  return {
    ...common,
    period_month: monthStart(ctx.periodMonth),
    bill_date: row.billDate || null,
    vat_amount: row.vatAmount.trim() ? parseAmount(row.vatAmount)?.toFixed(2) : null,
    invoice_reference: row.invoiceRef.trim() || null,
    source_ref: row.sourceRef,
    replaces_overhead_id: row.replacesOverheadId,
    confirm_possible_duplicate: ctx.duplicate?.level === "possible" ? row.confirmDuplicate : false,
  };
}

/** Monthly equivalent shown in the review (e.g. €900 quarterly → €300 / month). */
export function reviewMonthly(row: ReviewRow): number | null {
  const a = parseAmount(row.amount);
  if (a == null || !row.frequency) return null;
  return monthlyEquivalent(a, row.frequency);
}
