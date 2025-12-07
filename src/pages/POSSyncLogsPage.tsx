import { useState } from "react";
import { PageLayout } from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCw, 
  MapPin, Zap, Activity, ChevronDown
} from "lucide-react";
import { usePOSSyncLogs } from "@/hooks/usePOS";
import { useLocations } from "@/hooks/useLocations";
import { format } from "date-fns";

export default function POSSyncLogsPage() {
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const { data: locations } = useLocations();
  const { data: syncLogs, isLoading, refetch } = usePOSSyncLogs(selectedLocation || undefined);

  const getStatusIcon = (status: string, isSimulation: boolean) => {
    if (status === "success") {
      return <CheckCircle2 className={`h-5 w-5 ${isSimulation ? "text-amber-500" : "text-green-500"}`} />;
    } else if (status === "fail") {
      return <XCircle className="h-5 w-5 text-destructive" />;
    }
    return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
  };

  const getLogStats = (details: Record<string, unknown> | null) => {
    if (!details) return null;
    return {
      orders: (details.orders_count as number) || 0,
      sales: (details.sales_created as number) || 0,
      dishes: (details.dishes_created as number) || 0,
      attendance: (details.attendance_created as number) || 0,
      skippedSales: (details.skipped_sales as number) || 0,
      skippedDishes: (details.skipped_dishes as number) || 0,
      skippedAttendance: (details.skipped_attendance as number) || 0,
      errors: (details.validation_errors as unknown[]) || [],
      simulation: details.simulation_mode as boolean,
    };
  };

  return (
    <PageLayout
      title="POS Sync Logs"
      description="View sync history and validation errors"
      action={
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <Select value={selectedLocation} onValueChange={v => setSelectedLocation(v === "all" ? "" : v)}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations?.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Syncs</p>
                  <p className="text-2xl font-bold">{syncLogs?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Successful</p>
                  <p className="text-2xl font-bold">{syncLogs?.filter(l => l.status === "success").length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold">{syncLogs?.filter(l => l.status === "fail").length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Simulations</p>
                  <p className="text-2xl font-bold">{syncLogs?.filter(l => l.event_type?.includes("simulation")).length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Sync History</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
              </div>
            ) : syncLogs?.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No sync logs found</p>
            ) : (
              <Accordion type="single" collapsible className="space-y-2">
                {syncLogs?.map(log => {
                  const isSimulation = log.event_type?.includes("simulation");
                  const stats = getLogStats(log.details);
                  const hasErrors = stats?.errors && stats.errors.length > 0;

                  return (
                    <AccordionItem 
                      key={log.id} 
                      value={log.id}
                      className={`border rounded-lg px-4 ${
                        log.status === "fail" 
                          ? "border-destructive/50 bg-destructive/5" 
                          : isSimulation 
                            ? "border-amber-500/30 bg-amber-500/5" 
                            : ""
                      }`}
                    >
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(log.status, isSimulation)}
                            <div className="text-left">
                              <p className="font-medium flex items-center gap-2">
                                {log.event_type}
                                {isSimulation && (
                                  <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-700">
                                    Simulation
                                  </Badge>
                                )}
                                {hasErrors && (
                                  <Badge variant="destructive" className="text-xs">
                                    {stats?.errors.length} errors
                                  </Badge>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">{log.message}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <Badge variant="outline">{log.pos_provider}</Badge>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                            </span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-4">
                        {stats && (
                          <div className="space-y-4">
                            {/* Stats Grid */}
                            <div className="grid grid-cols-4 md:grid-cols-7 gap-2 text-center text-xs">
                              <div className="p-2 rounded bg-muted/50">
                                <p className="font-semibold text-lg">{stats.orders}</p>
                                <p className="text-muted-foreground">Orders</p>
                              </div>
                              <div className="p-2 rounded bg-green-500/10">
                                <p className="font-semibold text-lg text-green-600">{stats.sales}</p>
                                <p className="text-muted-foreground">Sales</p>
                              </div>
                              <div className="p-2 rounded bg-blue-500/10">
                                <p className="font-semibold text-lg text-blue-600">{stats.dishes}</p>
                                <p className="text-muted-foreground">Dishes</p>
                              </div>
                              <div className="p-2 rounded bg-purple-500/10">
                                <p className="font-semibold text-lg text-purple-600">{stats.attendance}</p>
                                <p className="text-muted-foreground">Attendance</p>
                              </div>
                              <div className="p-2 rounded bg-destructive/10">
                                <p className="font-semibold text-lg text-destructive">{stats.skippedSales}</p>
                                <p className="text-muted-foreground">Skipped Sales</p>
                              </div>
                              <div className="p-2 rounded bg-destructive/10">
                                <p className="font-semibold text-lg text-destructive">{stats.skippedDishes}</p>
                                <p className="text-muted-foreground">Skipped Dishes</p>
                              </div>
                              <div className="p-2 rounded bg-destructive/10">
                                <p className="font-semibold text-lg text-destructive">{stats.skippedAttendance}</p>
                                <p className="text-muted-foreground">Skipped Attendance</p>
                              </div>
                            </div>

                            {/* Validation Errors */}
                            {hasErrors && (
                              <div className="mt-4">
                                <h4 className="font-medium text-destructive mb-2">Validation Errors</h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {stats.errors.map((error: any, i: number) => (
                                    <div key={i} className="p-2 rounded bg-destructive/10 border border-destructive/30 text-sm">
                                      <span className="font-medium">[{error.type}]</span> {error.field}: {error.message}
                                      {error.record_id && <span className="text-muted-foreground"> (ID: {error.record_id})</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Raw JSON Details */}
                            <details className="mt-4">
                              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                                View Raw Log Details
                              </summary>
                              <pre className="mt-2 p-3 rounded bg-muted text-xs overflow-x-auto max-h-64">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
