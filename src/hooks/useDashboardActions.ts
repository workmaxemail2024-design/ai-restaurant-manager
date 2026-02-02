import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { startOfWeek, endOfWeek, differenceInHours, parseISO } from "date-fns";

interface LowStockItem {
  ingredientName: string;
  locationName: string;
  quantity: number;
  unit: string;
}

interface PendingPO {
  id: string;
  supplierName: string;
  locationName: string;
  orderDate: string;
  itemCount: number;
}

interface StaffHoursIssue {
  staffName: string;
  scheduledHours: number;
  contractedHours: number;
  type: "over" | "under";
}

export interface DashboardActions {
  lowStock: LowStockItem[];
  pendingPOs: PendingPO[];
  staffHoursIssues: StaffHoursIssue[];
}

const LOW_STOCK_THRESHOLD = 10;

export function useDashboardActions(locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["dashboard-actions", restaurantId, locationId],
    queryFn: async (): Promise<DashboardActions> => {
      if (!restaurantId) {
        return { lowStock: [], pendingPOs: [], staffHoursIssues: [] };
      }

      // 1. Low stock items (quantity below threshold)
      let stockQuery = supabase
        .from("stock_levels")
        .select("quantity, ingredients(name, unit), locations(name)")
        .eq("restaurant_id", restaurantId)
        .lt("quantity", LOW_STOCK_THRESHOLD);

      if (locationId) {
        stockQuery = stockQuery.eq("location_id", locationId);
      }

      const { data: stockData } = await stockQuery;

      const lowStock: LowStockItem[] = (stockData || []).map((s) => ({
        ingredientName: (s.ingredients as { name: string; unit: string })?.name || "Unknown",
        locationName: (s.locations as { name: string })?.name || "Unknown",
        quantity: Number(s.quantity),
        unit: (s.ingredients as { name: string; unit: string })?.unit || "unit",
      }));

      // 2. Purchase Orders pending receipt (status = completed but not received)
      let poQuery = supabase
        .from("purchase_orders")
        .select("id, order_date, suppliers(name), locations(name)")
        .eq("restaurant_id", restaurantId)
        .eq("status", "completed")
        .is("received_at", null)
        .order("order_date", { ascending: false })
        .limit(5);

      if (locationId) {
        poQuery = poQuery.eq("location_id", locationId);
      }

      const { data: poData } = await poQuery;

      const pendingPOs: PendingPO[] = await Promise.all(
        (poData || []).map(async (po) => {
          const { count } = await supabase
            .from("purchase_order_items")
            .select("id", { count: "exact", head: true })
            .eq("purchase_order_id", po.id);

          return {
            id: po.id,
            supplierName: (po.suppliers as { name: string })?.name || "Unknown",
            locationName: (po.locations as { name: string })?.name || "Unknown",
            orderDate: po.order_date,
            itemCount: count || 0,
          };
        })
      );

      // 3. Staff over/under contracted hours (current week)
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

      let staffQuery = supabase
        .from("staff")
        .select("id, first_name, last_name, contract_type, max_hours_per_week, min_hours_per_week")
        .eq("restaurant_id", restaurantId)
        .eq("status", "active");

      if (locationId) {
        staffQuery = staffQuery.eq("location_id", locationId);
      }

      const { data: staffData } = await staffQuery;

      let shiftsQuery = supabase
        .from("staff_shifts")
        .select("staff_id, shift_start, shift_end")
        .eq("restaurant_id", restaurantId)
        .gte("shift_start", weekStart.toISOString())
        .lte("shift_end", weekEnd.toISOString());

      if (locationId) {
        shiftsQuery = shiftsQuery.eq("location_id", locationId);
      }

      const { data: shiftsData } = await shiftsQuery;

      // Calculate hours per staff member
      const hoursPerStaff: Record<string, number> = {};
      (shiftsData || []).forEach((shift) => {
        const hours = differenceInHours(parseISO(shift.shift_end), parseISO(shift.shift_start));
        hoursPerStaff[shift.staff_id] = (hoursPerStaff[shift.staff_id] || 0) + hours;
      });

      const staffHoursIssues: StaffHoursIssue[] = [];

      (staffData || []).forEach((staff) => {
        const scheduled = hoursPerStaff[staff.id] || 0;
        const maxHours = staff.max_hours_per_week || 40;
        const minHours = staff.min_hours_per_week || 0;

        if (scheduled > maxHours) {
          staffHoursIssues.push({
            staffName: `${staff.first_name} ${staff.last_name}`,
            scheduledHours: scheduled,
            contractedHours: maxHours,
            type: "over",
          });
        } else if (minHours > 0 && scheduled < minHours) {
          staffHoursIssues.push({
            staffName: `${staff.first_name} ${staff.last_name}`,
            scheduledHours: scheduled,
            contractedHours: minHours,
            type: "under",
          });
        }
      });

      return { lowStock, pendingPOs, staffHoursIssues };
    },
    enabled: !!restaurantId,
    staleTime: 30000, // 30 seconds
  });
}
