import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle2, AlertTriangle, Users, Link2, Search, X, Trash2, Filter
} from "lucide-react";
import { useStaff } from "@/hooks/useStaff";
import { useUnmappedPOSStaff, useCreatePOSMapping, useUpdatePOSMapping, useDeletePOSMapping, useBulkDeletePOSMappings, usePOSMappings } from "@/hooks/usePOS";
import { formatCurrency } from "@/lib/currency";

interface POSStaffMappingTabProps {
  locationId: string;
  posProvider: string;
  restaurantId: string;
}

type StatusFilter = "all" | "mapped" | "unmapped";

export function POSStaffMappingTab({ locationId, posProvider, restaurantId }: POSStaffMappingTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showSimOnly, setShowSimOnly] = useState(false);

  const { data: unmappedStaff, isLoading: unmappedLoading } = useUnmappedPOSStaff(locationId, posProvider);
  const { data: mappings, isLoading: mappingsLoading } = usePOSMappings(locationId, posProvider);
  const { data: staff } = useStaff();
  
  const createMapping = useCreatePOSMapping();
  const updateMapping = useUpdatePOSMapping();
  const deleteMapping = useDeletePOSMapping();
  const bulkDeleteMappings = useBulkDeletePOSMappings();

  // Get staff mappings (type = "staff")
  const staffMappings = mappings?.filter(m => m.mapping_type === "staff") || [];

  // Filter mappings by search, status, and SIM prefix
  const filteredMappings = staffMappings.filter(mapping => {
    const matchesSearch = searchQuery === "" || 
      (mapping.external_name || mapping.external_id).toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "mapped" ? mapping.internal_id !== null : mapping.internal_id === null);
    
    const matchesSim = !showSimOnly || mapping.external_id.startsWith("SIM-");
    
    return matchesSearch && matchesStatus && matchesSim;
  });

  // Filter unmapped staff by search and SIM prefix
  const filteredUnmapped = unmappedStaff?.filter(item => {
    const matchesSearch = 
      item.operator_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.operator_code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSim = !showSimOnly || item.operator_code.startsWith("SIM-");
    return matchesSearch && matchesSim;
  }) || [];

  const handleMapToStaff = async (operatorCode: string, operatorName: string, staffId: string) => {
    await createMapping.mutateAsync({
      location_id: locationId,
      restaurant_id: restaurantId,
      pos_provider: posProvider,
      mapping_type: "staff",
      external_id: operatorCode,
      external_name: operatorName,
      internal_id: staffId,
      is_verified: true,
    });
  };

  const handleClearMapping = (mappingId: string) => {
    updateMapping.mutate({ id: mappingId, internal_id: null, is_verified: false });
  };

  const handleDeleteMapping = (mappingId: string) => {
    deleteMapping.mutate(mappingId);
  };

  const handleClearAllMappings = () => {
    bulkDeleteMappings.mutate({ 
      locationId, 
      posProvider, 
      mappingType: "staff" 
    });
  };

  const handleClearSimMappings = () => {
    bulkDeleteMappings.mutate({ 
      locationId, 
      posProvider, 
      mappingType: "staff",
      simOnly: true 
    });
  };

  const isLoading = unmappedLoading || mappingsLoading;
  const totalUnmappedHours = unmappedStaff?.reduce((sum, s) => sum + s.total_hours, 0) || 0;
  const simMappingsCount = staffMappings.filter(m => m.external_id.startsWith("SIM-")).length;

  return (
    <div className="space-y-3">
      {/* Clarification Banner */}
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
        <CardContent className="py-2.5 px-3">
          <div className="flex items-center gap-2.5">
            <Users className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              <span className="font-medium">Identity mapping only</span> — Captiva doesn't provide clock-in/out. Labour hours are in <span className="font-semibold">Timesheets</span>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards - Compact */}
      <div className="grid gap-2 md:grid-cols-3">
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                <span className="text-[11px] text-muted-foreground">Unmapped</span>
              </div>
              <span className="text-lg font-bold">{unmappedStaff?.length || 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] text-muted-foreground">Mapped</span>
              </div>
              <span className="text-lg font-bold">{staffMappings.filter(m => m.internal_id).length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Operators</span>
              </div>
              <span className="text-lg font-bold">{staffMappings.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card>
        <CardContent className="py-2.5 px-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 h-7 text-xs"
              />
            </div>
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3 text-muted-foreground" />
              {(["all", "mapped", "unmapped"] as const).map(status => (
                <Badge 
                  key={status}
                  variant={statusFilter === status ? "default" : "outline"} 
                  className="cursor-pointer text-[10px] h-5 px-1.5"
                  onClick={() => setStatusFilter(status)}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Badge>
              ))}
              {simMappingsCount > 0 && (
                <>
                  <span className="text-muted-foreground/50 mx-0.5">|</span>
                  <Badge 
                    variant={showSimOnly ? "destructive" : "outline"} 
                    className="cursor-pointer text-[10px] h-5 px-1.5"
                    onClick={() => setShowSimOnly(!showSimOnly)}
                  >
                    SIM ({simMappingsCount})
                  </Badge>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {staffMappings.length > 0 && (
        <div className="flex gap-1.5">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={bulkDeleteMappings.isPending}>
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-sm">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base">Clear All Staff Mappings?</AlertDialogTitle>
                <AlertDialogDescription className="text-sm">
                  Delete {staffMappings.length} mappings. Operators will need remapping.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-8">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAllMappings} className="h-8 bg-destructive text-destructive-foreground">
                  Clear
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {simMappingsCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={bulkDeleteMappings.isPending}>
                  <Trash2 className="h-3 w-3 mr-1" />
                  SIM ({simMappingsCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-sm">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-base">Clear Demo Mappings?</AlertDialogTitle>
                  <AlertDialogDescription className="text-sm">
                    Delete {simMappingsCount} simulation mappings.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="h-8">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearSimMappings} className="h-8">
                    Clear SIM
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {/* Unmapped Operators Section */}
      {(statusFilter === "all" || statusFilter === "unmapped") && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              Unmapped Operators
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 pb-3">
            {isLoading ? (
              <div className="space-y-1.5">
                {[1, 2].map(i => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filteredUnmapped.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <CheckCircle2 className="h-6 w-6 mx-auto mb-1.5 text-primary" />
                <p className="text-xs">All mapped!</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[240px] overflow-y-auto">
                {filteredUnmapped.map((item) => (
                  <div
                    key={item.operator_code}
                    className="flex items-center justify-between p-2 border rounded hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-xs truncate">{item.operator_name}</p>
                        {item.operator_code.startsWith("SIM-") && (
                          <Badge variant="secondary" className="text-[9px] h-4 px-1">SIM</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono">{item.operator_code} · {item.shift_count} shifts</p>
                    </div>
                    <Select onValueChange={(staffId) => handleMapToStaff(item.operator_code, item.operator_name, staffId)}>
                      <SelectTrigger className="w-32 h-7 text-[11px]">
                        <SelectValue placeholder="Map to..." />
                      </SelectTrigger>
                      <SelectContent>
                        {staff?.map((s) => (
                          <SelectItem key={s.id} value={s.id} className="text-xs">
                            {s.first_name} {s.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Existing Mappings Section */}
      {(statusFilter === "all" || statusFilter === "mapped") && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <Link2 className="h-3.5 w-3.5 text-primary" />
              Mapped Staff
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 pb-3">
            {filteredMappings.length === 0 ? (
              <p className="text-muted-foreground text-center py-3 text-xs">
                No mappings yet
              </p>
            ) : (
              <div className="space-y-1 max-h-[240px] overflow-y-auto">
                {filteredMappings.map((mapping) => {
                  const linkedStaff = staff?.find(s => s.id === mapping.internal_id);
                  return (
                    <div
                      key={mapping.id}
                      className="flex items-center justify-between p-2 border rounded hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="font-medium text-xs truncate">{mapping.external_name || mapping.external_id}</p>
                            {mapping.external_id.startsWith("SIM-") && (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1">SIM</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">
                            → {linkedStaff ? `${linkedStaff.first_name} ${linkedStaff.last_name}` : <span className="text-warning">Unmapped</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Select
                          value={mapping.internal_id || ""}
                          onValueChange={(v) =>
                            updateMapping.mutate({ id: mapping.id, internal_id: v, is_verified: true })
                          }
                        >
                          <SelectTrigger className="w-28 h-6 text-[10px]">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {staff?.map((s) => (
                              <SelectItem key={s.id} value={s.id} className="text-xs">
                                {s.first_name} {s.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {mapping.internal_id && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 hover:bg-secondary"
                            onClick={() => handleClearMapping(mapping.id)}
                            title="Clear"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteMapping(mapping.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
