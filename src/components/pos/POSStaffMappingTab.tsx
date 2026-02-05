import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle2, AlertTriangle, Users, Link2, Search, Clock, X, Trash2, Filter
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
    <div className="space-y-4">
      {/* Clarification Banner */}
      <Card className="border-muted bg-muted/30">
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Staff Identity Mapping (Optional)</p>
              <p className="text-muted-foreground mt-0.5">
                Captiva does not provide staff clock-in/out times. Labour hours are managed in <span className="font-medium text-foreground">Timesheets</span>. 
                This mapping links POS operator names for reporting consistency only.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <p className="text-xs text-muted-foreground">Unmapped Operators</p>
            </div>
            <p className="text-xl font-bold mt-1">{unmappedStaff?.length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <p className="text-xs text-muted-foreground">Mapped Staff</p>
            </div>
            <p className="text-xl font-bold mt-1">{staffMappings.filter(m => m.internal_id).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Unmapped Shifts</p>
            </div>
            <p className="text-xl font-bold mt-1">{unmappedStaff?.reduce((sum, s) => sum + s.shift_count, 0) || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search operator..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              
              <Badge 
                variant={statusFilter === "all" ? "default" : "outline"} 
                className="cursor-pointer text-xs h-6"
                onClick={() => setStatusFilter("all")}
              >
                All
              </Badge>
              <Badge 
                variant={statusFilter === "mapped" ? "default" : "outline"} 
                className="cursor-pointer text-xs h-6"
                onClick={() => setStatusFilter("mapped")}
              >
                Mapped
              </Badge>
              <Badge 
                variant={statusFilter === "unmapped" ? "default" : "outline"} 
                className="cursor-pointer text-xs h-6"
                onClick={() => setStatusFilter("unmapped")}
              >
                Unmapped
              </Badge>
              
              {simMappingsCount > 0 && (
                <>
                  <span className="text-muted-foreground mx-0.5">|</span>
                  <Badge 
                    variant={showSimOnly ? "destructive" : "outline"} 
                    className="cursor-pointer text-xs h-6"
                    onClick={() => setShowSimOnly(!showSimOnly)}
                  >
                    SIM- ({simMappingsCount})
                  </Badge>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {staffMappings.length > 0 && (
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={bulkDeleteMappings.isPending}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Clear All Staff Mappings?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all {staffMappings.length} staff identity mappings. Operators will need to be remapped.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAllMappings} className="bg-destructive text-destructive-foreground">
                  Clear All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {simMappingsCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={bulkDeleteMappings.isPending}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Clear SIM- ({simMappingsCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear Demo Mappings?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete {simMappingsCount} demo/simulation mappings. Live Captiva mappings will not be affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearSimMappings}>
                    Clear SIM- Only
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
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Unmapped POS Operators
            </CardTitle>
            <CardDescription className="text-xs">
              Map operator codes to staff for name consistency in reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredUnmapped.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-primary" />
                <p className="text-sm">All operators mapped!</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {filteredUnmapped.map((item) => (
                  <div
                    key={item.operator_code}
                    className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{item.operator_name}</p>
                        {item.operator_code.startsWith("SIM-") && (
                          <Badge variant="secondary" className="text-[10px] h-4">SIM</Badge>
                        )}
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="font-mono">{item.operator_code}</span>
                        <span>{item.shift_count} shifts</span>
                      </div>
                    </div>
                    <Select onValueChange={(staffId) => handleMapToStaff(item.operator_code, item.operator_name, staffId)}>
                      <SelectTrigger className="w-40 h-8 text-xs">
                        <SelectValue placeholder="Map to staff..." />
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
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4 text-primary" />
              Current Staff Mappings
            </CardTitle>
            <CardDescription className="text-xs">
              Mapped operators show as their linked staff member in reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {filteredMappings.length === 0 ? (
              <p className="text-muted-foreground text-center py-4 text-sm">
                No staff mappings yet.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {filteredMappings.map((mapping) => {
                  const linkedStaff = staff?.find(s => s.id === mapping.internal_id);
                  return (
                    <div
                      key={mapping.id}
                      className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-sm truncate">{mapping.external_name || mapping.external_id}</p>
                            {mapping.external_id.startsWith("SIM-") && (
                              <Badge variant="secondary" className="text-[10px] h-4">SIM</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {mapping.external_id} → {linkedStaff ? `${linkedStaff.first_name} ${linkedStaff.last_name}` : <span className="text-warning">Unmapped</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {mapping.internal_id && (
                          <Badge variant="default" className="text-[10px] h-5">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                            Linked
                          </Badge>
                        )}
                        <Select
                          value={mapping.internal_id || ""}
                          onValueChange={(v) =>
                            updateMapping.mutate({ id: mapping.id, internal_id: v, is_verified: true })
                          }
                        >
                          <SelectTrigger className="w-32 h-7 text-xs">
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
                            className="h-7 w-7 hover:bg-secondary"
                            onClick={() => handleClearMapping(mapping.id)}
                            title="Clear mapping"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteMapping(mapping.id)}
                          title="Delete mapping"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
