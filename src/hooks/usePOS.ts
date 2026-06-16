import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import type { Json } from "@/integrations/supabase/types";

// ========== Types ==========

export interface UnmappedPOSItem {
  item_name: string;
  sale_count: number;
  total_quantity: number;
  total_revenue: number;
  avg_price: number;
}

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
      // Fetch the location to get its restaurant_id
      const { data: location, error: locError } = await supabase
        .from("locations")
        .select("restaurant_id")
        .eq("id", integration.location_id)
        .single();
      
      if (locError || !location?.restaurant_id) {
        throw new Error("Could not find restaurant for the selected location");
      }

      const { data, error } = await supabase
        .from("pos_integrations")
        .insert([{
          location_id: integration.location_id,
          restaurant_id: location.restaurant_id,
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
    mutationFn: async ({ id, internal_id, is_verified }: { id: string; internal_id: string | null; is_verified?: boolean }) => {
      const { data, error } = await supabase
        .from("pos_mappings")
        .update({ internal_id, is_verified: is_verified ?? (internal_id !== null) })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["pos-sales-imports"] });
      queryClient.invalidateQueries({ queryKey: ["unmapped-pos-items"] });
      queryClient.invalidateQueries({ queryKey: ["unmapped-pos-staff"] });
      toast({ title: "Mapping updated" });
    },
    onError: (error) => {
      toast({ title: "Error updating mapping", description: error.message, variant: "destructive" });
    },
  });
}

// Delete a single POS mapping
export function useDeletePOSMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pos_mappings")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["unmapped-pos-items"] });
      queryClient.invalidateQueries({ queryKey: ["unmapped-pos-staff"] });
      toast({ title: "Mapping deleted" });
    },
    onError: (error) => {
      toast({ title: "Error deleting mapping", description: error.message, variant: "destructive" });
    },
  });
}

// Bulk delete POS mappings
export function useBulkDeletePOSMappings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { 
      locationId: string; 
      posProvider?: string;
      mappingType?: "dish" | "staff";
      simOnly?: boolean;
    }): Promise<{ deleted: number }> => {
      let query = supabase
        .from("pos_mappings")
        .delete()
        .eq("location_id", params.locationId);
      
      if (params.posProvider) {
        query = query.eq("pos_provider", params.posProvider);
      }
      if (params.mappingType) {
        query = query.eq("mapping_type", params.mappingType);
      }
      if (params.simOnly) {
        query = query.ilike("external_id", "SIM-%");
      }
      
      const { data, error, count } = await query.select("id");
      if (error) throw error;
      
      return { deleted: data?.length || 0 };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pos-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["unmapped-pos-items"] });
      queryClient.invalidateQueries({ queryKey: ["unmapped-pos-staff"] });
      toast({ title: `Deleted ${data.deleted} mappings` });
    },
    onError: (error) => {
      toast({ title: "Error deleting mappings", description: error.message, variant: "destructive" });
    },
  });
}

// Clear demo POS data (mappings, imports, logs with SIM- prefix)
export function useClearDemoPOSData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (restaurantId: string): Promise<{ 
      mappingsDeleted: number;
      salesImportsDeleted: number;
      staffImportsDeleted: number;
      syncLogsDeleted: number;
    }> => {
      // Delete SIM- mappings
      const { data: mappingsData } = await supabase
        .from("pos_mappings")
        .delete()
        .eq("restaurant_id", restaurantId)
        .ilike("external_id", "SIM-%")
        .select("id");
      
      // Delete SIM- sales imports
      const { data: salesData } = await supabase
        .from("pos_sales_import")
        .delete()
        .eq("restaurant_id", restaurantId)
        .or("external_sale_id.ilike.SIM-%,pos_provider.eq.simulation")
        .select("id");
      
      // Delete SIM- staff imports  
      const { data: staffData } = await supabase
        .from("pos_staff_import")
        .delete()
        .eq("restaurant_id", restaurantId)
        .or("external_staff_id.ilike.SIM-%,pos_provider.eq.simulation")
        .select("id");
      
      // Delete simulation sync logs
      const { data: logsData } = await supabase
        .from("pos_sync_logs")
        .delete()
        .eq("restaurant_id", restaurantId)
        .or("event_type.eq.simulation_sync,pos_provider.eq.simulation")
        .select("id");
      
      return {
        mappingsDeleted: mappingsData?.length || 0,
        salesImportsDeleted: salesData?.length || 0,
        staffImportsDeleted: staffData?.length || 0,
        syncLogsDeleted: logsData?.length || 0,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pos-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["pos-sales-imports"] });
      queryClient.invalidateQueries({ queryKey: ["pos-sync-logs"] });
      queryClient.invalidateQueries({ queryKey: ["unmapped-pos-items"] });
      queryClient.invalidateQueries({ queryKey: ["unmapped-pos-staff"] });
      const total = data.mappingsDeleted + data.salesImportsDeleted + data.staffImportsDeleted + data.syncLogsDeleted;
      toast({ 
        title: "Demo POS Data Cleared", 
        description: `Removed ${data.mappingsDeleted} mappings, ${data.salesImportsDeleted} sales imports, ${data.staffImportsDeleted} staff imports, ${data.syncLogsDeleted} sync logs`
      });
    },
    onError: (error) => {
      toast({ title: "Error clearing demo data", description: error.message, variant: "destructive" });
    },
  });
}

// Fetch unmapped POS items - aggregates line items from pos_sales_import that don't have a mapping
export function useUnmappedPOSItems(locationId?: string, posProvider?: string) {
  return useQuery({
    queryKey: ["unmapped-pos-items", locationId, posProvider],
    queryFn: async () => {
      if (!locationId) return [];
      
      // Get existing dish mappings for this location/provider
      let mappingsQuery = supabase
        .from("pos_mappings")
        .select("external_id, external_name")
        .eq("mapping_type", "dish")
        .eq("location_id", locationId);
      
      if (posProvider) {
        mappingsQuery = mappingsQuery.eq("pos_provider", posProvider);
      }
      
      const { data: mappings } = await mappingsQuery;
      const mappedNames = new Set(mappings?.map(m => m.external_name || m.external_id) || []);
      
      // Get all sales imports and extract item names
      let salesQuery = supabase
        .from("pos_sales_import")
        .select("data")
        .eq("location_id", locationId);
      
      if (posProvider) {
        salesQuery = salesQuery.eq("pos_provider", posProvider);
      }
      
      const { data: sales, error } = await salesQuery;
      if (error) throw error;
      
      // Aggregate items by name
      const itemStats = new Map<string, { count: number; qty: number; revenue: number; prices: number[] }>();
      
      for (const sale of sales || []) {
        const items = (sale.data as Record<string, unknown>)?.items as Array<{ name: string; price: string | number; qty: number }> | undefined;
        if (!items) continue;
        
        for (const item of items) {
          const name = item.name || "Unknown";
          // Skip if already mapped
          if (mappedNames.has(name)) continue;
          
          const price = typeof item.price === "string" ? parseFloat(item.price) : (item.price || 0);
          const qty = item.qty || 1;
          
          const existing = itemStats.get(name) || { count: 0, qty: 0, revenue: 0, prices: [] };
          existing.count += 1;
          existing.qty += qty;
          existing.revenue += price * qty;
          existing.prices.push(price);
          itemStats.set(name, existing);
        }
      }
      
      // Convert to array and calculate average price
      const result: UnmappedPOSItem[] = Array.from(itemStats.entries()).map(([name, stats]) => ({
        item_name: name,
        sale_count: stats.count,
        total_quantity: stats.qty,
        total_revenue: stats.revenue,
        avg_price: stats.prices.length > 0 ? stats.prices.reduce((a, b) => a + b, 0) / stats.prices.length : 0,
      }));
      
      // Sort by revenue descending
      result.sort((a, b) => b.total_revenue - a.total_revenue);
      
      return result;
    },
    enabled: !!locationId,
  });
}

// Types for unmapped staff
export interface UnmappedPOSStaff {
  operator_code: string;
  operator_name: string;
  shift_count: number;
  total_hours: number;
}

// Fetch unmapped POS staff - aggregates operators from pos_staff_import that don't have a mapping
export function useUnmappedPOSStaff(locationId?: string, posProvider?: string) {
  return useQuery({
    queryKey: ["unmapped-pos-staff", locationId, posProvider],
    queryFn: async () => {
      if (!locationId) return [];
      
      // Get existing staff mappings for this location/provider
      let mappingsQuery = supabase
        .from("pos_mappings")
        .select("external_id")
        .eq("mapping_type", "staff")
        .eq("location_id", locationId);
      
      if (posProvider) {
        mappingsQuery = mappingsQuery.eq("pos_provider", posProvider);
      }
      
      const { data: mappings } = await mappingsQuery;
      const mappedCodes = new Set(mappings?.map(m => m.external_id) || []);
      
      // Get all staff imports 
      let staffQuery = supabase
        .from("pos_staff_import")
        .select("external_staff_id, data, clock_in, clock_out")
        .eq("location_id", locationId);
      
      if (posProvider) {
        staffQuery = staffQuery.eq("pos_provider", posProvider);
      }
      
      const { data: staffImports, error } = await staffQuery;
      if (error) throw error;
      
      // Aggregate by operator code
      const operatorStats = new Map<string, { name: string; shiftCount: number; totalHours: number }>();
      
      for (const record of staffImports || []) {
        const code = record.external_staff_id;
        // Skip if already mapped
        if (mappedCodes.has(code)) continue;
        
        const data = record.data as Record<string, unknown>;
        const name = (data?.name as string) || code;
        
        // Calculate hours for this shift
        let hours = 0;
        if (record.clock_in && record.clock_out) {
          const clockIn = new Date(record.clock_in);
          const clockOut = new Date(record.clock_out);
          hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
        }
        
        const existing = operatorStats.get(code) || { name, shiftCount: 0, totalHours: 0 };
        existing.shiftCount += 1;
        existing.totalHours += hours;
        operatorStats.set(code, existing);
      }
      
      // Convert to array
      const result: UnmappedPOSStaff[] = Array.from(operatorStats.entries()).map(([code, stats]) => ({
        operator_code: code,
        operator_name: stats.name,
        shift_count: stats.shiftCount,
        total_hours: stats.totalHours,
      }));
      
      // Sort by hours descending
      result.sort((a, b) => b.total_hours - a.total_hours);
      
      return result;
    },
    enabled: !!locationId,
  });
}

// Create a new POS mapping
export function useCreatePOSMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mapping: {
      location_id: string;
      restaurant_id: string;
      pos_provider: string;
      mapping_type: string;
      external_id: string;
      external_name?: string;
      internal_id: string;
      is_verified?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("pos_mappings")
        .insert({
          location_id: mapping.location_id,
          restaurant_id: mapping.restaurant_id,
          pos_provider: mapping.pos_provider,
          mapping_type: mapping.mapping_type,
          external_id: mapping.external_id,
          external_name: mapping.external_name || null,
          internal_id: mapping.internal_id,
          is_verified: mapping.is_verified ?? true,
          confidence_score: 100,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["unmapped-pos-items"] });
      toast({ title: "Mapping created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating mapping", description: error.message, variant: "destructive" });
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
  failed_rows?: number;
  fetched?: number;
  errors?: string[];
  applied?: {
    applied_count: number;
    total_revenue: number;
    line_items_unmapped: number;
  };
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
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["profit-metrics"] });
      if (data.success || (data.sales_imported ?? 0) > 0) {
        const fetched = data.fetched ?? data.sales_imported ?? 0;
        const staged = data.sales_imported ?? 0;
        const applied = data.applied?.applied_count ?? 0;
        const failed = data.failed_rows ?? 0;
        const description =
          `Fetched ${fetched} sales, staged ${staged}, applied ${applied} to dashboard` +
          (failed ? ` · ${failed} failed` : "") +
          (data.skipped_duplicates ? ` · ${data.skipped_duplicates} duplicates` : "");
        toast({
          title: failed ? "Sync Completed With Errors" : "Sync Complete",
          description,
          variant: failed && staged === 0 ? "destructive" : undefined,
        });
      } else {
        const detail = data.error || (data.errors && data.errors[0]) || "No data imported";
        toast({ title: "Sync Failed", description: detail, variant: "destructive" });
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
  sales_to_apply: number;       // Number of unique sales (receipts) to apply
  applied_count: number;        // Sales successfully applied
  line_items_mapped: number;    // Line items that are mapped
  line_items_unmapped: number;  // Line items that are unmapped
  skipped_unmapped: number;     // Legacy: same as line_items_unmapped
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
        // Invalidate all dashboard-related queries to refresh KPIs immediately
        queryClient.invalidateQueries({ queryKey: ["pos-sales-imports"] });
        queryClient.invalidateQueries({ queryKey: ["pos-sync-logs"] });
        queryClient.invalidateQueries({ queryKey: ["sales"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
        queryClient.invalidateQueries({ queryKey: ["profit-metrics"] });
        queryClient.invalidateQueries({ queryKey: ["dishes"] }); // Fallback dish may be created
        if (data.success) {
          const unmappedNote = data.line_items_unmapped > 0 
            ? `, ${data.line_items_unmapped} line items unmapped` 
            : "";
          const revenueStr = formatCurrency(data.total_revenue);
          toast({
            title: "Applied to Dashboard", 
            description: `${data.applied_count} sales applied (${revenueStr})${unmappedNote}`
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
