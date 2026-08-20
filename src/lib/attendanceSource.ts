/**
 * Human-readable identification of where an attendance record came from.
 * Purely presentational — labour cost rules are unaffected.
 */
export type AttendanceSourceKind = "pos" | "clock" | "manual" | "override";

export interface AttendanceSourceInfo {
  kind: AttendanceSourceKind;
  label: string;
  /** POS-imported records must never be destructively deleted. */
  isImported: boolean;
}

export function describeAttendanceSource(record: {
  source?: string | null;
  is_corrected?: boolean | null;
  original_source?: string | null;
}): AttendanceSourceInfo {
  const base = (record.original_source ?? record.source ?? "manual").toLowerCase();
  const isImported = base === "pos";

  if (record.is_corrected) {
    return {
      kind: "override",
      label: isImported ? "Override (Captiva/POS)" : "Override",
      isImported,
    };
  }
  if (base === "pos") return { kind: "pos", label: "Captiva/POS", isImported: true };
  if (base === "auto") return { kind: "clock", label: "RestaurantAI Clock", isImported: false };
  return { kind: "manual", label: "Manual", isImported: false };
}
