import { useState, useCallback, useEffect } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Plus, RefreshCw, Plug, AlertTriangle, CheckCircle2, XCircle, 
  Settings2, List, MapPin, Brain, Clock, Trash2, Play, Zap, Radio
} from "lucide-react";
import { usePOSIntegrations, usePOSSyncLogs, usePOSMappings, usePOSSalesImports,
  useCreatePOSIntegration, useUpdatePOSIntegration, useDeletePOSIntegration,
  useTestPOSConnection, usePOSReconciliation, useUpdatePOSMapping, POSIntegration } from "@/hooks/usePOS";
import { useLocations } from "@/hooks/useLocations";
import { useDishes } from "@/hooks/useDishes";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const POS_PROVIDERS = [
  { value: "square", label: "Square" },
  { value: "lightspeed", label: "Lightspeed" },
  { value: "clover", label: "Clover" },
  { value: "toast", label: "Toast" },
  { value: "captiva", label: "Captiva" },
  { value: "custom", label: "Custom API" },
];

export default function POSIntegrationsPage() {
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    location_id: "",
    pos_provider: "",
    api_key: "",
    api_secret: "",
    webhook_url: "",
    captiva_base_url: "",
    captiva_store_id: "",
  });

  const { data: locations } = useLocations();
  const { data: integrations, isLoading: integrationsLoading, refetch: refetchIntegrations } = usePOSIntegrations(selectedLocation || undefined);
  const { data: syncLogs, refetch: refetchLogs } = usePOSSyncLogs(selectedLocation || undefined);
  const { data: mappings } = usePOSMappings(selectedLocation || undefined);
  const { data: salesImports } = usePOSSalesImports(selectedLocation || undefined, "pending");
  const { data: dishes } = useDishes();

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
  const [simulationRunning, setSimulationRunning] = useState(false);

  // Simulation Mode state - check settings from integration
  const [simulationMode, setSimulationMode] = useState<boolean>(true);

  // Load simulation mode from first Captiva integration settings
  useEffect(() => {
    const captivaIntegration = integrations?.find(i => i.pos_provider === "captiva");
    if (captivaIntegration) {
      const settings = captivaIntegration.settings as Record<string, string> | null;
      // Default to simulation mode unless explicitly set to live
      setSimulationMode(settings?.last_sync_mode !== "live");
    }
  }, [integrations]);

  const handleCaptivaSync = useCallback(async (integration: POSIntegration, forceSimulate: boolean = false) => {
    setSyncingIntegrationId(integration.id);
    try {
      // Check if simulation mode is enabled in integration settings
      const settings = (integration.settings || {}) as Record<string, unknown>;
      const integrationSimulate = settings.simulate === true || settings.simulate === "true";
      const shouldSimulate = forceSimulate || integrationSimulate;

      const { data, error } = await supabase.functions.invoke("captiva-sync", {
        body: { 
          integration_id: integration.id,
          location_id: integration.location_id,
          restaurant_id: (integration as any).restaurant_id,
          simulate: shouldSimulate,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast({ 
          title: shouldSimulate ? "Simulation sync completed" : "Sync Complete", 
          description: data.message || "Captiva sync completed successfully" 
        });
        refetchIntegrations();
        refetchLogs();
      } else {
        toast({ title: "Sync Failed", description: data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Sync Failed", description: `Captiva sync failed: ${err instanceof Error ? err.message : "Unknown error"}`, variant: "destructive" });
    } finally {
      setSyncingIntegrationId(null);
    }
  }, [toast, refetchIntegrations, refetchLogs]);

  const handleRunSimulationTest = useCallback(async () => {
    const captivaIntegration = integrations?.find(i => i.pos_provider === "captiva");
    if (!captivaIntegration) {
      toast({ title: "No Captiva Integration", description: "Please add a Captiva integration first", variant: "destructive" });
      return;
    }

    setSimulationRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("captiva-sync", {
        body: { 
          integration_id: captivaIntegration.id,
          location_id: captivaIntegration.location_id,
          restaurant_id: (captivaIntegration as any).restaurant_id,
          simulate: true,
        },
      });
      if (error) throw error;
      
      if (data?.success) {
        toast({ 
          title: "Simulation sync completed", 
          description: data.message || `Simulation completed with ${data.data?.orders_processed || 0} orders` 
        });
        refetchIntegrations();
        refetchLogs();
      } else {
        toast({ title: "Simulation Failed", description: data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Simulation Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSimulationRunning(false);
    }
  }, [integrations, toast, refetchIntegrations, refetchLogs]);

  const handleSubmit = async () => {
    const submitData = {
      location_id: formData.location_id,
      pos_provider: formData.pos_provider,
      api_key: formData.api_key,
      api_secret: formData.api_secret,
      webhook_url: formData.webhook_url,
      settings: formData.pos_provider === "captiva" ? {
        base_url: formData.captiva_base_url,
        store_id: formData.captiva_store_id,
      } : undefined,
    };
    
    await createIntegration.mutateAsync(submitData);
    setIsAddOpen(false);
    setFormData({ location_id: "", pos_provider: "", api_key: "", api_secret: "", webhook_url: "", captiva_base_url: "", captiva_store_id: "" });
  };

  const handleTestConnection = (integration: { pos_provider: string; api_key: string | null; api_secret: string | null; settings?: Record<string, unknown> | null }) => {
    if (integration.pos_provider === "captiva") {
      const settings = integration.settings as Record<string, string> || {};
      testCaptivaConnection({
        base_url: settings.base_url || "",
        api_key: integration.api_key || "",
        api_secret: integration.api_secret || "",
        store_id: settings.store_id || "",
        simulate: simulationMode,
      });
    } else {
      testConnection.mutate({
        pos_provider: integration.pos_provider,
        api_key: integration.api_key || "",
        api_secret: integration.api_secret || undefined,
      });
    }
  };
  
  const testCaptivaConnection = async (params: { base_url: string; api_key: string; api_secret: string; store_id: string; simulate?: boolean }) => {
    try {
      const { data, error } = await supabase.functions.invoke("captiva-test", {
        body: params,
      });
      if (error) throw error;
      if (data?.success) {
        toast({ 
          title: data.simulation ? "🎮 Simulated Connection" : "Connection Successful", 
          description: data.message || "Captiva connection validated" 
        });
      } else {
        toast({ title: "Connection Failed", description: data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Connection Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
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

  // Get latest Captiva sync stats from logs
  const getLatestCaptivaStats = (integrationId: string) => {
    const latestLog = syncLogs?.find(
      log => log.pos_provider === "captiva" && 
      (log.event_type === "sync_completed" || log.event_type === "simulation_sync" || log.event_type === "test_sync")
    );
    if (!latestLog?.details) return null;
    const details = latestLog.details as Record<string, unknown>;
    return {
      orders: details.orders_count as number || 0,
      sales: details.sales_created as number || 0,
      attendance: details.attendance_created as number || 0,
      simulation: details.simulation_mode as boolean || false,
    };
  };

  return (
    <PageLayout 
      title="POS Integrations" 
      description="Connect and manage your Point of Sale systems"
      action={
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Integration</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add POS Integration</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
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
                <Select value={formData.pos_provider} onValueChange={v => setFormData(p => ({ ...p, pos_provider: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {POS_PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>API Key</Label>
                <Input type="password" value={formData.api_key} onChange={e => setFormData(p => ({ ...p, api_key: e.target.value }))} />
              </div>
              <div>
                <Label>API Secret</Label>
                <Input type="password" value={formData.api_secret} onChange={e => setFormData(p => ({ ...p, api_secret: e.target.value }))} />
              </div>
              {formData.pos_provider === "captiva" && (
                <>
                  <div>
                    <Label>Captiva Cloud Base URL</Label>
                    <Input placeholder="https://your-captiva-cloud.com" value={formData.captiva_base_url} onChange={e => setFormData(p => ({ ...p, captiva_base_url: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Store / Outlet ID</Label>
                    <Input placeholder="Store ID (optional)" value={formData.captiva_store_id} onChange={e => setFormData(p => ({ ...p, captiva_store_id: e.target.value }))} />
                  </div>
                </>
              )}
              <Button onClick={handleSubmit} disabled={!formData.location_id || !formData.pos_provider || (formData.pos_provider === "captiva" && !formData.captiva_base_url && !simulationMode)}>
                Create Integration
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">
        {/* Location Filter + Simulation Controls */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-4">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <Select value={selectedLocation} onValueChange={v => setSelectedLocation(v === "all" ? "" : v)}>
                <SelectTrigger className="w-64"><SelectValue placeholder="All locations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleRunReconciliation} disabled={!selectedLocation || reconciliation.isPending}>
                <Brain className="h-4 w-4 mr-2" />AI Reconciliation
              </Button>
              
              {/* Simulation Test Button */}
              <Button 
                variant="secondary" 
                onClick={handleRunSimulationTest}
                disabled={simulationRunning || !integrations?.some(i => i.pos_provider === "captiva")}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 border-amber-500/50"
              >
                <Play className="h-4 w-4 mr-2" />
                {simulationRunning ? "Running..." : "Run Simulation Test"}
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
                  const settings = integration.settings as Record<string, string> | null;
                  const lastSyncMode = settings?.last_sync_mode;
                  const stats = getLatestCaptivaStats(integration.id);
                  
                  return (
                    <Card key={integration.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2">
                            <Plug className="h-5 w-5" />
                            {POS_PROVIDERS.find(p => p.value === integration.pos_provider)?.label || integration.pos_provider}
                          </CardTitle>
                          <Badge variant={integration.status === "active" ? "default" : "secondary"}>
                            {integration.status}
                          </Badge>
                        </div>
                        <CardDescription>{integration.locations?.name}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Simulation Mode Status for Captiva */}
                        {integration.pos_provider === "captiva" && (
                          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Radio className="h-4 w-4 text-amber-500" />
                                <span className="text-sm font-medium">Simulation Mode</span>
                              </div>
                              <Badge variant={simulationMode ? "default" : "outline"} className={simulationMode ? "bg-amber-500 text-white" : ""}>
                                {simulationMode ? "ON" : "OFF"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {simulationMode ? "Using fake data for testing" : "Using real Captiva API"}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Last Sync</span>
                          <span>{integration.last_sync_time ? format(new Date(integration.last_sync_time), "MMM d, HH:mm") : "Never"}</span>
                        </div>
                        
                        {integration.pos_provider === "captiva" && lastSyncMode && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Last Sync Mode</span>
                            <Badge variant={lastSyncMode === "simulation" ? "secondary" : "default"}>
                              {lastSyncMode === "simulation" ? (
                                <><Zap className="h-3 w-3 mr-1" />Simulation</>
                              ) : (
                                <><CheckCircle2 className="h-3 w-3 mr-1" />Live</>
                              )}
                            </Badge>
                          </div>
                        )}
                        
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
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => handleTestConnection(integration)}>
                            <RefreshCw className="h-4 w-4 mr-1" />Test
                          </Button>
                          {integration.pos_provider === "captiva" && (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleCaptivaSync(integration, false)}
                                disabled={syncingIntegrationId === integration.id}
                              >
                                <RefreshCw className={`h-4 w-4 mr-1 ${syncingIntegrationId === integration.id ? "animate-spin" : ""}`} />
                                {syncingIntegrationId === integration.id ? "Syncing..." : "Sync Now"}
                              </Button>
                              <Button 
                                size="sm" 
                                variant="secondary"
                                onClick={() => handleCaptivaSync(integration, true)}
                                disabled={syncingIntegrationId === integration.id}
                                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300"
                              >
                                <Play className="h-4 w-4 mr-1" />Simulate
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
            <Card>
              <CardHeader>
                <CardTitle>Item Mappings</CardTitle>
                <CardDescription>Map POS items to your menu dishes</CardDescription>
              </CardHeader>
              <CardContent>
                {mappings?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No mappings found. Import sales data first.</p>
                ) : (
                  <div className="space-y-2">
                    {mappings?.slice(0, 20).map(mapping => (
                      <div key={mapping.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{mapping.external_name || mapping.external_id}</p>
                          <p className="text-sm text-muted-foreground">{mapping.pos_provider} • {mapping.mapping_type}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {mapping.is_verified ? (
                            <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                          <Select 
                            value={mapping.internal_id || ""} 
                            onValueChange={v => updateMapping.mutate({ id: mapping.id, internal_id: v })}
                          >
                            <SelectTrigger className="w-40"><SelectValue placeholder="Map to dish" /></SelectTrigger>
                            <SelectContent>
                              {dishes?.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
                    {syncLogs?.map(log => {
                      const isSimulation = log.event_type?.includes("simulation");
                      return (
                        <div key={log.id} className={`flex items-center justify-between p-3 border rounded-lg ${isSimulation ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
                          <div className="flex items-center gap-3">
                            {log.status === "success" ? (
                              <CheckCircle2 className={`h-5 w-5 ${isSimulation ? "text-amber-500" : "text-green-500"}`} />
                            ) : log.status === "fail" ? (
                              <XCircle className="h-5 w-5 text-destructive" />
                            ) : (
                              <AlertTriangle className="h-5 w-5 text-yellow-500" />
                            )}
                            <div>
                              <p className="font-medium flex items-center gap-2">
                                {log.event_type}
                                {isSimulation && <Badge variant="secondary" className="text-xs">Simulation</Badge>}
                              </p>
                              <p className="text-sm text-muted-foreground">{log.message}</p>
                            </div>
                          </div>
                          <div className="text-right text-sm text-muted-foreground">
                            <p>{log.pos_provider}</p>
                            <p className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(log.created_at), "MMM d, HH:mm")}</p>
                          </div>
                        </div>
                      );
                    })}
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
                {/* Summary */}
                <div className="grid gap-4 md:grid-cols-4">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">System Total</p>
                      <p className="text-2xl font-bold">${reconciliationData.summary?.system_total.toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">POS Total</p>
                      <p className="text-2xl font-bold">${reconciliationData.summary?.pos_total.toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Difference</p>
                      <p className="text-2xl font-bold text-destructive">${reconciliationData.summary?.difference.toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Unmapped Items</p>
                      <p className="text-2xl font-bold">{reconciliationData.summary?.unmapped_count}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Anomalies */}
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

                {/* Mapping Suggestions */}
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
      </div>
    </PageLayout>
  );
}
