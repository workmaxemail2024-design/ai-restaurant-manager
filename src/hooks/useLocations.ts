import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { OperatingHours } from "@/components/locations/OperatingHoursEditor";
import type { Json } from "@/integrations/supabase/types";

export interface Location {
  id: string;
  name: string;
  address: string | null;
  operating_hours: OperatingHours | null;
  created_at: string;
  updated_at: string;
}

export type LocationInsert = Omit<Location, "id" | "created_at" | "updated_at" | "operating_hours">;

export function useLocations() {
  return useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .order("name");
      if (error) throw error;
      // Cast operating_hours from Json to OperatingHours
      return (data || []).map(row => ({
        ...row,
        operating_hours: row.operating_hours as unknown as OperatingHours | null,
      })) as Location[];
    },
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (location: LocationInsert) => {
      const { data, error } = await supabase
        .from("locations")
        .insert(location)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast({ title: "Location created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating location", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, operating_hours, ...location }: Partial<Location> & { id: string }) => {
      // Convert operating_hours to Json type if present
      const updateData: Record<string, unknown> = { ...location };
      if (operating_hours !== undefined) {
        updateData.operating_hours = operating_hours as unknown as Json;
      }
      
      const { data, error } = await supabase
        .from("locations")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast({ title: "Location updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating location", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateOperatingHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, operating_hours }: { id: string; operating_hours: OperatingHours }) => {
      const { data, error } = await supabase
        .from("locations")
        .update({ operating_hours: operating_hours as unknown as Json })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (error) => {
      toast({ title: "Error updating operating hours", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast({ title: "Location deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting location", description: error.message, variant: "destructive" });
    },
  });
}
