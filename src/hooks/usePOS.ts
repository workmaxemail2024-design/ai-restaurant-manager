import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface POSIntegration {
  id: string;
  location_id: string;
  restaurant_id: string | null;
  pos_provider: string;
  api_key: string | null;
  api_secret: string | null;
  webhook_url: string | null;
  status: string;
  last_sync_time: string | null;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  locations?: { name: string };
}

export interface POSSalesImport {
  id: string;
  location_id: string;
  pos_provider: string;
  external_sale_id: string | null;
  data: Record<string, unknown>;
  mapped_dish_id: string | null;
  mapped_total_price: number | null;
  mapped_quantity: number | null;
  mapped_sale_date: string | null;
  sync_status: string;
  created_at: string;
  dishes?: { name: string };
}

export interface POSSyncLog {
  id: string;
  location_id: string;
  pos_provider: string;
  event_type: string;
  message: string | null;
  status: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface POSMapping {
  id: string;
  location_id: string;
  pos_provider: string;
  mapping_type: string;
  external_id: string;
  external_name: string | null;
  internal_id: string | null;
  confidence_score: number | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export function usePOSIntegrations(locationId?: string) {
  return useQuery({
    queryKey: ["pos-integrations", locationId],
    queryFn: async () => {
      // Use safe view that masks credentials for non-admin users
      let query = supabase
        .from("pos_integrations_safe")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (locationId) {
        query = query.eq("location_id", locationId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Fetch locations separately
      const locationIds = [...new Set(data?.map(p => p.location_id).filter(Boolean))];
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
      
      return data?.map(p => ({
        ...p,
        locations: p.location_id ? locationsMap[p.location_id] || null : null
      })) as POSIntegration[];
    },
  });
}

export function usePOSSalesImports(locationId?: string, status?: string) {
  return useQuery({
    queryKey: ["pos-sales-imports", locationId, status],
    queryFn: async () => {
      let query = supabase
        .from("pos_sales_import")
        .select("*, dishes(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      
      if (locationId) query = query.eq("location_id", locationId);
      if (status) query = query.eq("sync_status", status);
      
      const { data, error } = await query;
      if (error) throw error;
      return data as POSSalesImport[];
    },
  });
}

export function usePOSSyncLogs(locationId?: string) {
  return useQuery({
    queryKey: ["pos-sync-logs", locationId],
    queryFn: async () => {
      let query = supabase
        .from("pos_sync_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (locationId) query = query.eq("location_id", locationId);
      
      const { data, error } = await query;
      if (error) throw error;
      return data as POSSyncLog[];
    },
  });
}

export function usePOSMappings(locationId?: string, posProvider?: string) {
  return useQuery({
    queryKey: ["pos-mappings", locationId, posProvider],
    queryFn: async () => {
      let query = supabase
        .from("pos_mappings")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (locationId) query = query.eq("location_id", locationId);
      if (posProvider) query = query.eq("pos_provider", posProvider);
      
      const { data, error } = await query;
      if (error) throw error;
      return data as POSMapping[];
    },
  });
}

export function useCreatePOSIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (integration: { location_id: string; pos_provider: string; api_key?: string; api_secret?: string; webhook_url?: string }) => {
      const { data, error } = await supabase
        .from("pos_integrations")
        .insert({
          location_id: integration.location_id,
          pos_provider: integration.pos_provider,
          api_key: integration.api_key,
          api_secret: integration.api_secret,
          webhook_url: integration.webhook_url,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-integrations"] });
      toast({ title: "POS integration created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating integration", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdatePOSIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, api_key, api_secret, webhook_url }: { id: string; status?: string; api_key?: string; api_secret?: string; webhook_url?: string }) => {
      const updateData: Record<string, unknown> = {};
      if (status !== undefined) updateData.status = status;
      if (api_key !== undefined) updateData.api_key = api_key;
      if (api_secret !== undefined) updateData.api_secret = api_secret;
      if (webhook_url !== undefined) updateData.webhook_url = webhook_url;
      
      const { data, error } = await supabase
        .from("pos_integrations")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-integrations"] });
      toast({ title: "Integration updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating integration", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeletePOSIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-integrations"] });
      toast({ title: "Integration deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting integration", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdatePOSMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, internal_id, is_verified }: { id: string; internal_id: string; is_verified?: boolean }) => {
      const { data, error } = await supabase
        .from("pos_mappings")
        .update({ internal_id, is_verified: is_verified ?? true })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["pos-sales-imports"] });
      toast({ title: "Mapping updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating mapping", description: error.message, variant: "destructive" });
    },
  });
}

export function useTestPOSConnection() {
  return useMutation({
    mutationFn: async (params: { pos_provider: string; api_key: string; api_secret?: string; custom_endpoint?: string }) => {
      const { data, error } = await supabase.functions.invoke("pos-test-connection", { body: params });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Connection successful", description: data.message });
      } else {
        toast({ title: "Connection failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (error) => {
      toast({ title: "Connection test failed", description: error.message, variant: "destructive" });
    },
  });
}

export function usePOSReconciliation() {
  return useMutation({
    mutationFn: async (params: { location_id: string; pos_provider?: string }) => {
      const { data, error } = await supabase.functions.invoke("pos-ai-reconciliation", { body: params });
      if (error) throw error;
      return data;
    },
  });
}
