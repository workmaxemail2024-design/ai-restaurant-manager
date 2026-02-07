import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";

interface UseCalendarDataDaysParams {
  visibleMonth: Date;
  restaurantId: string | null;
  locationId: string | null;
  enabled?: boolean;
}

/**
 * Fetches dates that have recorded data (sales, attendance, purchase orders, documents)
 * for the visible month range in the calendar (current month +/- 1).
 * 
 * Returns a Set of ISO date strings (YYYY-MM-DD) for days with data.
 */
export function useCalendarDataDays({
  visibleMonth,
  restaurantId,
  locationId,
  enabled = true
}: UseCalendarDataDaysParams) {
  // Calculate the month range to fetch (current visible month +/- 1)
  const fromMonth = startOfMonth(subMonths(visibleMonth, 1));
  const toMonth = endOfMonth(addMonths(visibleMonth, 1));
  
  const fromDate = format(fromMonth, 'yyyy-MM-dd');
  const toDate = format(toMonth, 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['calendar-data-days', restaurantId, locationId ?? 'all', fromDate, toDate],
    queryFn: async (): Promise<Set<string>> => {
      if (!restaurantId) return new Set();

      const dateDays = new Set<string>();

      // Build location filter
      const locationFilter = locationId && locationId !== 'all' ? locationId : null;

      // Fetch sales dates (highest priority, most common)
      const salesQuery = supabase
        .from('sales')
        .select('sale_date')
        .eq('restaurant_id', restaurantId)
        .gte('sale_date', fromDate)
        .lte('sale_date', toDate);
      
      if (locationFilter) {
        salesQuery.eq('location_id', locationFilter);
      }

      const { data: salesData, error: salesError } = await salesQuery;
      
      if (!salesError && salesData) {
        salesData.forEach(row => {
          if (row.sale_date) {
            // sale_date is already YYYY-MM-DD
            dateDays.add(row.sale_date);
          }
        });
      }

      // Fetch staff attendance dates
      const attendanceQuery = supabase
        .from('staff_attendance')
        .select('clock_in')
        .eq('restaurant_id', restaurantId)
        .gte('clock_in', `${fromDate}T00:00:00`)
        .lte('clock_in', `${toDate}T23:59:59`);
      
      if (locationFilter) {
        attendanceQuery.eq('location_id', locationFilter);
      }

      const { data: attendanceData, error: attendanceError } = await attendanceQuery;
      
      if (!attendanceError && attendanceData) {
        attendanceData.forEach(row => {
          if (row.clock_in) {
            const date = row.clock_in.split('T')[0];
            dateDays.add(date);
          }
        });
      }

      // Fetch purchase order dates (order_date)
      const poQuery = supabase
        .from('purchase_orders')
        .select('order_date')
        .eq('restaurant_id', restaurantId)
        .gte('order_date', fromDate)
        .lte('order_date', toDate);
      
      if (locationFilter) {
        poQuery.eq('location_id', locationFilter);
      }

      const { data: poData, error: poError } = await poQuery;
      
      if (!poError && poData) {
        poData.forEach(row => {
          if (row.order_date) {
            dateDays.add(row.order_date);
          }
        });
      }

      // Fetch document upload dates
      const docsQuery = supabase
        .from('documents')
        .select('created_at')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', `${fromDate}T00:00:00`)
        .lte('created_at', `${toDate}T23:59:59`);
      
      if (locationFilter) {
        docsQuery.eq('location_id', locationFilter);
      }

      const { data: docsData, error: docsError } = await docsQuery;
      
      if (!docsError && docsData) {
        docsData.forEach(row => {
          if (row.created_at) {
            const date = row.created_at.split('T')[0];
            dateDays.add(date);
          }
        });
      }

      return dateDays;
    },
    enabled: enabled && !!restaurantId,
    staleTime: 30000, // 30 seconds
    gcTime: 60000, // 1 minute
  });
}
