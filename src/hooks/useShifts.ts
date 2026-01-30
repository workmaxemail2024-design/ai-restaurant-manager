import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { startOfWeek, endOfWeek, addDays, setHours, setMinutes, differenceInHours } from "date-fns";

export interface StaffWithContract {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  location_id: string | null;
  contract_type: "full_time" | "part_time" | "casual";
  max_hours_per_week: number;
  min_hours_per_week: number | null;
}

export interface StaffShift {
  id: string;
  staff_id: string;
  location_id: string;
  shift_start: string;
  shift_end: string;
  notes: string | null;
  is_draft: boolean;
  created_at: string;
  staff?: { first_name: string; last_name: string };
  locations?: { name: string };
}

export interface ShiftInsert {
  staff_id: string;
  location_id: string;
  shift_start: string;
  shift_end: string;
  notes?: string;
  is_draft?: boolean;
}

// Fetch shifts for a date range with draft filter option
export function useStaffShifts(startDate?: string, endDate?: string, includeDrafts = true) {
  return useQuery({
    queryKey: ["staff-shifts", startDate, endDate, includeDrafts],
    queryFn: async () => {
      let query = supabase
        .from("staff_shifts")
        .select("*, staff(first_name, last_name), locations(name)")
        .order("shift_start", { ascending: true });

      if (startDate) query = query.gte("shift_start", startDate);
      if (endDate) query = query.lte("shift_end", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return data as StaffShift[];
    },
  });
}

// Fetch staff with contract info for rostering
export function useStaffWithContracts() {
  return useQuery({
    queryKey: ["staff-with-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name, role, status, location_id, contract_type, max_hours_per_week, min_hours_per_week")
        .eq("status", "active")
        .order("last_name");

      if (error) throw error;
      return data as StaffWithContract[];
    },
  });
}

// Create a single shift
export function useCreateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shift: ShiftInsert) => {
      const { data, error } = await supabase
        .from("staff_shifts")
        .insert(shift)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-shifts"] });
      toast({ title: "Shift created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating shift", description: error.message, variant: "destructive" });
    },
  });
}

// Update a shift
export function useUpdateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...shift }: Partial<ShiftInsert> & { id: string }) => {
      const { data, error } = await supabase
        .from("staff_shifts")
        .update(shift)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-shifts"] });
      toast({ title: "Shift updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating shift", description: error.message, variant: "destructive" });
    },
  });
}

// Delete a shift
export function useDeleteShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_shifts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-shifts"] });
      toast({ title: "Shift deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting shift", description: error.message, variant: "destructive" });
    },
  });
}

// Generate draft roster for a week
export function useGenerateDraftRoster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ weekStart, locationId }: { weekStart: Date; locationId: string }) => {
      // Fetch active staff with contract info
      const { data: staff, error: staffError } = await supabase
        .from("staff")
        .select("id, first_name, last_name, role, contract_type, max_hours_per_week, min_hours_per_week")
        .eq("status", "active");

      if (staffError) throw staffError;
      if (!staff || staff.length === 0) throw new Error("No active staff found");

      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

      // Check for existing drafts in this week
      const { data: existingDrafts } = await supabase
        .from("staff_shifts")
        .select("id")
        .eq("is_draft", true)
        .eq("location_id", locationId)
        .gte("shift_start", weekStart.toISOString())
        .lte("shift_end", weekEnd.toISOString());

      if (existingDrafts && existingDrafts.length > 0) {
        throw new Error("Draft shifts already exist for this week. Discard them first.");
      }

      // Default shift patterns (morning, afternoon, evening)
      const shiftPatterns = [
        { startHour: 9, endHour: 15, name: "Morning" },   // 6 hours
        { startHour: 15, endHour: 21, name: "Afternoon" }, // 6 hours
        { startHour: 17, endHour: 23, name: "Evening" },   // 6 hours
      ];

      // Track hours assigned per staff member
      const hoursAssigned: Record<string, number> = {};
      staff.forEach((s) => {
        hoursAssigned[s.id] = 0;
      });

      const shiftsToCreate: ShiftInsert[] = [];

      // Generate shifts for each day of the week
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDay = addDays(weekStart, dayOffset);

        // For each shift pattern, assign a staff member
        for (const pattern of shiftPatterns) {
          // Find eligible staff (haven't exceeded max hours)
          const eligibleStaff = staff.filter((s) => {
            const potentialHours = hoursAssigned[s.id] + (pattern.endHour - pattern.startHour);
            return potentialHours <= s.max_hours_per_week;
          });

          if (eligibleStaff.length === 0) continue;

          // Sort by hours assigned (ascending) to spread fairly
          eligibleStaff.sort((a, b) => hoursAssigned[a.id] - hoursAssigned[b.id]);

          // Prioritize full-time staff who haven't met minimum hours
          const fullTimeNeedingHours = eligibleStaff.filter(
            (s) => s.contract_type === "full_time" && s.min_hours_per_week && hoursAssigned[s.id] < s.min_hours_per_week
          );

          const selectedStaff = fullTimeNeedingHours.length > 0 ? fullTimeNeedingHours[0] : eligibleStaff[0];

          const shiftStart = setMinutes(setHours(currentDay, pattern.startHour), 0);
          const shiftEnd = setMinutes(setHours(currentDay, pattern.endHour), 0);
          const shiftHours = pattern.endHour - pattern.startHour;

          shiftsToCreate.push({
            staff_id: selectedStaff.id,
            location_id: locationId,
            shift_start: shiftStart.toISOString(),
            shift_end: shiftEnd.toISOString(),
            notes: `Auto-generated ${pattern.name} shift`,
            is_draft: true,
          });

          hoursAssigned[selectedStaff.id] += shiftHours;
        }
      }

      if (shiftsToCreate.length === 0) {
        throw new Error("Could not generate any shifts. Check staff availability and max hours.");
      }

      // Insert all draft shifts
      const { error: insertError } = await supabase.from("staff_shifts").insert(shiftsToCreate);

      if (insertError) throw insertError;

      return { shiftsCreated: shiftsToCreate.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staff-shifts"] });
      toast({ title: "Draft roster generated", description: `Created ${data.shiftsCreated} draft shifts` });
    },
    onError: (error) => {
      toast({ title: "Error generating roster", description: error.message, variant: "destructive" });
    },
  });
}

// Confirm all draft shifts for a week (convert to normal shifts)
export function useConfirmDraftRoster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ weekStart, locationId }: { weekStart: Date; locationId: string }) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

      const { data, error } = await supabase
        .from("staff_shifts")
        .update({ is_draft: false })
        .eq("is_draft", true)
        .eq("location_id", locationId)
        .gte("shift_start", weekStart.toISOString())
        .lte("shift_end", weekEnd.toISOString())
        .select();

      if (error) throw error;
      return { confirmed: data?.length || 0 };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staff-shifts"] });
      toast({ title: "Roster confirmed", description: `${data.confirmed} shifts confirmed` });
    },
    onError: (error) => {
      toast({ title: "Error confirming roster", description: error.message, variant: "destructive" });
    },
  });
}

// Discard all draft shifts for a week
export function useDiscardDraftRoster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ weekStart, locationId }: { weekStart: Date; locationId: string }) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

      const { data, error } = await supabase
        .from("staff_shifts")
        .delete()
        .eq("is_draft", true)
        .eq("location_id", locationId)
        .gte("shift_start", weekStart.toISOString())
        .lte("shift_end", weekEnd.toISOString())
        .select();

      if (error) throw error;
      return { discarded: data?.length || 0 };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staff-shifts"] });
      toast({ title: "Draft discarded", description: `${data.discarded} draft shifts removed` });
    },
    onError: (error) => {
      toast({ title: "Error discarding draft", description: error.message, variant: "destructive" });
    },
  });
}
