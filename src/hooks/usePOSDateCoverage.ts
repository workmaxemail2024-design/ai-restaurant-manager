import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";

export interface DateCoverage {
  imported: boolean;
  applied: boolean;
}

export type DateCoverageMap = Map<string, DateCoverage>;

interface UsePOSDateCoverageParams {
  locationId: string | null;
  posProvider: string;
  visibleMonth: Date;
  enabled?: boolean;
}

/**
 * Fetches date coverage information for POS imports.
 * Returns a map of dates -> { imported: boolean, applied: boolean }
 * 
 * - imported = data exists in pos_sales_import for that date
 * - applied = data has sync_status = 'applied' (already on dashboard)
 */
/** Reads every import row for a location/provider/date range, 1000 rows per page. Throws on failure. */
export async function fetchImportDatesPaged(locationId: string, posProvider: string, from: string, to: string, pageSize = 1000) {
  const rows: { mapped_sale_date: string; sync_status: string | null }[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('pos_sales_import')
      .select('id, mapped_sale_date, sync_status')
      .eq('location_id', locationId)
      .eq('pos_provider', posProvider)
      .gte('mapped_sale_date', from)
      .lte('mapped_sale_date', to)
      .order('id')
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as any));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export function usePOSDateCoverage({
  locationId,
  posProvider,
  visibleMonth,
  enabled = true
}: UsePOSDateCoverageParams) {
  // Calculate visible range (current month +/- 1)
  const fromMonth = startOfMonth(subMonths(visibleMonth, 1));
  const toMonth = endOfMonth(addMonths(visibleMonth, 1));
  
  const fromDate = format(fromMonth, 'yyyy-MM-dd');
  const toDate = format(toMonth, 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['pos-date-coverage', locationId, posProvider, fromDate, toDate],
    queryFn: async (): Promise<DateCoverageMap> => {
      if (!locationId) return new Map();

      const coverageMap = new Map<string, DateCoverage>();

      // Fetch all imports for this location/provider in the date range
      // Failed reads throw (shown as an error) rather than reporting days as not yet imported.
      const imports = await fetchImportDatesPaged(locationId, posProvider, fromDate, toDate);

      // Process results to build coverage map
      for (const imp of imports || []) {
        const dateStr = imp.mapped_sale_date;
        if (!dateStr) continue;

        const existing = coverageMap.get(dateStr) || { imported: false, applied: false };
        existing.imported = true;
        
        if (imp.sync_status === 'applied') {
          existing.applied = true;
        }
        
        coverageMap.set(dateStr, existing);
      }

      return coverageMap;
    },
    enabled: enabled && !!locationId && !!posProvider,
    staleTime: 30000, // 30 seconds
    gcTime: 60000, // 1 minute
  });
}

interface UseDateRangeCoverageParams {
  locationId: string | null;
  posProvider: string;
  dateFrom: string;
  dateTo: string;
  enabled?: boolean;
}

export interface DateRangeCoverageStats {
  totalDays: number;
  daysWithImports: number;
  daysWithApplied: number;
  newDays: number;
  allCovered: boolean;
  partiallyCovered: boolean;
}

/**
 * Fetches coverage stats for a specific date range.
 * Used to show warnings in the import/apply modals.
 */
export function useDateRangeCoverage({
  locationId,
  posProvider,
  dateFrom,
  dateTo,
  enabled = true
}: UseDateRangeCoverageParams) {
  return useQuery({
    queryKey: ['pos-range-coverage', locationId, posProvider, dateFrom, dateTo],
    queryFn: async (): Promise<DateRangeCoverageStats> => {
      if (!locationId || !dateFrom || !dateTo) {
        return {
          totalDays: 0,
          daysWithImports: 0,
          daysWithApplied: 0,
          newDays: 0,
          allCovered: false,
          partiallyCovered: false,
        };
      }

      // Calculate total days in range
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      const totalDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // Fetch unique dates with imports
      // Failed reads throw (shown as an error) rather than reporting days as not yet imported.
      const imports = await fetchImportDatesPaged(locationId, posProvider, dateFrom, dateTo);

      // Count unique dates
      const importedDates = new Set<string>();
      const appliedDates = new Set<string>();

      for (const imp of imports || []) {
        if (imp.mapped_sale_date) {
          importedDates.add(imp.mapped_sale_date);
          if (imp.sync_status === 'applied') {
            appliedDates.add(imp.mapped_sale_date);
          }
        }
      }

      const daysWithImports = importedDates.size;
      const daysWithApplied = appliedDates.size;
      const newDays = totalDays - daysWithImports;

      return {
        totalDays,
        daysWithImports,
        daysWithApplied,
        newDays,
        allCovered: daysWithImports >= totalDays,
        partiallyCovered: daysWithImports > 0 && daysWithImports < totalDays,
      };
    },
    enabled: enabled && !!locationId && !!posProvider && !!dateFrom && !!dateTo,
    staleTime: 10000, // 10 seconds (more frequent updates for this)
  });
}
