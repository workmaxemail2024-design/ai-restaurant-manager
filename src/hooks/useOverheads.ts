import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { toast } from "sonner";
import { differenceInDays, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";

export const OVERHEAD_CATEGORIES = ['Rent', 'Utilities', 'Insurance', 'Marketing', 'Software', 'Licences', 'Waste', 'Internet', 'Other'] as const;
export const OVERHEAD_FREQUENCIES = ['one_time', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;
export const ALLOCATION_MODES = ['single', 'equal', 'percentage', 'manual'] as const;

export type OverheadCategory = typeof OVERHEAD_CATEGORIES[number];
export type OverheadFrequency = typeof OVERHEAD_FREQUENCIES[number];
export type AllocationMode = typeof ALLOCATION_MODES[number];

export const FREQUENCY_LABELS: Record<OverheadFrequency, string> = {
  one_time: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export const ALLOCATION_LABELS: Record<AllocationMode, string> = {
  single: 'Single Location',
  equal: 'Equal Split',
  percentage: 'Percentage Split',
  manual: 'Manual Split',
};

export interface Overhead {
  id: string;
  restaurant_id: string;
  location_id: string | null;
  name: string;
  category: OverheadCategory;
  amount: number;
  frequency: OverheadFrequency;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  allocation_mode: AllocationMode;
  allocation_details: Record<string, number>; // locationId -> amount or percentage
  created_at: string;
  updated_at: string;
  locations?: { name: string } | null;
}

export interface OverheadInsert {
  name: string;
  category: OverheadCategory;
  amount: number;
  frequency: OverheadFrequency;
  location_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
  allocation_mode?: AllocationMode;
  allocation_details?: Record<string, number>;
}

export interface OverheadUpdate extends Partial<OverheadInsert> {
  id: string;
}

/**
 * Convert an overhead to its daily cost equivalent.
 */
export function overheadToDailyCost(amount: number, frequency: OverheadFrequency): number {
  switch (frequency) {
    case 'one_time':
      return amount; // applied only on the specific date
    case 'daily':
      return amount;
    case 'weekly':
      return amount / 7;
    case 'monthly':
      return amount / 30;
    case 'quarterly':
      return amount / 91;
    case 'yearly':
      return amount / 365;
    default:
      return amount / 30;
  }
}

/**
 * Convert to monthly equivalent for summary display.
 */
export function toMonthlyAmount(amount: number, frequency: OverheadFrequency): number {
  switch (frequency) {
    case 'one_time':
      return 0; // one-time costs don't recur monthly
    case 'daily':
      return amount * 30;
    case 'weekly':
      return amount * 4.33;
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'yearly':
      return amount / 12;
    default:
      return amount;
  }
}

/**
 * Calculate overhead cost for a specific date range and optional location.
 * Handles date boundaries, active status, and allocation modes.
 */
export function calculateOverheadForRange(
  overheads: Overhead[],
  startDate: string,
  endDate: string,
  locationId?: string | null,
  locationCount?: number
): number {
  const rangeStart = parseISO(startDate);
  const rangeEnd = parseISO(endDate);
  const days = differenceInDays(rangeEnd, rangeStart) + 1;

  let total = 0;

  for (const overhead of overheads) {
    if (!overhead.is_active) continue;

    // Check date bounds
    if (overhead.start_date) {
      const oStart = parseISO(overhead.start_date);
      if (oStart > rangeEnd) continue;
    }
    if (overhead.end_date) {
      const oEnd = parseISO(overhead.end_date);
      if (oEnd < rangeStart) continue;
    }

    // Calculate effective days within the range
    let effectiveDays = days;
    if (overhead.start_date) {
      const oStart = parseISO(overhead.start_date);
      if (oStart > rangeStart) {
        effectiveDays = differenceInDays(rangeEnd, oStart) + 1;
      }
    }
    if (overhead.end_date) {
      const oEnd = parseISO(overhead.end_date);
      if (oEnd < rangeEnd) {
        effectiveDays = Math.min(effectiveDays, differenceInDays(oEnd, rangeStart) + 1);
      }
    }
    effectiveDays = Math.max(0, effectiveDays);

    let amount: number;

    if (overhead.frequency === 'one_time') {
      // One-time: only if the start_date falls within the range
      const oneTimeDate = overhead.start_date ? parseISO(overhead.start_date) : null;
      if (!oneTimeDate || oneTimeDate < rangeStart || oneTimeDate > rangeEnd) continue;
      amount = overhead.amount;
    } else {
      const dailyCost = overheadToDailyCost(overhead.amount, overhead.frequency);
      amount = dailyCost * effectiveDays;
    }

    // Apply location allocation
    if (locationId && !overhead.location_id) {
      // Global overhead - need to split based on allocation mode
      const locs = locationCount || 1;
      switch (overhead.allocation_mode) {
        case 'equal':
          amount = amount / locs;
          break;
        case 'percentage': {
          const pct = overhead.allocation_details?.[locationId] ?? (100 / locs);
          amount = amount * (pct / 100);
          break;
        }
        case 'manual': {
          const manualAmount = overhead.allocation_details?.[locationId] ?? 0;
          // manual stores per-frequency amount, so convert to daily then multiply
          if (overhead.frequency === 'one_time') {
            amount = manualAmount;
          } else {
            amount = overheadToDailyCost(manualAmount, overhead.frequency) * effectiveDays;
          }
          break;
        }
        default:
          amount = amount / locs;
      }
    }

    total += amount;
  }

  return total;
}

export function useOverheads(locationId?: string | null) {
  const { currentRestaurant } = useRestaurant();
  const restaurantId = currentRestaurant?.id;

  return useQuery({
    queryKey: ["overheads", restaurantId, locationId],
    queryFn: async () => {
      if (!restaurantId) return [];
      
      let query = supabase
        .from("overheads")
        .select("*, locations(name)")
        .eq("restaurant_id", restaurantId)
        .order("name", { ascending: true });
      
      if (locationId) {
        query = query.or(`location_id.eq.${locationId},location_id.is.null`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(d => ({
        ...d,
        allocation_mode: d.allocation_mode || 'equal',
        allocation_details: (d.allocation_details as Record<string, number>) || {},
      })) as Overhead[];
    },
    enabled: !!restaurantId,
  });
}

export function useCreateOverhead() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();

  return useMutation({
    mutationFn: async (overhead: OverheadInsert) => {
      if (!currentRestaurant?.id) throw new Error("No restaurant selected");

      const { data, error } = await supabase
        .from("overheads")
        .insert({
          ...overhead,
          restaurant_id: currentRestaurant.id,
          location_id: overhead.location_id || null,
          allocation_mode: overhead.allocation_mode || 'equal',
          allocation_details: overhead.allocation_details || {},
        })
        .select("*, locations(name)")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overheads"] });
      queryClient.invalidateQueries({ queryKey: ["profit-metrics"] });
      toast.success("Overhead created successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create overhead: ${error.message}`);
    },
  });
}

export function useUpdateOverhead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: OverheadUpdate) => {
      const { data, error } = await supabase
        .from("overheads")
        .update(updates)
        .eq("id", id)
        .select("*, locations(name)")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overheads"] });
      queryClient.invalidateQueries({ queryKey: ["profit-metrics"] });
      toast.success("Overhead updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update overhead: ${error.message}`);
    },
  });
}

export function useDeleteOverhead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("overheads")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overheads"] });
      queryClient.invalidateQueries({ queryKey: ["profit-metrics"] });
      toast.success("Overhead deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete overhead: ${error.message}`);
    },
  });
}
