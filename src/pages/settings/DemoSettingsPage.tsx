import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  AlertTriangle, CheckCircle2, Sparkles 
} from "lucide-react";
import { useDemoStatus, useResetDemoData, useSeedDemoData, useDemoModeToggle, useIsDemoMode } from "@/hooks/useDemoMode";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { RequirePermission } from "@/components/RequirePermission";

export default function DemoSettingsPage() {
  const { currentRestaurant, permissions } = useRestaurant();
  const { data: demoStatus, isLoading: statusLoading, refetch: refetchStatus } = useDemoStatus();
  const { data: isDemoMode } = useIsDemoMode();
  const resetData = useResetDemoData();
  const seedData = useSeedDemoData();
  const toggleDemoMode = useDemoModeToggle();

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);

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
      </div>
    </PageLayout>
  );
}
