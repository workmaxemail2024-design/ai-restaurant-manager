import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useLocation } from "@/contexts/LocationContext";
import { useLocations } from "@/hooks/useLocations";
import { useSales } from "@/hooks/useSales";
import { useDishes } from "@/hooks/useDishes";
import { useStaff } from "@/hooks/useStaff";
import { useIngredients } from "@/hooks/useIngredients";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { useStockLevels } from "@/hooks/useStock";
import { usePOSIntegrations, usePOSSyncLogs } from "@/hooks/usePOS";
import { supabase } from "@/integrations/supabase/client";
import { 
  Building2, 
  MapPin, 
  ShoppingCart, 
  UtensilsCrossed, 
  Users, 
  Package, 
  Truck, 
  Boxes,
  Wifi,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlayCircle,
  Loader2
} from "lucide-react";
import { format, subDays } from "date-fns";

interface SmokeTestResult {
  name: string;
  status: "pass" | "fail" | "pending";
  message?: string;
}

export default function SystemQAPage() {
  const { currentRestaurant } = useRestaurant();
  const { selectedLocationId } = useLocation();
  const { data: locations } = useLocations();
  
  // Get date range for last 30 days
  const today = format(new Date(), "yyyy-MM-dd");
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
  
  // Data hooks with location scope
  const { data: sales, isLoading: salesLoading } = useSales(thirtyDaysAgo, today, selectedLocationId);
  const { data: dishes, isLoading: dishesLoading } = useDishes(selectedLocationId);
  const { data: staff, isLoading: staffLoading } = useStaff(selectedLocationId);
  const { data: ingredients, isLoading: ingredientsLoading } = useIngredients();
  const { data: purchaseOrders, isLoading: poLoading } = usePurchaseOrders(selectedLocationId);
  const { data: stockLevels, isLoading: stockLoading } = useStockLevels(selectedLocationId ?? undefined);
  const { data: posIntegrations, isLoading: posLoading } = usePOSIntegrations(selectedLocationId ?? undefined);
  const { data: syncLogs, isLoading: syncLogsLoading } = usePOSSyncLogs(selectedLocationId ?? undefined);

  // Get selected location name
  const selectedLocation = locations?.find(l => l.id === selectedLocationId);
  
  // Smoke test state
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [testResults, setTestResults] = useState<SmokeTestResult[]>([]);

  // Get latest sync log
  const latestSyncLog = syncLogs?.[0];
  const lastSyncTime = posIntegrations?.find(p => p.last_sync_time)?.last_sync_time;

  // Run smoke tests
  const runSmokeTest = async () => {
    setIsRunningTest(true);
    const results: SmokeTestResult[] = [];

    // Test 1: Can read sales
    try {
      const { data, error } = await supabase
        .from("sales")
        .select("id")
        .limit(1);
      
      if (error) throw error;
      results.push({ name: "Read Sales", status: "pass", message: `Query successful` });
    } catch (err) {
      results.push({ name: "Read Sales", status: "fail", message: String(err) });
    }

    // Test 2: Can read dishes
    try {
      const { data, error } = await supabase
        .from("dishes")
        .select("id")
        .limit(1);
      
      if (error) throw error;
      results.push({ name: "Read Dishes", status: "pass", message: `Query successful` });
    } catch (err) {
      results.push({ name: "Read Dishes", status: "fail", message: String(err) });
    }

    // Test 3: Can read staff
    try {
      const { data, error } = await supabase
        .from("staff")
        .select("id")
        .limit(1);
      
      if (error) throw error;
      results.push({ name: "Read Staff", status: "pass", message: `Query successful` });
    } catch (err) {
      results.push({ name: "Read Staff", status: "fail", message: String(err) });
    }

    // Test 4: Can read locations
    try {
      const { data, error } = await supabase
        .from("locations")
        .select("id")
        .limit(1);
      
      if (error) throw error;
      results.push({ name: "Read Locations", status: "pass", message: `Query successful` });
    } catch (err) {
      results.push({ name: "Read Locations", status: "fail", message: String(err) });
    }

    // Test 5: Can read POS integrations
    try {
      const { data, error } = await supabase
        .from("pos_integrations_safe")
        .select("id")
        .limit(1);
      
      if (error) throw error;
      results.push({ name: "Read POS Integrations", status: "pass", message: `Query successful` });
    } catch (err) {
      results.push({ name: "Read POS Integrations", status: "fail", message: String(err) });
    }

    setTestResults(results);
    setIsRunningTest(false);
  };

  const allTestsPassed = testResults.length > 0 && testResults.every(r => r.status === "pass");
  const anyTestFailed = testResults.some(r => r.status === "fail");

  const isLoading = salesLoading || dishesLoading || staffLoading || ingredientsLoading || poLoading || stockLoading || posLoading || syncLogsLoading;

  return (
    <PageLayout 
      title="System QA" 
      subtitle="Verify data flow and scope for testing purposes"
    >
      <div className="space-y-6">
        {/* Scope Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Current Scope
            </CardTitle>
            <CardDescription>Active restaurant and location context</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Restaurant */}
              <div className="rounded-lg border p-4 bg-card">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Building2 className="h-4 w-4" />
                  Restaurant
                </div>
                <div className="font-semibold text-lg">
                  {currentRestaurant?.name || "Not selected"}
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-1">
                  ID: {currentRestaurant?.id || "N/A"}
                </div>
              </div>

              {/* Location */}
              <div className="rounded-lg border p-4 bg-card">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <MapPin className="h-4 w-4" />
                  Location
                </div>
                <div className="font-semibold text-lg">
                  {selectedLocationId ? selectedLocation?.name || "Unknown" : "All Locations"}
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-1">
                  ID: {selectedLocationId || "null (All)"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Counts Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Data Counts
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardTitle>
            <CardDescription>Record counts in current scope (last 30 days for sales)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              <CountCard
                icon={ShoppingCart}
                label="Sales (30d)"
                count={sales?.length ?? 0}
                loading={salesLoading}
              />
              <CountCard
                icon={UtensilsCrossed}
                label="Dishes"
                count={dishes?.length ?? 0}
                loading={dishesLoading}
              />
              <CountCard
                icon={Users}
                label="Staff"
                count={staff?.length ?? 0}
                loading={staffLoading}
              />
              <CountCard
                icon={Package}
                label="Ingredients"
                count={ingredients?.length ?? 0}
                loading={ingredientsLoading}
              />
              <CountCard
                icon={Truck}
                label="Purchase Orders"
                count={purchaseOrders?.length ?? 0}
                loading={poLoading}
              />
              <CountCard
                icon={Boxes}
                label="Stock Items"
                count={stockLevels?.length ?? 0}
                loading={stockLoading}
              />
            </div>
          </CardContent>
        </Card>

        {/* POS Status Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary" />
              POS Status
            </CardTitle>
            <CardDescription>Integration status for current scope</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Active Integrations */}
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground mb-1">Active Integrations</div>
                <div className="text-2xl font-bold">
                  {posLoading ? "..." : posIntegrations?.filter(p => p.status === "active").length ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">
                  of {posIntegrations?.length ?? 0} total
                </div>
              </div>

              {/* Last Sync Time */}
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last Sync Time
                </div>
                <div className="text-sm font-medium">
                  {lastSyncTime 
                    ? format(new Date(lastSyncTime), "MMM d, HH:mm") 
                    : "Never synced"}
                </div>
              </div>

              {/* Last Sync Mode */}
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground mb-1">Last Sync Mode</div>
                <Badge variant={latestSyncLog?.details && (latestSyncLog.details as any).simulationMode ? "secondary" : "default"}>
                  {latestSyncLog?.details && (latestSyncLog.details as any).simulationMode 
                    ? "Simulation" 
                    : latestSyncLog ? "Live" : "N/A"}
                </Badge>
              </div>

              {/* Latest Sync Log */}
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground mb-1">Latest Sync Log</div>
                {latestSyncLog ? (
                  <div className="flex items-center gap-2">
                    <Badge variant={latestSyncLog.status === "success" ? "default" : "destructive"}>
                      {latestSyncLog.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(latestSyncLog.created_at), "MMM d, HH:mm")}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">No logs</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Smoke Test Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-primary" />
              Smoke Test
            </CardTitle>
            <CardDescription>Run lightweight read tests to verify data access</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Button 
                onClick={runSmokeTest} 
                disabled={isRunningTest}
                className="gap-2"
              >
                {isRunningTest ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running Tests...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4" />
                    Run Smoke Test
                  </>
                )}
              </Button>

              {testResults.length > 0 && (
                <div className="space-y-3">
                  {/* Overall Status */}
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${
                    allTestsPassed 
                      ? "bg-green-500/10 text-green-700 dark:text-green-400" 
                      : anyTestFailed 
                        ? "bg-red-500/10 text-red-700 dark:text-red-400"
                        : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                  }`}>
                    {allTestsPassed ? (
                      <>
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-semibold">All Tests Passed</span>
                      </>
                    ) : anyTestFailed ? (
                      <>
                        <XCircle className="h-5 w-5" />
                        <span className="font-semibold">Some Tests Failed</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5" />
                        <span className="font-semibold">Tests Running</span>
                      </>
                    )}
                  </div>

                  {/* Individual Results */}
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                    {testResults.map((result, index) => (
                      <div 
                        key={index}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          result.status === "pass" 
                            ? "border-green-500/30 bg-green-500/5" 
                            : result.status === "fail"
                              ? "border-red-500/30 bg-red-500/5"
                              : "border-yellow-500/30 bg-yellow-500/5"
                        }`}
                      >
                        <span className="font-medium">{result.name}</span>
                        <Badge variant={result.status === "pass" ? "default" : "destructive"}>
                          {result.status === "pass" ? "PASS" : "FAIL"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

// Helper component for count cards
function CountCard({ 
  icon: Icon, 
  label, 
  count, 
  loading 
}: { 
  icon: React.ElementType; 
  label: string; 
  count: number; 
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border p-4 text-center">
      <Icon className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
      <div className="text-2xl font-bold">
        {loading ? "..." : count}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
