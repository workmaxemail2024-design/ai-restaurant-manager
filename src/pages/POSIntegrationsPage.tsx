import { useState, useCallback, useMemo } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  Plus, RefreshCw, Plug, AlertTriangle, CheckCircle2, XCircle, 
  Settings2, List, MapPin, Brain, Clock, Trash2, Eye, EyeOff, Download, BarChart3,
  Pencil, Info
} from "lucide-react";
import { usePOSIntegrations, usePOSSyncLogs, usePOSSalesImports,
  useCreatePOSIntegration, useUpdatePOSIntegration, useDeletePOSIntegration,
  useTestPOSConnection, usePOSReconciliation, useUpdatePOSMapping, useCaptivaSyncNow, 
  useApplyPOSImport, useToggleAutoSync, POSIntegration, ApplyImportResult } from "@/hooks/usePOS";
import { useLocations } from "@/hooks/useLocations";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import { Calendar } from "@/components/ui/calendar";
import { POSDishMappingTab } from "@/components/pos/POSDishMappingTab";
import { POSStaffMappingTab } from "@/components/pos/POSStaffMappingTab";
import { DualCalendarPicker } from "@/components/common/DualCalendarPicker";
import { useDateRangeCoverage } from "@/hooks/usePOSDateCoverage";

const POS_PROVIDERS = [
  { value: "square", label: "Square" },
  { value: "lightspeed", label: "Lightspeed" },
  { value: "clover", label: "Clover" },
  { value: "toast", label: "Toast" },
  { value: "captiva", label: "Captiva" },
  { value: "custom", label: "Custom API" },
];

interface CaptivaSettings {
  base_url?: string;
  store_id?: string;
  api_key?: string;
  username?: string;
  password?: string;
  auto_sync_daily?: boolean;
}

export default function POSIntegrationsPage() {
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<POSIntegration | null>(null);
  const [formData, setFormData] = useState({
    location_id: "",
    pos_provider: "",
    api_key: "",
    api_secret: "",
    webhook_url: "",
    captiva_base_url: "",
    captiva_store_id: "",
    captiva_username: "",
    captiva_password: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: locations } = useLocations();
  const { data: integrations, isLoading: integrationsLoading, refetch: refetchIntegrations } = usePOSIntegrations(selectedLocation || undefined);
  const { data: syncLogs, refetch: refetchLogs } = usePOSSyncLogs(selectedLocation || undefined);

  const createIntegration = useCreatePOSIntegration();
  const updateIntegration = useUpdatePOSIntegration();
  const deleteIntegration = useDeletePOSIntegration();
  const testConnection = useTestPOSConnection();
  const reconciliation = usePOSReconciliation();
  const updateMapping = useUpdatePOSMapping();
  const { toast } = useToast();

  const [reconciliationData, setReconciliationData] = useState<{
    summary?: { system_total: number; pos_total: number; difference: number; unmapped_count: number };
    anomalies?: Array<{ type: string; severity: string; message: string; recommendation: string }>;
    mapping_suggestions?: Array<{ import_id: string; external_name: string; suggested_matches: Array<{ dish_id: string; dish_name: string; confidence: number }> }>;
  } | null>(null);
  const [syncingIntegrationId, setSyncingIntegrationId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Sync Now modal state
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncModalIntegration, setSyncModalIntegration] = useState<POSIntegration | null>(null);
  const [syncDatePreset, setSyncDatePreset] = useState<"yesterday" | "last7" | "custom">("yesterday");
  const [syncCustomStart, setSyncCustomStart] = useState<Date | undefined>(subDays(new Date(), 7));
  const [syncCustomEnd, setSyncCustomEnd] = useState<Date | undefined>(new Date());
  
  // Apply to Dashboard modal state
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyModalIntegration, setApplyModalIntegration] = useState<POSIntegration | null>(null);
  const [applyDatePreset, setApplyDatePreset] = useState<"yesterday" | "last7" | "custom">("yesterday");
  const [applyCustomStart, setApplyCustomStart] = useState<Date | undefined>(subDays(new Date(), 7));
  const [applyCustomEnd, setApplyCustomEnd] = useState<Date | undefined>(new Date());
  const [applyPreview, setApplyPreview] = useState<ApplyImportResult | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  
  const captivaSyncNow = useCaptivaSyncNow();
  const applyImport = useApplyPOSImport();
  const toggleAutoSync = useToggleAutoSync();

  const [testingIntegrationId, setTestingIntegrationId] = useState<string | null>(null);

  // Reset form when modal closes
  const resetForm = useCallback(() => {
    setFormData({ 
      location_id: "", pos_provider: "", api_key: "", api_secret: "", webhook_url: "", 
      captiva_base_url: "", captiva_store_id: "", captiva_username: "", captiva_password: "" 
    });
    setFormErrors({});
    setShowPassword(false);
    setShowApiKey(false);
    setEditingIntegration(null);
  }, []);

  // Open modal for editing
  const handleOpenEditModal = useCallback((integration: POSIntegration) => {
    const settings = integration.settings as CaptivaSettings | null;
    setEditingIntegration(integration);
    setFormData({
      location_id: integration.location_id,
      pos_provider: integration.pos_provider,
      api_key: settings?.api_key || integration.api_key || "",
      api_secret: integration.api_secret || "",
      webhook_url: integration.webhook_url || "",
      captiva_base_url: settings?.base_url || "",
      captiva_store_id: settings?.store_id || "",
      captiva_username: settings?.username || "",
      captiva_password: settings?.password || "",
    });
    setFormErrors({});
    setIsAddOpen(true);
  }, []);

  // Validate Captiva fields
  const validateCaptivaForm = useCallback(() => {
    if (formData.pos_provider !== "captiva") return true;
    const errors: Record<string, string> = {};
    if (!formData.captiva_base_url.trim()) errors.captiva_base_url = "Base URL is required";
    if (!formData.captiva_store_id.trim()) errors.captiva_store_id = "Store ID is required";
    if (!formData.api_key.trim() && !editingIntegration) errors.api_key = "API Key is required";
    if (!formData.captiva_username.trim()) errors.captiva_username = "Username is required";
    if (!formData.captiva_password.trim() && !editingIntegration) errors.captiva_password = "Password is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData, editingIntegration]);

  // Get missing credentials for display
  const getMissingCredentials = useCallback((integration: POSIntegration): string[] => {
    if (integration.pos_provider !== "captiva") return [];
    const settings = integration.settings as CaptivaSettings | null;
    const missing: string[] = [];
    if (!settings?.base_url) missing.push("base_url");
    if (!settings?.store_id) missing.push("store_id");
    if (!settings?.api_key && !integration.api_key) missing.push("api_key");
    if (!settings?.username) missing.push("username");
    if (!settings?.password) missing.push("password");
    return missing;
  }, []);

  const hasValidCredentials = useCallback((integration: POSIntegration): boolean => {
    if (integration.pos_provider !== "captiva") return true;
    const settings = integration.settings as CaptivaSettings | null;
    return !!(
      settings?.base_url && 
      settings?.store_id && 
      (settings?.api_key || integration.api_key) &&
      settings?.username &&
      settings?.password
    );
  }, []);

  const handleOpenSyncModal = useCallback((integration: POSIntegration) => {
    if (!hasValidCredentials(integration)) {
      toast({ 
        title: "Missing Credentials", 
        description: "Please configure all Captiva credentials before syncing", 
        variant: "destructive" 
      });
      return;
    }
    setSyncModalIntegration(integration);
    setSyncDatePreset("yesterday");
    setSyncModalOpen(true);
  }, [hasValidCredentials, toast]);

  const handleExecuteSync = useCallback(async () => {
    if (!syncModalIntegration) return;
    
    let dateFrom: string;
    let dateTo: string;
    const today = new Date();
    
    if (syncDatePreset === "yesterday") {
      const yesterday = subDays(today, 1);
      dateFrom = format(startOfDay(yesterday), "yyyy-MM-dd");
      dateTo = format(endOfDay(yesterday), "yyyy-MM-dd");
    } else if (syncDatePreset === "last7") {
      dateFrom = format(startOfDay(subDays(today, 7)), "yyyy-MM-dd");
      dateTo = format(endOfDay(subDays(today, 1)), "yyyy-MM-dd");
    } else {
      if (!syncCustomStart || !syncCustomEnd) {
        toast({ title: "Select Dates", description: "Please select a date range", variant: "destructive" });
        return;
      }
      dateFrom = format(syncCustomStart, "yyyy-MM-dd");
      dateTo = format(syncCustomEnd, "yyyy-MM-dd");
    }

    setSyncModalOpen(false);
    setSyncingIntegrationId(syncModalIntegration.id);
    
    try {
      await captivaSyncNow.mutateAsync({
        integration_id: syncModalIntegration.id,
        location_id: syncModalIntegration.location_id,
        date_from: dateFrom,
        date_to: dateTo,
      });
    } finally {
      setSyncingIntegrationId(null);
    }
  }, [syncModalIntegration, syncDatePreset, syncCustomStart, syncCustomEnd, captivaSyncNow, toast]);

  // Calculate sync date range for coverage check
  const getSyncDateRange = useMemo(() => {
    const today = new Date();
    if (syncDatePreset === "yesterday") {
      const yesterday = subDays(today, 1);
      return {
        dateFrom: format(startOfDay(yesterday), "yyyy-MM-dd"),
        dateTo: format(endOfDay(yesterday), "yyyy-MM-dd"),
      };
    } else if (syncDatePreset === "last7") {
      return {
        dateFrom: format(startOfDay(subDays(today, 7)), "yyyy-MM-dd"),
        dateTo: format(endOfDay(subDays(today, 1)), "yyyy-MM-dd"),
      };
    } else {
      return {
        dateFrom: syncCustomStart ? format(syncCustomStart, "yyyy-MM-dd") : "",
        dateTo: syncCustomEnd ? format(syncCustomEnd, "yyyy-MM-dd") : "",
      };
    }
  }, [syncDatePreset, syncCustomStart, syncCustomEnd]);

  // Fetch coverage stats for sync modal
  const syncCoverage = useDateRangeCoverage({
    locationId: syncModalIntegration?.location_id ?? null,
    posProvider: syncModalIntegration?.pos_provider ?? '',
    dateFrom: getSyncDateRange.dateFrom,
    dateTo: getSyncDateRange.dateTo,
    enabled: syncModalOpen && !!syncModalIntegration,
  });

  const getApplyDateRange = useCallback(() => {
    const today = new Date();
    if (applyDatePreset === "yesterday") {
      const yesterday = subDays(today, 1);
      return {
        dateFrom: format(startOfDay(yesterday), "yyyy-MM-dd"),
        dateTo: format(endOfDay(yesterday), "yyyy-MM-dd"),
      };
    } else if (applyDatePreset === "last7") {
      return {
        dateFrom: format(startOfDay(subDays(today, 7)), "yyyy-MM-dd"),
        dateTo: format(endOfDay(subDays(today, 1)), "yyyy-MM-dd"),
      };
    } else {
      return {
        dateFrom: applyCustomStart ? format(applyCustomStart, "yyyy-MM-dd") : "",
        dateTo: applyCustomEnd ? format(applyCustomEnd, "yyyy-MM-dd") : "",
      };
    }
  }, [applyDatePreset, applyCustomStart, applyCustomEnd]);

  // Fetch coverage stats for apply modal
  const applyCoverage = useDateRangeCoverage({
    locationId: applyModalIntegration?.location_id ?? null,
    posProvider: applyModalIntegration?.pos_provider ?? '',
    dateFrom: getApplyDateRange().dateFrom,
    dateTo: getApplyDateRange().dateTo,
    enabled: applyModalOpen && !!applyModalIntegration,
  });

  const handleOpenApplyModal = useCallback(async (integration: POSIntegration) => {
    setApplyModalIntegration(integration);
    setApplyDatePreset("yesterday");
    setApplyPreview(null);
    setApplyModalOpen(true);
  }, []);

  const handlePreviewApply = useCallback(async () => {
    if (!applyModalIntegration) return;
    const { dateFrom, dateTo } = getApplyDateRange();
    if (!dateFrom || !dateTo) {
      toast({ title: "Select Dates", description: "Please select a date range", variant: "destructive" });
      return;
    }
    
    try {
      const result = await applyImport.mutateAsync({
        integration_id: applyModalIntegration.id,
        date_from: dateFrom,
        date_to: dateTo,
        preview_only: true,
      });
      setApplyPreview(result);
    } catch (err) {
      // Error handled by mutation
    }
  }, [applyModalIntegration, getApplyDateRange, applyImport, toast]);

  const handleExecuteApply = useCallback(async () => {
    if (!applyModalIntegration) return;
    const { dateFrom, dateTo } = getApplyDateRange();
    if (!dateFrom || !dateTo) return;

    setApplyModalOpen(false);
    setApplyingId(applyModalIntegration.id);
    
    try {
      await applyImport.mutateAsync({
        integration_id: applyModalIntegration.id,
        date_from: dateFrom,
        date_to: dateTo,
        preview_only: false,
      });
    } finally {
      setApplyingId(null);
      setApplyPreview(null);
    }
  }, [applyModalIntegration, getApplyDateRange, applyImport]);

  const handleSubmit = async () => {
    // Validate for Captiva
    if (formData.pos_provider === "captiva" && !validateCaptivaForm()) {
      return;
    }

    const captivaSettings = formData.pos_provider === "captiva" ? {
      base_url: formData.captiva_base_url,
      store_id: formData.captiva_store_id,
      api_key: formData.api_key || (editingIntegration?.settings as CaptivaSettings)?.api_key,
      username: formData.captiva_username,
      password: formData.captiva_password || (editingIntegration?.settings as CaptivaSettings)?.password,
    } : undefined;

    if (editingIntegration) {
      // Update existing integration
      await updateIntegration.mutateAsync({
        id: editingIntegration.id,
        location_id: formData.location_id,
        pos_provider: formData.pos_provider,
        api_key: formData.api_key || undefined,
        api_secret: formData.api_secret || undefined,
        webhook_url: formData.webhook_url || undefined,
        settings: captivaSettings,
      });
    } else {
      // Create new integration
      await createIntegration.mutateAsync({
        location_id: formData.location_id,
        pos_provider: formData.pos_provider,
        api_key: formData.api_key,
        api_secret: formData.api_secret,
        webhook_url: formData.webhook_url,
        settings: captivaSettings,
      });
    }
    
    setIsAddOpen(false);
    resetForm();
  };

  // Check if form is valid for submit button
  const isFormValid = useCallback(() => {
    if (!formData.location_id || !formData.pos_provider) return false;
    if (formData.pos_provider === "captiva") {
      const hasBaseUrl = formData.captiva_base_url.trim().length > 0;
      const hasStoreId = formData.captiva_store_id.trim().length > 0;
      const hasApiKey = formData.api_key.trim().length > 0 || !!editingIntegration;
      const hasUsername = formData.captiva_username.trim().length > 0;
      const hasPassword = formData.captiva_password.trim().length > 0 || !!editingIntegration;
      return hasBaseUrl && hasStoreId && hasApiKey && hasUsername && hasPassword;
    }
    return true;
  }, [formData, editingIntegration]);

  const handleTestConnection = async (integration: POSIntegration) => {
    setTestingIntegrationId(integration.id);
    try {
      if (integration.pos_provider === "captiva") {
        const settings = integration.settings as CaptivaSettings || {};
        await testConnection.mutateAsync({
          pos_provider: "captiva",
          integration_id: integration.id,
          base_url: settings.base_url || "",
          api_key: settings.api_key || integration.api_key || "",
          store_id: settings.store_id || "",
          username: settings.username || "",
          password: settings.password || "",
        });
      } else {
        await testConnection.mutateAsync({
          pos_provider: integration.pos_provider,
          integration_id: integration.id,
          api_key: integration.api_key || "",
          api_secret: integration.api_secret || undefined,
        });
      }
    } finally {
      setTestingIntegrationId(null);
    }
  };

  const handleRunReconciliation = async () => {
    if (!selectedLocation) return;
    const result = await reconciliation.mutateAsync({ location_id: selectedLocation });
    setReconciliationData(result);
  };

  const handleApplyMapping = (mappingId: string, dishId: string) => {
    updateMapping.mutate({ id: mappingId, internal_id: dishId, is_verified: true });
  };

  const getLatestCaptivaStats = (integrationId: string) => {
    const latestLog = syncLogs?.find(
      log => log.pos_provider === "captiva" && 
      (log.event_type === "sync_completed" || log.event_type === "test_sync")
    );
    if (!latestLog?.details) return null;
    const details = latestLog.details as Record<string, unknown>;
    return {
      orders: details.orders_count as number || 0,
      sales: details.sales_created as number || 0,
      attendance: details.attendance_created as number || 0,
    };
  };

  return (
    <PageLayout 
      title="POS Integrations" 
      description="Connect and manage your Point of Sale systems"
      action={
        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}><Plus className="h-4 w-4 mr-2" />Add Integration</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingIntegration ? "Edit POS Integration" : "Add POS Integration"}</DialogTitle>
              <DialogDescription>
                {editingIntegration 
                  ? "Update the integration settings. Leave password fields empty to keep existing values."
                  : "Configure a new POS system connection"
                }
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              <div>
                <Label>Location</Label>
                <Select value={formData.location_id} onValueChange={v => setFormData(p => ({ ...p, location_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>
                    {locations?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>POS Provider</Label>
                <Select value={formData.pos_provider} onValueChange={v => setFormData(p => ({ ...p, pos_provider: v }))} disabled={!!editingIntegration}>
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {POS_PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              
              {formData.pos_provider === "captiva" && (
                <>
                  <div>
                    <Label>Captiva Cloud Base URL *</Label>
                    <Input 
                      placeholder="https://your-captiva-cloud.com" 
                      value={formData.captiva_base_url} 
                      onChange={e => { setFormData(p => ({ ...p, captiva_base_url: e.target.value })); setFormErrors(p => ({ ...p, captiva_base_url: "" })); }} 
                      className={formErrors.captiva_base_url ? "border-destructive" : ""}
                    />
                    {formErrors.captiva_base_url && <p className="text-xs text-destructive mt-1">{formErrors.captiva_base_url}</p>}
                  </div>
                  <div>
                    <Label>Store / Outlet ID *</Label>
                    <Input 
                      placeholder="Store ID" 
                      value={formData.captiva_store_id} 
                      onChange={e => { setFormData(p => ({ ...p, captiva_store_id: e.target.value })); setFormErrors(p => ({ ...p, captiva_store_id: "" })); }} 
                      className={formErrors.captiva_store_id ? "border-destructive" : ""}
                    />
                    {formErrors.captiva_store_id && <p className="text-xs text-destructive mt-1">{formErrors.captiva_store_id}</p>}
                  </div>
                  <div>
                    <Label>API Key *{editingIntegration ? " (leave empty to keep existing)" : ""}</Label>
                    <div className="relative">
                      <Input 
                        type={showApiKey ? "text" : "password"} 
                        value={formData.api_key} 
                        onChange={e => { setFormData(p => ({ ...p, api_key: e.target.value })); setFormErrors(p => ({ ...p, api_key: "" })); }} 
                        placeholder={editingIntegration ? "••••••••" : ""}
                        className={formErrors.api_key ? "border-destructive" : ""}
                      />
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {formErrors.api_key && <p className="text-xs text-destructive mt-1">{formErrors.api_key}</p>}
                  </div>
                  <div>
                    <Label>Username *</Label>
                    <Input 
                      value={formData.captiva_username} 
                      onChange={e => { setFormData(p => ({ ...p, captiva_username: e.target.value })); setFormErrors(p => ({ ...p, captiva_username: "" })); }} 
                      className={formErrors.captiva_username ? "border-destructive" : ""}
                    />
                    {formErrors.captiva_username && <p className="text-xs text-destructive mt-1">{formErrors.captiva_username}</p>}
                  </div>
                  <div>
                    <Label>Password *{editingIntegration ? " (leave empty to keep existing)" : ""}</Label>
                    <div className="relative">
                      <Input 
                        type={showPassword ? "text" : "password"} 
                        value={formData.captiva_password} 
                        onChange={e => { setFormData(p => ({ ...p, captiva_password: e.target.value })); setFormErrors(p => ({ ...p, captiva_password: "" })); }} 
                        placeholder={editingIntegration ? "••••••••" : ""}
                        className={formErrors.captiva_password ? "border-destructive" : ""}
                      />
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {formErrors.captiva_password && <p className="text-xs text-destructive mt-1">{formErrors.captiva_password}</p>}
                  </div>
                </>
              )}
              
              {formData.pos_provider !== "captiva" && formData.pos_provider && (
                <>
                  <div>
                    <Label>API Key</Label>
                    <Input type="password" value={formData.api_key} onChange={e => setFormData(p => ({ ...p, api_key: e.target.value }))} />
                  </div>
                  <div>
                    <Label>API Secret</Label>
                    <Input type="password" value={formData.api_secret} onChange={e => setFormData(p => ({ ...p, api_secret: e.target.value }))} />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsAddOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={!isFormValid() || createIntegration.isPending || updateIntegration.isPending}
              >
                {(createIntegration.isPending || updateIntegration.isPending) && (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingIntegration ? "Save Changes" : "Create Integration"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        {/* Location Filter */}
        <Card>
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedLocation} onValueChange={v => setSelectedLocation(v === "all" ? "" : v)}>
                <SelectTrigger className="w-56 h-8 text-sm"><SelectValue placeholder="All locations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8" onClick={handleRunReconciliation} disabled={!selectedLocation || reconciliation.isPending}>
                <Brain className="h-3.5 w-3.5 mr-1.5" />AI Reconciliation
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="integrations">
          <TabsList>
            <TabsTrigger value="integrations"><Plug className="h-4 w-4 mr-2" />Integrations</TabsTrigger>
            <TabsTrigger value="mappings"><Settings2 className="h-4 w-4 mr-2" />Mappings</TabsTrigger>
            <TabsTrigger value="logs"><List className="h-4 w-4 mr-2" />Sync Logs</TabsTrigger>
            <TabsTrigger value="reconciliation"><Brain className="h-4 w-4 mr-2" />AI Reconciliation</TabsTrigger>
          </TabsList>

          <TabsContent value="integrations" className="space-y-4">
            {integrationsLoading ? (
              <div className="grid gap-4 md:grid-cols-2">{[1,2].map(i => <Skeleton key={i} className="h-48" />)}</div>
            ) : integrations?.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No POS integrations configured</CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {integrations?.map(integration => {
                  const settings = integration.settings as CaptivaSettings | null;
                  const stats = getLatestCaptivaStats(integration.id);
                  const credentialsValid = hasValidCredentials(integration);
                  const missingCreds = getMissingCredentials(integration);
                  
                  return (
                    <Card key={integration.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2">
                            <Plug className="h-5 w-5" />
                            {POS_PROVIDERS.find(p => p.value === integration.pos_provider)?.label || integration.pos_provider}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenEditModal(integration)}
                              title="Edit integration"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Badge variant={integration.status === "active" ? "default" : "secondary"}>
                              {integration.status}
                            </Badge>
                          </div>
                        </div>
                        <CardDescription>{integration.locations?.name}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Credentials Display for Captiva */}
                        {integration.pos_provider === "captiva" && (
                          <div className="text-xs p-2.5 rounded-md bg-muted/50 border border-border/50 overflow-hidden">
                            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                              <span className="text-muted-foreground whitespace-nowrap">Base URL</span>
                              <span className="font-mono text-[11px] truncate text-right" title={settings?.base_url || "Not set"}>
                                {settings?.base_url || <span className="text-muted-foreground/60">Not set</span>}
                              </span>
                              
                              <span className="text-muted-foreground whitespace-nowrap">Store ID</span>
                              <span className="font-mono text-[11px] truncate text-right" title={settings?.store_id || "Not set"}>
                                {settings?.store_id || <span className="text-muted-foreground/60">Not set</span>}
                              </span>
                              
                              <span className="text-muted-foreground whitespace-nowrap">API Key</span>
                              <span className="font-mono text-[11px] text-right">
                                {settings?.api_key || integration.api_key ? "••••••••" : <span className="text-muted-foreground/60">Not set</span>}
                              </span>
                              
                              <span className="text-muted-foreground whitespace-nowrap">Username</span>
                              <span className="font-mono text-[11px] truncate text-right" title={settings?.username || "Not set"}>
                                {settings?.username || <span className="text-muted-foreground/60">Not set</span>}
                              </span>
                              
                              <span className="text-muted-foreground whitespace-nowrap">Password</span>
                              <span className="font-mono text-[11px] text-right">
                                {settings?.password ? "••••••••" : <span className="text-muted-foreground/60">Not set</span>}
                              </span>
                            </div>
                            {/* Credentials Status */}
                            <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/50">
                              <span className="text-muted-foreground">Status</span>
                              {credentialsValid ? (
                                <span className="text-green-600 dark:text-green-400 flex items-center gap-1 text-[11px] font-medium">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Complete
                                </span>
                              ) : (
                                <span className="text-destructive flex items-center gap-1 text-[11px]">
                                  <AlertTriangle className="h-3 w-3" />
                                  Missing: {missingCreds.join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Test Status */}
                        {integration.last_tested_at && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Last Test</span>
                            <div className="flex items-center gap-2">
                              {integration.last_test_status === "success" ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
                              <span>{format(new Date(integration.last_tested_at), "MMM d, HH:mm")}</span>
                            </div>
                          </div>
                        )}
                        {integration.last_test_status === "failed" && integration.last_test_error && (
                          <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                            {integration.last_test_error}
                          </p>
                        )}

                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Last Sync</span>
                          <span>{integration.last_sync_time ? format(new Date(integration.last_sync_time), "MMM d, HH:mm") : "Never"}</span>
                        </div>
                        
                        {integration.pos_provider === "captiva" && stats && (
                          <div className="grid grid-cols-3 gap-2 text-center text-xs">
                            <div className="p-2 rounded bg-muted/50">
                              <p className="font-semibold text-lg">{stats.orders}</p>
                              <p className="text-muted-foreground">Orders</p>
                            </div>
                            <div className="p-2 rounded bg-muted/50">
                              <p className="font-semibold text-lg">{stats.sales}</p>
                              <p className="text-muted-foreground">Sales</p>
                            </div>
                            <div className="p-2 rounded bg-muted/50">
                              <p className="font-semibold text-lg">{stats.attendance}</p>
                              <p className="text-muted-foreground">Attendance</p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Active</span>
                          <Switch 
                            checked={integration.status === "active"}
                            onCheckedChange={checked => updateIntegration.mutate({ id: integration.id, status: checked ? "active" : "inactive" })}
                          />
                        </div>
                        
                        {/* Auto Sync Daily toggle for Captiva */}
                        {integration.pos_provider === "captiva" && credentialsValid && integration.status === "active" && (
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-sm text-muted-foreground">Auto Sync Daily</span>
                              <span className="text-xs text-muted-foreground">Syncs yesterday's data at midnight</span>
                            </div>
                            <Switch 
                              checked={settings?.auto_sync_daily === true}
                              onCheckedChange={checked => toggleAutoSync.mutate({ 
                                integrationId: integration.id, 
                                enabled: checked, 
                                currentSettings: integration.settings 
                              })}
                              disabled={toggleAutoSync.isPending}
                            />
                          </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleTestConnection(integration)}
                            disabled={testingIntegrationId === integration.id || !credentialsValid}
                          >
                            <RefreshCw className={`h-4 w-4 mr-1 ${testingIntegrationId === integration.id ? "animate-spin" : ""}`} />
                            {testingIntegrationId === integration.id ? "Testing..." : "Test Connection"}
                          </Button>
                          {integration.pos_provider === "captiva" && (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleOpenSyncModal(integration)}
                                disabled={syncingIntegrationId === integration.id || !credentialsValid}
                                title={!credentialsValid ? "Configure credentials to enable" : ""}
                              >
                                {syncingIntegrationId === integration.id ? (
                                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4 mr-1" />
                                )}
                                {syncingIntegrationId === integration.id ? "Syncing..." : "Sync Now"}
                              </Button>
                              <Button 
                                size="sm" 
                                variant="default" 
                                onClick={() => handleOpenApplyModal(integration)}
                                disabled={applyingId === integration.id}
                                title="Apply imported sales to dashboard"
                              >
                                {applyingId === integration.id ? (
                                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <BarChart3 className="h-4 w-4 mr-1" />
                                )}
                                {applyingId === integration.id ? "Applying..." : "Apply to Dashboard"}
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => deleteIntegration.mutate(integration.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="mappings" className="space-y-4">
            {!selectedLocation ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Select a location to manage POS mappings</p>
                </CardContent>
              </Card>
            ) : (
              (() => {
                // Find the first integration for this location to get provider and restaurant_id
                const integration = integrations?.find(i => i.location_id === selectedLocation);
                if (!integration) {
                  return (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <Plug className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">No POS integration found for this location. Add an integration first.</p>
                      </CardContent>
                    </Card>
                  );
                }
                return (
                  <Tabs defaultValue="dishes" className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="dishes">Dish Mappings</TabsTrigger>
                      <TabsTrigger value="staff">Staff Mappings</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="dishes">
                      <POSDishMappingTab
                        locationId={selectedLocation}
                        posProvider={integration.pos_provider}
                        restaurantId={integration.restaurant_id || ""}
                      />
                    </TabsContent>
                    
                    <TabsContent value="staff">
                      <POSStaffMappingTab
                        locationId={selectedLocation}
                        posProvider={integration.pos_provider}
                        restaurantId={integration.restaurant_id || ""}
                      />
                    </TabsContent>
                  </Tabs>
                );
              })()
            )}
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Sync History</CardTitle>
              </CardHeader>
              <CardContent>
                {syncLogs?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No sync logs yet</p>
                ) : (
                  <div className="space-y-2">
                    {syncLogs?.map(log => (
                      <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          {log.status === "success" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : log.status === "fail" ? (
                            <XCircle className="h-5 w-5 text-destructive" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-yellow-500" />
                          )}
                          <div>
                            <p className="font-medium">{log.event_type}</p>
                            <p className="text-sm text-muted-foreground">{log.message}</p>
                          </div>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          <p>{log.pos_provider}</p>
                          <p className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(log.created_at), "MMM d, HH:mm")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reconciliation" className="space-y-4">
            {!reconciliationData ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Select a location and click "AI Reconciliation" to analyze POS data</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">System Total</p>
                      <p className="text-2xl font-bold">{formatCurrency(reconciliationData.summary?.system_total || 0)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">POS Total</p>
                      <p className="text-2xl font-bold">{formatCurrency(reconciliationData.summary?.pos_total || 0)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Difference</p>
                      <p className="text-2xl font-bold text-destructive">{formatCurrency(reconciliationData.summary?.difference || 0)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Unmapped Items</p>
                      <p className="text-2xl font-bold">{reconciliationData.summary?.unmapped_count}</p>
                    </CardContent>
                  </Card>
                </div>

                {reconciliationData.anomalies && reconciliationData.anomalies.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" />Detected Anomalies</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {reconciliationData.anomalies.map((anomaly, i) => (
                        <div key={i} className={`p-4 rounded-lg border ${anomaly.severity === "high" ? "border-destructive bg-destructive/10" : "border-yellow-500 bg-yellow-500/10"}`}>
                          <p className="font-medium">{anomaly.message}</p>
                          <p className="text-sm text-muted-foreground mt-1">{anomaly.recommendation}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {reconciliationData.mapping_suggestions && reconciliationData.mapping_suggestions.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>AI Mapping Suggestions</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {reconciliationData.mapping_suggestions.slice(0, 10).map((suggestion, i) => (
                        <div key={i} className="p-4 border rounded-lg">
                          <p className="font-medium">{suggestion.external_name}</p>
                          <div className="flex gap-2 mt-2">
                            {suggestion.suggested_matches.map((match, j) => (
                              <Button 
                                key={j} 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleApplyMapping(suggestion.import_id, match.dish_id)}
                              >
                                {match.dish_name} ({match.confidence}%)
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Sync Now Modal */}
        <Dialog open={syncModalOpen} onOpenChange={setSyncModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Import Sales from Captiva
              </DialogTitle>
              <DialogDescription>
                Select a date range to import sales data from {syncModalIntegration?.locations?.name || "this location"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <RadioGroup value={syncDatePreset} onValueChange={(v) => setSyncDatePreset(v as typeof syncDatePreset)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yesterday" id="yesterday" />
                  <Label htmlFor="yesterday">Yesterday</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="last7" id="last7" />
                  <Label htmlFor="last7">Last 7 days</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label htmlFor="custom">Custom range</Label>
                </div>
              </RadioGroup>

              {syncDatePreset === "custom" && (
                <DualCalendarPicker
                  startDate={syncCustomStart}
                  endDate={syncCustomEnd}
                  onStartDateChange={setSyncCustomStart}
                  onEndDateChange={setSyncCustomEnd}
                  disabled={(date) => date > new Date()}
                  locationId={syncModalIntegration?.location_id}
                  posProvider={syncModalIntegration?.pos_provider}
                  showCoverageMarkers={true}
                />
              )}

              {/* Coverage Warning */}
              {syncCoverage.data && (syncCoverage.data.allCovered || syncCoverage.data.partiallyCovered) && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                  syncCoverage.data.allCovered 
                    ? "bg-muted/50 text-muted-foreground" 
                    : "bg-accent/50 text-accent-foreground"
                }`}>
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    {syncCoverage.data.allCovered ? (
                      <span>
                        All {syncCoverage.data.totalDays} days in this range already have imported data.
                        <span className="block text-xs opacity-80 mt-0.5">
                          Import will refresh/update existing records — no duplicates will be created.
                        </span>
                      </span>
                    ) : (
                      <span>
                        {syncCoverage.data.daysWithImports} of {syncCoverage.data.totalDays} days already imported,{" "}
                        <strong>{syncCoverage.data.newDays} new</strong>.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSyncModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleExecuteSync} disabled={captivaSyncNow.isPending}>
                {captivaSyncNow.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Import Sales
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Apply to Dashboard Modal */}
        <Dialog open={applyModalOpen} onOpenChange={(open) => {
          setApplyModalOpen(open);
          if (!open) setApplyPreview(null);
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Apply Imports to Dashboard
              </DialogTitle>
              <DialogDescription>
                Convert imported POS sales into dashboard data for {applyModalIntegration?.locations?.name || "this location"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <RadioGroup value={applyDatePreset} onValueChange={(v) => {
                setApplyDatePreset(v as typeof applyDatePreset);
                setApplyPreview(null);
              }}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yesterday" id="apply-yesterday" />
                  <Label htmlFor="apply-yesterday">Yesterday</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="last7" id="apply-last7" />
                  <Label htmlFor="apply-last7">Last 7 days</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="apply-custom" />
                  <Label htmlFor="apply-custom">Custom range</Label>
                </div>
              </RadioGroup>

              {applyDatePreset === "custom" && (
                <DualCalendarPicker
                  startDate={applyCustomStart}
                  endDate={applyCustomEnd}
                  onStartDateChange={(d) => { setApplyCustomStart(d); setApplyPreview(null); }}
                  onEndDateChange={(d) => { setApplyCustomEnd(d); setApplyPreview(null); }}
                  disabled={(date) => date > new Date()}
                  locationId={applyModalIntegration?.location_id}
                  posProvider={applyModalIntegration?.pos_provider}
                  showCoverageMarkers={true}
                />
              )}

              {/* Coverage Info (before preview) */}
              {applyCoverage.data && !applyPreview && (applyCoverage.data.daysWithImports > 0 || applyCoverage.data.daysWithApplied > 0) && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                  applyCoverage.data.daysWithApplied >= applyCoverage.data.totalDays
                    ? "bg-muted/50 text-muted-foreground"
                    : "bg-accent/50 text-accent-foreground"
                }`}>
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    {applyCoverage.data.daysWithImports} days with imported data
                    {applyCoverage.data.daysWithApplied > 0 && (
                      <span className="opacity-80">, {applyCoverage.data.daysWithApplied} already applied</span>
                    )}
                    <span className="block text-xs opacity-80 mt-0.5">
                      Click Preview to see exactly what will be applied.
                    </span>
                  </div>
                </div>
              )}

              {/* Preview Section */}
              {applyPreview && (
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <h4 className="font-medium text-sm">Preview Summary</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sales to apply:</span>
                      <span className="font-medium">{applyPreview.sales_to_apply ?? applyPreview.applied_count} sales</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total revenue:</span>
                      <span className="font-medium text-green-600 dark:text-green-400">{formatCurrency(applyPreview.total_revenue)}</span>
                    </div>
                    {applyPreview.line_items_mapped !== undefined && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Line items mapped:</span>
                          <span className="font-medium">{applyPreview.line_items_mapped}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Line items unmapped:</span>
                          <span className="font-medium">{applyPreview.line_items_unmapped}</span>
                        </div>
                      </>
                    )}
                  </div>
                  {(applyPreview.line_items_unmapped ?? applyPreview.skipped_unmapped) > 0 && (
                    <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 mt-2 pt-2 border-t border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>
                        {applyPreview.line_items_unmapped ?? applyPreview.skipped_unmapped} line items unmapped. 
                        Revenue will still be applied to dashboard. Map items in Mappings tab for detailed dish breakdown.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setApplyModalOpen(false)}>
                Cancel
              </Button>
              {!applyPreview ? (
                <Button onClick={handlePreviewApply} disabled={applyImport.isPending}>
                  {applyImport.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </>
                  )}
                </Button>
              ) : (
                <Button 
                  onClick={handleExecuteApply} 
                  disabled={applyImport.isPending || (applyPreview.sales_to_apply ?? applyPreview.applied_count) === 0}
                >
                  {applyImport.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Apply {applyPreview.sales_to_apply ?? applyPreview.applied_count} Sales ({formatCurrency(applyPreview.total_revenue)})
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  );
}