/** Keep only rows for the selected location; null = All locations (every row). */
export function scopeByLocation<T extends { location_id?: string | null }>(rows: T[], locationId: string | null): T[] {
  if (!locationId) return rows;
  return rows.filter((r) => r.location_id === locationId);
}
