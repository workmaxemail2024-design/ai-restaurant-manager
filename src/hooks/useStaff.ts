import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type StaffRole = "chef" | "waiter" | "manager" | "host" | "bartender" | "kitchen_assistant" | "cleaner";
export type StaffStatus = "active" | "inactive" | "on_leave";
export type AttendanceSource = "manual" | "pos" | "auto";
export type ContractType = "full_time" | "part_time" | "casual";

export interface Staff {
  id: string;
  location_id: string | null;
  first_name: string;
  last_name: string;
  role: StaffRole;
  hourly_rate: number;
  status: StaffStatus;
  email: string | null;
  phone: string | null;
  captiva_operator_code?: string | null;
  contract_type: ContractType;
  max_hours_per_week: number;
  min_hours_per_week: number | null;
  created_at: string;
  updated_at: string;
  locations?: { name: string } | null;
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

export interface StaffAttendance {
  id: string;
  staff_id: string;
  location_id: string;
  clock_in: string;
  clock_out: string | null;
  source: AttendanceSource;
  created_at: string;
  staff?: { first_name: string; last_name: string };
  locations?: { name: string };
}

export interface StaffPerformance {
  id: string;
  staff_id: string;
  date: string;
  kpi_sales: number;
  kpi_customers_served: number;
  kpi_errors: number;
  score: number | null;
  created_at: string;
  staff?: { first_name: string; last_name: string };
}

export type StaffInsert = {
  location_id?: string | null;
  first_name: string;
  last_name: string;
  role: StaffRole;
  hourly_rate: number;
  status?: StaffStatus;
  email?: string | null;
  phone?: string | null;
  captiva_operator_code?: string | null;
  contract_type?: ContractType;
  max_hours_per_week?: number;
  min_hours_per_week?: number | null;
};

export function useStaff(locationId?: string | null) {
  return useQuery({
    queryKey: ["staff", locationId],
    queryFn: async () => {
      // Use the safe view that hides PII from non-managers
      let query = supabase
        .from("staff_safe")
        .select("*")
        .order("last_name");
      
      if (locationId) {
        query = query.eq("location_id", locationId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Fetch locations separately since the view doesn't have joins
      const locationIds = [...new Set(data?.map(s => s.location_id).filter(Boolean))];
      let locationsMap: Record<string, { name: string }> = {};
      
      if (locationIds.length > 0) {
        const { data: locations } = await supabase
          .from("locations")
          .select("id, name")
          .in("id", locationIds);
        
        if (locations) {
          locationsMap = Object.fromEntries(locations.map(l => [l.id, { name: l.name }]));
        }
      }
      
      return data?.map(s => ({
        ...s,
        // Provide defaults for new fields until types regenerate
        contract_type: (s as any).contract_type || 'full_time',
        max_hours_per_week: (s as any).max_hours_per_week ?? 40,
        min_hours_per_week: (s as any).min_hours_per_week ?? null,
        locations: s.location_id ? locationsMap[s.location_id] || null : null
      })) as Staff[];
    },
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (staff: StaffInsert) => {
      const { data, error } = await supabase
        .from("staff")
        .insert(staff)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast({ title: "Staff member created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating staff member", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...staff }: Partial<StaffInsert> & { id: string }) => {
      const { data, error } = await supabase
        .from("staff")
        .update(staff)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast({ title: "Staff member updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating staff member", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast({ title: "Staff member deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting staff member", description: error.message, variant: "destructive" });
    },
  });
}

// Shifts
export function useStaffShifts(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["staff-shifts", startDate, endDate],
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

export function useCreateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shift: { staff_id: string; location_id: string; shift_start: string; shift_end: string; notes?: string }) => {
      const { data, error } = await supabase.from("staff_shifts").insert(shift).select().single();
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

// Attendance
export function useStaffAttendance(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["staff-attendance", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("staff_attendance")
        .select("*, staff(first_name, last_name), locations(name)")
        .order("clock_in", { ascending: false });
      
      if (startDate) query = query.gte("clock_in", startDate);
      if (endDate) query = query.lte("clock_in", endDate);
      
      const { data, error } = await query;
      if (error) throw error;
      return data as StaffAttendance[];
    },
  });
}

export function useClockIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (attendance: { staff_id: string; location_id: string; source?: AttendanceSource }) => {
      const { data, error } = await supabase
        .from("staff_attendance")
        .insert({ ...attendance, clock_in: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
      toast({ title: "Clocked in successfully" });
    },
    onError: (error) => {
      toast({ title: "Error clocking in", description: error.message, variant: "destructive" });
    },
  });
}

export function useClockOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("staff_attendance")
        .update({ clock_out: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
      toast({ title: "Clocked out successfully" });
    },
    onError: (error) => {
      toast({ title: "Error clocking out", description: error.message, variant: "destructive" });
    },
  });
}

// Performance
export function useStaffPerformance(staffId?: string) {
  return useQuery({
    queryKey: ["staff-performance", staffId],
    queryFn: async () => {
      let query = supabase
        .from("staff_performance")
        .select("*, staff(first_name, last_name)")
        .order("date", { ascending: false });
      
      if (staffId) query = query.eq("staff_id", staffId);
      
      const { data, error } = await query;
      if (error) throw error;
      return data as StaffPerformance[];
    },
  });
}

export function useUpsertPerformance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (performance: { staff_id: string; date: string; kpi_sales: number; kpi_customers_served: number; kpi_errors: number }) => {
      const { data, error } = await supabase
        .from("staff_performance")
        .upsert(performance, { onConflict: "staff_id,date" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
      toast({ title: "Performance updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating performance", description: error.message, variant: "destructive" });
    },
  });
}
