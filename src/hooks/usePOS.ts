import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";

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
  last_tested_at: string | null;
  last_test_status: "success" | "failed" | null;
  last_test_error: string | null;
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
    mutationFn: async (integration: { 
      location_id: string; 
      pos_provider: string; 
      api_key?: string; 
      api_secret?: string; 
      webhook_url?: string;
      settings?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase
        .from("pos_integrations")
        .insert([{
          location_id: integration.location_id,
          pos_provider: integration.pos_provider,
          api_key: integration.api_key || null,
          api_secret: integration.api_secret || null,
          webhook_url: integration.webhook_url || null,
          settings: (integration.settings || null) as Json,
        }])
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
    mutationFn: async ({ 
      id, 
      location_id,
      pos_provider,
      status, 
      api_key, 
      api_secret, 
      webhook_url, 
      settings 
    }: { 
      id: string; 
      location_id?: string;
      pos_provider?: string;
      status?: string; 
      api_key?: string; 
      api_secret?: string; 
      webhook_url?: string; 
      settings?: Record<string, unknown>;
    }) => {
      const updateData: Record<string, unknown> = {};
      if (location_id !== undefined) updateData.location_id = location_id;
      if (pos_provider !== undefined) updateData.pos_provider = pos_provider;
      if (status !== undefined) updateData.status = status;
      if (api_key !== undefined) updateData.api_key = api_key;
      if (api_secret !== undefined) updateData.api_secret = api_secret;
      if (webhook_url !== undefined) updateData.webhook_url = webhook_url;
      if (settings !== undefined) updateData.settings = settings;
      
      const { data, error } = await supabase
        .from("pos_integrations")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pos-integrations"] });
      // Only show toast for explicit saves, not toggle updates
      if (variables.settings !== undefined || variables.api_key !== undefined || variables.location_id !== undefined) {
        toast({ title: "Integration updated successfully" });
      }
    },
    onError: (error) => {
      toast({ title: "Error updating integration", description: error.message, variant: "destructive" });
    },
  });
}

export function useToggleAutoSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ integrationId, enabled, currentSettings }: { integrationId: string; enabled: boolean; currentSettings: Record<string, unknown> | null }) => {
      const newSettings = {
        ...(currentSettings || {}),
        auto_sync_daily: enabled,
      };
      
      const { data, error } = await supabase
        .from("pos_integrations")
        .update({ settings: newSettings })
        .eq("id", integrationId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pos-integrations"] });
      toast({ 
        title: variables.enabled ? "Auto Sync Enabled" : "Auto Sync Disabled",
        description: variables.enabled ? "Daily sync will run automatically at midnight" : "Automatic syncing has been turned off"
      });
    },
    onError: (error) => {
      toast({ title: "Error updating auto sync", description: error.message, variant: "destructive" });
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { 
      pos_provider: string; 
      integration_id?: string;
      api_key?: string; 
      api_secret?: string; 
      custom_endpoint?: string;
      base_url?: string;
      store_id?: string;
      username?: string;
      password?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("pos-test-connection", { body: params });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pos-integrations"] });
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

export interface CaptivaSyncParams {
  integration_id: string;
  location_id: string;
  date_from: string;
  date_to: string;
}

export interface CaptivaSyncResult {
  success: boolean;
  sales_imported: number;
  line_items_imported: number;
  skipped_duplicates: number;
  error?: string;
}

export function useCaptivaSyncNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: CaptivaSyncParams): Promise<CaptivaSyncResult> => {
      const { data, error } = await supabase.functions.invoke("pos-sync-captiva", { body: params });
      if (error) throw error;
      return data as CaptivaSyncResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pos-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["pos-sync-logs"] });
      queryClient.invalidateQueries({ queryKey: ["pos-sales-imports"] });
      if (data.success) {
        toast({ 
          title: "Sync Complete", 
          description: `Imported ${data.sales_imported} sales, ${data.line_items_imported} line items${data.skipped_duplicates > 0 ? `, skipped ${data.skipped_duplicates} duplicates` : ""}` 
        });
      } else {
        toast({ title: "Sync Failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (error) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });
}

export interface ApplyImportParams {
  integration_id: string;
  date_from: string;
  date_to: string;
  preview_only?: boolean;
}

export interface ApplyImportResult {
  success: boolean;
  applied_count: number;
  skipped_unmapped: number;
  skipped_existing: number;
  total_revenue: number;
  error?: string;
}

export function useApplyPOSImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: ApplyImportParams): Promise<ApplyImportResult> => {
      const { data, error } = await supabase.functions.invoke("pos-apply-import", { body: params });
      if (error) throw error;
      return data as ApplyImportResult;
    },
    onSuccess: (data, variables) => {
      if (!variables.preview_only) {
        queryClient.invalidateQueries({ queryKey: ["pos-sales-imports"] });
        queryClient.invalidateQueries({ queryKey: ["pos-sync-logs"] });
        queryClient.invalidateQueries({ queryKey: ["sales"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
        queryClient.invalidateQueries({ queryKey: ["profit-metrics"] });
        if (data.success) {
          toast({ 
            title: "Applied to Dashboard", 
            description: `${data.applied_count} sales applied${data.skipped_unmapped > 0 ? `, ${data.skipped_unmapped} unmapped` : ""}` 
          });
        } else {
          toast({ title: "Apply Failed", description: data.error, variant: "destructive" });
        }
      }
    },
    onError: (error) => {
      toast({ title: "Apply Failed", description: error.message, variant: "destructive" });
    },
  });
}
