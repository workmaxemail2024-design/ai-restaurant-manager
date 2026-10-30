import { describe, expect, it } from "bun:test";
import {
  findDuplicate,
  gridToRows,
  interpretRow,
  matchLocation,
  parseAmount,
  resolveFrequency,
  reviewMonthly,
  rowIssues,
  toPayloadRow,
  type ExistingActual,
} from "../src/lib/expenseImport";

const HEADER = ["Category", "Expense / Supplier", "Monthly Cost (€)", "Quarterly (€)", "Annual Cost (€)", "Type", "Notes / Source"];
const locations = [
  { id: "max", name: "Maximilians Bistro & Winebar" },
  { id: "rudy", name: "Rudys Bl" },
];

describe("workbook reading", () => {
  const rudys = gridToRows("Rudy's", [
    ["Rudy's monthly costs"],
    HEADER,
    ["Rent", "Landlord Ltd", "4,500.00", "", "", "Fixed", "Lease"],
    ["Insurance", "Allianz", "", "900", "", "Fixed", ""],
    ["Licences", "IMRO", "", "", "1,200", "Fixed", "ex VAT"],
    ["Payroll", "Staff wages", "37,382.65", "", "", "Variable", "Gross wages + employer PRSI"],
    ["Food purchases", "Gahan Meats", "8,000", "", "", "Variable", ""],
    ["Total", "", "51,382.65", "", "", "", ""],
  ]);
  const maxis = gridToRows("Maximilians", [HEADER, ["Utilities", "Electric Ireland", "600", "1800", "7200", "Variable", ""]]);

  it("finds the header below a title row on each worksheet", () => {
    expect(rudys.recognised).toBe(true);
    expect(rudys.rows.length).toBe(6);
    expect(maxis.rows.length).toBe(1);
  });
  it("matches worksheets to locations, confirming only exact names", () => {
    expect(matchLocation("Rudy's", locations)).toEqual({ locationId: "rudy", confidence: "suggested" });
    expect(matchLocation("Maximilians", locations)).toEqual({ locationId: "max", confidence: "suggested" });
    expect(matchLocation("Rudys BL", locations)).toEqual({ locationId: "rudy", confidence: "exact" });
    expect(matchLocation("Head office", locations).locationId).toBeNull();
  });

  const rows = rudys.rows.map((r) => interpretRow(r, "estimate", "h"));
  it("monthly rent stays monthly", () => {
    expect(rows[0]).toMatchObject({ kind: "estimate", frequency: "monthly", amount: "4500.00", category: "Rent", costType: "fixed", vat: "unknown" });
  });
  it("quarterly €900 converts to €300 a month", () => {
    expect(rows[1].frequency).toBe("quarterly");
    expect(reviewMonthly(rows[1])).toBe(300);
  });
  it("annual €1,200 converts to €100 a month and keeps the stated VAT", () => {
    expect(rows[2]).toMatchObject({ frequency: "yearly", vat: "ex_vat", vatFromFile: true });
    expect(reviewMonthly(rows[2])).toBe(100);
  });
  it("routes payroll to confirmed payroll with the stated scope, month left blank", () => {
    expect(rows[3]).toMatchObject({ kind: "payroll", amount: "37382.65", payrollScope: "gross_wages_employer_prsi", periodMonth: "" });
  });
  it("skips food purchases and total rows", () => {
    expect(rows[4].kind).toBe("skip");
    expect(rows[5].kind).toBe("skip");
  });
  it("consistent monthly/quarterly/annual columns are one monthly cost", () => {
    expect(interpretRow(maxis.rows[0], "estimate", "h")).toMatchObject({ frequency: "monthly", amount: "600.00" });
  });
  it("disagreeing columns are flagged, never guessed", () => {
    expect(resolveFrequency("600", "", "6000")).toMatchObject({ frequency: null, amount: null });
  });
});

describe("amounts", () => {
  it("reads euro formats", () => {
    expect(parseAmount("€1,234.56")).toBe(1234.56);
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("37382.65")).toBe(37382.65);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("n/a")).toBeNull();
  });
});

describe("required confirmations", () => {
  const src = gridToRows("Rudys", [HEADER, ["Payroll", "Wages", "37382.65", "", "", "", "Gross wages plus employer PRSI"]]).rows[0];
  const payroll = interpretRow(src, "estimate", "h");
  const ctx = { locationId: "rudy", startMonth: "", periodMonth: "", duplicate: null, existingPayroll: null, currentMonth: "2026-10" };
  it("payroll needs a month and an explicit confirmation", () => {
    const issues = rowIssues(payroll, ctx);
    expect(issues).toContain("Choose the accounting month");
    expect(issues).toContain("Tick to confirm the location, month and scope");
  });
  it("payroll for a month that already has one needs Correct + reason", () => {
    const issues = rowIssues({ ...payroll, payrollConfirmed: true }, { ...ctx, periodMonth: "2026-09", existingPayroll: { id: "p1", location_id: "rudy", period_month: "2026-09-01", amount: 1, scope: "gross_wages", status: "active" } });
    expect(issues).toContain("Payroll already confirmed for this month — choose Correct or Skip");
  });
  it("an estimate needs the month it applies from", () => {
    const est = interpretRow(gridToRows("Rudys", [HEADER, ["Rent", "Landlord", "4500", "", "", "", ""]]).rows[0], "estimate", "h");
    expect(rowIssues(est, ctx)).toContain("Choose the month it applies from");
    expect(rowIssues(est, { ...ctx, startMonth: "2026-01" })).toEqual([]);
  });
  it("payload sends the month as the first of the month", () => {
    const p = toPayloadRow({ ...payroll, payrollConfirmed: true }, { ...ctx, periodMonth: "2026-09" }, "Rudys Bl") as Record<string, unknown>;
    expect(p).toMatchObject({ kind: "payroll", period_month: "2026-09-01", amount: "37382.65", scope: "gross_wages_employer_prsi" });
  });
});

describe("duplicates", () => {
  const existing: ExistingActual[] = [
    { id: "e1", location_id: "rudy", period_month: "2026-09-01", supplier_name: "Electric Ireland", description: "Electricity", amount: 450, invoice_reference: "INV-1001", source_ref: "h:Rudys:3", status: "active" },
  ];
  const row = { kind: "actual" as const, locationId: "rudy", periodMonth: "2026-09", supplier: "Electric Ireland", name: "Electricity", amount: 450, invoiceRef: "", sourceRef: "x", frequency: "", startMonth: "" };
  const ctx = { actuals: existing, supplierInvoices: [], overheads: [], earlierRows: [] };

  it("a different invoice number is a separate bill, not a duplicate", () =>
    expect(findDuplicate({ ...row, invoiceRef: "INV-1002" }, ctx)).toBeNull());
  it("the same invoice number is a definite duplicate", () =>
    expect(findDuplicate({ ...row, invoiceRef: "inv-1001" }, ctx)?.level).toBe("definite"));
  it("same supplier/amount/month without a number is only a possible duplicate", () =>
    expect(findDuplicate(row, ctx)?.level).toBe("possible"));
  it("the same file row imported again is definite", () =>
    expect(findDuplicate({ ...row, sourceRef: "h:Rudys:3", invoiceRef: "NEW" }, ctx)?.level).toBe("definite"));
  it("a possible duplicate can be confirmed as separate", () => {
    const rr = interpretRow(gridToRows("Rudys", [HEADER, ["Utilities", "Electric Ireland", "450", "", "", "", ""]]).rows[0], "actual", "h");
    const c = { locationId: "rudy", startMonth: "", periodMonth: "2026-09", duplicate: { level: "possible" as const, message: "x" }, existingPayroll: null, currentMonth: "2026-10" };
    expect(rowIssues(rr, c).some((i) => i.startsWith("Possible duplicate"))).toBe(true);
    expect(rowIssues({ ...rr, confirmDuplicate: true }, c)).toEqual([]);
    expect((toPayloadRow({ ...rr, confirmDuplicate: true }, c, "") as Record<string, unknown>).confirm_possible_duplicate).toBe(true);
  });
});
