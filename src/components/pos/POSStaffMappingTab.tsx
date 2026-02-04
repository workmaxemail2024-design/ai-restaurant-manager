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
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <p className="text-sm text-muted-foreground">Unmapped Operators</p>
            </div>
            <p className="text-2xl font-bold mt-1">{unmappedStaff?.length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Mapped Staff</p>
            </div>
            <p className="text-2xl font-bold mt-1">{staffMappings.filter(m => m.internal_id).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-secondary-foreground" />
              <p className="text-sm text-muted-foreground">Unmapped Hours</p>
            </div>
            <p className="text-2xl font-bold mt-1">{totalUnmappedHours.toFixed(1)}h</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or operator code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              
              <Badge 
                variant={statusFilter === "all" ? "default" : "outline"} 
                className="cursor-pointer"
                onClick={() => setStatusFilter("all")}
              >
                All
              </Badge>
              <Badge 
                variant={statusFilter === "mapped" ? "default" : "outline"} 
                className="cursor-pointer"
                onClick={() => setStatusFilter("mapped")}
              >
                Mapped
              </Badge>
              <Badge 
                variant={statusFilter === "unmapped" ? "default" : "outline"} 
                className="cursor-pointer"
                onClick={() => setStatusFilter("unmapped")}
              >
                Unmapped
              </Badge>
              
              <span className="text-muted-foreground mx-1">|</span>
              
              <Badge 
                variant={showSimOnly ? "destructive" : "outline"} 
                className="cursor-pointer"
                onClick={() => setShowSimOnly(!showSimOnly)}
              >
                SIM- only {simMappingsCount > 0 && `(${simMappingsCount})`}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {staffMappings.length > 0 && (
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={bulkDeleteMappings.isPending}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All Mappings
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear All Staff Mappings?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all {staffMappings.length} staff mappings for this integration. Operators will need to be remapped.
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
                <Button variant="outline" size="sm" disabled={bulkDeleteMappings.isPending}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear SIM- Mappings ({simMappingsCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear Demo/Simulation Mappings?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete {simMappingsCount} mappings with SIM- prefix (demo/simulation data). Live Captiva mappings will not be affected.
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Unmapped POS Operators
            </CardTitle>
            <CardDescription>
              Map POS operator codes to staff members for labour cost tracking. 
              Unmapped operators won't block attendance imports but their wages won't be calculated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredUnmapped.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-primary" />
                <p>All POS operators are mapped!</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredUnmapped.map((item) => (
                  <div
                    key={item.operator_code}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{item.operator_name}</p>
                        {item.operator_code.startsWith("SIM-") && (
                          <Badge variant="secondary" className="text-xs">SIM</Badge>
                        )}
                      </div>
                      <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                        <span className="font-mono">Code: {item.operator_code}</span>
                        <span>{item.shift_count} shifts</span>
                        <span>{item.total_hours.toFixed(1)} hours</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select onValueChange={(staffId) => handleMapToStaff(item.operator_code, item.operator_name, staffId)}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Map to staff..." />
                        </SelectTrigger>
                        <SelectContent>
                          {staff?.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.first_name} {s.last_name} - {formatCurrency(s.hourly_rate)}/hr
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Current Staff Mappings
            </CardTitle>
            <CardDescription>
              Mapped operators will have their attendance automatically linked to staff for wage calculations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredMappings.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No staff mappings yet. Map operators above to track labour costs.
              </p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredMappings.map((mapping) => {
                  const linkedStaff = staff?.find(s => s.id === mapping.internal_id);
                  return (
                    <div
                      key={mapping.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{mapping.external_name || mapping.external_id}</p>
                            {mapping.external_id.startsWith("SIM-") && (
                              <Badge variant="secondary" className="text-xs">SIM</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground font-mono">
                            Code: {mapping.external_id} → {linkedStaff ? `${linkedStaff.first_name} ${linkedStaff.last_name}` : <span className="text-warning">Not mapped</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {linkedStaff && (
                          <Badge variant="secondary">
                            {formatCurrency(linkedStaff.hourly_rate)}/hr
                          </Badge>
                        )}
                        {mapping.internal_id ? (
                          <Badge variant="default">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Mapped
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-warning">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Unmapped
                          </Badge>
                        )}
                        <Select
                          value={mapping.internal_id || ""}
                          onValueChange={(v) =>
                            updateMapping.mutate({ id: mapping.id, internal_id: v, is_verified: true })
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Select staff" />
                          </SelectTrigger>
                          <SelectContent>
                            {staff?.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.first_name} {s.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {mapping.internal_id && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleClearMapping(mapping.id)}
                            title="Clear mapping"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteMapping(mapping.id)}
                          title="Delete mapping"
                        >
                          <Trash2 className="h-4 w-4" />
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
