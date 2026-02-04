import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { 
  RefreshCw, Trash2, Database, Users, ShoppingCart, Package, 
  AlertTriangle, CheckCircle2, Sparkles, Zap, Link2
} from "lucide-react";
import { useDemoStatus, useResetDemoData, useSeedDemoData, useDemoModeToggle, useIsDemoMode, usePrepareLivePos } from "@/hooks/useDemoMode";
import { useClearDemoPOSData } from "@/hooks/usePOS";
import { useRestaurant } from "@/contexts/RestaurantContext";

export default function DemoSettingsPage() {
  const { currentRestaurant, permissions } = useRestaurant();
  const { data: demoStatus, isLoading: statusLoading, refetch: refetchStatus } = useDemoStatus();
  const { data: isDemoMode } = useIsDemoMode();
  const resetData = useResetDemoData();
  const seedData = useSeedDemoData();
  const toggleDemoMode = useDemoModeToggle();
  const prepareLivePos = usePrepareLivePos();
  const clearDemoPOS = useClearDemoPOSData();

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);
  const [livePosConfirmOpen, setLivePosConfirmOpen] = useState(false);
  const [livePosConfirmText, setLivePosConfirmText] = useState("");
  const [clearDemoPosConfirmOpen, setClearDemoPosConfirmOpen] = useState(false);

  const isAdmin = permissions?.full_access === true || permissions?.settings?.admin === true;

  const handleReset = async () => {
    setResetConfirmOpen(false);
    await resetData.mutateAsync();
    refetchStatus();
  };

  const handleSeed = async () => {
    setSeedConfirmOpen(false);
    await seedData.mutateAsync();
    refetchStatus();
  };

  const handlePrepareLivePos = async () => {
    setLivePosConfirmOpen(false);
    setLivePosConfirmText("");
    await prepareLivePos.mutateAsync();
    refetchStatus();
  };

  const handleClearDemoPos = async () => {
    if (!currentRestaurant?.id) return;
    setClearDemoPosConfirmOpen(false);
    await clearDemoPOS.mutateAsync(currentRestaurant.id);
    refetchStatus();
  };

  if (!isAdmin) {
    return (
      <PageLayout title="Demo Settings" description="Configure demo mode and manage sample data">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Admin Access Required</h3>
            <p className="text-muted-foreground">Only administrators can access demo settings.</p>
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title="Demo Settings" 
      description="Configure demo mode and manage sample data for presentations"
    >
      <div className="space-y-6">
        {/* Demo Mode Toggle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Demo Mode
            </CardTitle>
            <CardDescription>
              Enable demo mode to show a banner indicating the app is in demonstration mode
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">Show Demo Banner</p>
                <p className="text-sm text-muted-foreground">
                  Displays a yellow banner at the top of the screen
                </p>
              </div>
              <Switch
                checked={isDemoMode ?? false}
                onCheckedChange={(checked) => toggleDemoMode.mutate(checked)}
                disabled={toggleDemoMode.isPending}
              />
            </div>
            {isDemoMode && (
              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Demo mode is active. The banner will be visible on all pages.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Data Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Current Data for "{currentRestaurant?.name}"
            </CardTitle>
            <CardDescription>
              Overview of operational data in this restaurant
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <ShoppingCart className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold">{demoStatus?.counts?.sales ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Sales</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <Users className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold">{demoStatus?.counts?.staff ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Staff</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <Package className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold">{demoStatus?.counts?.dishes ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Dishes</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <Database className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold">{demoStatus?.counts?.ingredients ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Ingredients</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Data Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Demo Data Actions
            </CardTitle>
            <CardDescription>
              Reset or seed sample data for demonstrations. These actions only affect the current restaurant.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Reset Demo Data */}
              <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    className="flex-1"
                    disabled={resetData.isPending}
                  >
                    {resetData.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Reset Demo Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Reset All Demo Data?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <p>This will permanently delete all operational data for <strong>{currentRestaurant?.name}</strong>:</p>
                      <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                        <li>Sales records</li>
                        <li>Staff and attendance</li>
                        <li>Dishes and ingredients</li>
                        <li>Purchase orders and documents</li>
                        <li>Stock levels and adjustments</li>
                        <li>Notifications and audit logs</li>
                      </ul>
                      <p className="font-medium mt-4">System settings, roles, and permissions will remain intact.</p>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Yes, Reset Data
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Seed Demo Data */}
              <AlertDialog open={seedConfirmOpen} onOpenChange={setSeedConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="default" 
                    className="flex-1"
                    disabled={seedData.isPending}
                  >
                    {seedData.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4 mr-2" />
                    )}
                    Seed Demo Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Seed Sample Data?</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <p>This will create sample data for <strong>{currentRestaurant?.name}</strong>:</p>
                      <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                        <li>2 suppliers (Fresh Farms, Premium Meats)</li>
                        <li>8 ingredients with costs</li>
                        <li>6 dishes with recipes</li>
                        <li>5 staff members</li>
                        <li>2 purchase orders</li>
                        <li>7 days of sales data</li>
                        <li>Stock levels and overheads</li>
                      </ul>
                      <p className="text-amber-600 dark:text-amber-400 mt-4 font-medium">
                        ⚠️ For best results, reset data first before seeding.
                      </p>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSeed}>
                      Seed Data
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Important Notes
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• These actions only affect <strong>{currentRestaurant?.name}</strong> — other restaurants are unaffected</li>
                <li>• User accounts and authentication data are never modified</li>
                <li>• Roles, permissions, and automation rules are preserved during reset</li>
                <li>• Seeding adds new data without removing existing data</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Clear Demo POS Mappings - Safe Cleanup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Clear Demo POS Mappings
            </CardTitle>
            <CardDescription>
              Safely remove only simulated/demo POS data (SIM- prefixed items) — live Captiva data will not be affected
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">This will delete:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• POS mappings with external IDs starting with <span className="font-mono bg-muted px-1 rounded">SIM-</span></li>
                <li>• POS sales imports from simulation sources</li>
                <li>• POS staff imports from simulation sources</li>
                <li>• Simulation sync logs</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg border bg-primary/5">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                What will NOT be affected:
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Live Captiva POS mappings and imports</li>
                <li>• Applied sales data in the dashboard</li>
                <li>• Restaurant, locations, and user accounts</li>
                <li>• POS integration credentials and settings</li>
              </ul>
            </div>

            <AlertDialog open={clearDemoPosConfirmOpen} onOpenChange={setClearDemoPosConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full"
                  disabled={clearDemoPOS.isPending}
                >
                  {clearDemoPOS.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Clear Demo POS Mappings
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear Demo POS Data?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>This will delete all POS mappings, imports, and logs with SIM- prefix or simulation source for <strong>{currentRestaurant?.name}</strong>.</p>
                    <p>Live Captiva data and applied sales will not be affected.</p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearDemoPos}>
                    Clear Demo Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* Prepare for Live POS */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-destructive" />
              Prepare for Live POS
            </CardTitle>
            <CardDescription>
              Clear all demo/test data to start fresh with real POS data from Captiva
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5">
              <h4 className="font-medium mb-3 flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                This will permanently delete:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <ul className="space-y-1 text-muted-foreground">
                  <li>• All sales records</li>
                  <li>• POS import staging tables</li>
                  <li>• POS sync logs</li>
                  <li>• Purchase orders & items</li>
                  <li>• Documents & invoices</li>
                  <li>• Stock levels & adjustments</li>
                </ul>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Dishes & recipes</li>
                  <li>• Ingredients & prices</li>
                  <li>• Suppliers</li>
                  <li>• Staff & shifts</li>
                  <li>• Attendance records</li>
                  <li>• Overheads</li>
                </ul>
              </div>
            </div>

            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                What will be preserved:
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Restaurant & locations</li>
                <li>• User accounts & roles</li>
                <li>• POS integration settings & credentials</li>
                <li>• Automation rules</li>
              </ul>
            </div>

            <AlertDialog open={livePosConfirmOpen} onOpenChange={(open) => {
              setLivePosConfirmOpen(open);
              if (!open) setLivePosConfirmText("");
            }}>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  className="w-full"
                  disabled={prepareLivePos.isPending}
                >
                  {prepareLivePos.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Prepare for Live POS
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Confirm: Prepare for Live POS
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-4">
                      <p>
                        You are about to <strong className="text-destructive">permanently delete all operational data</strong> for <strong>{currentRestaurant?.name}</strong>.
                      </p>
                      <p>
                        This action <strong>cannot be undone</strong>. After completion, your restaurant will be empty and ready to receive real data from your POS system.
                      </p>
                      <div className="pt-2">
                        <label className="text-sm font-medium text-foreground">
                          Type <span className="font-mono bg-muted px-1.5 py-0.5 rounded">LIVE</span> to confirm:
                        </label>
                        <Input
                          value={livePosConfirmText}
                          onChange={(e) => setLivePosConfirmText(e.target.value)}
                          placeholder="Type LIVE to confirm"
                          className="mt-2"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handlePrepareLivePos}
                    disabled={livePosConfirmText !== "LIVE"}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Confirm & Wipe Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
