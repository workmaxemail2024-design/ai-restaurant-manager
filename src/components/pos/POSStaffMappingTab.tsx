import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle2, AlertTriangle, Users, Link2, Search, Clock
} from "lucide-react";
import { useStaff } from "@/hooks/useStaff";
import { useUnmappedPOSStaff, useCreatePOSMapping, useUpdatePOSMapping, usePOSMappings } from "@/hooks/usePOS";
import { formatCurrency } from "@/lib/currency";

interface POSStaffMappingTabProps {
  locationId: string;
  posProvider: string;
  restaurantId: string;
}

export function POSStaffMappingTab({ locationId, posProvider, restaurantId }: POSStaffMappingTabProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: unmappedStaff, isLoading: unmappedLoading } = useUnmappedPOSStaff(locationId, posProvider);
  const { data: mappings, isLoading: mappingsLoading } = usePOSMappings(locationId, posProvider);
  const { data: staff } = useStaff();
  
  const createMapping = useCreatePOSMapping();
  const updateMapping = useUpdatePOSMapping();

  // Filter by search
  const filteredUnmapped = unmappedStaff?.filter(item => 
    item.operator_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.operator_code.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Get staff mappings (type = "staff")
  const staffMappings = mappings?.filter(m => m.mapping_type === "staff") || [];

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

  const isLoading = unmappedLoading || mappingsLoading;

  // Calculate total hours from unmapped staff
  const totalUnmappedHours = unmappedStaff?.reduce((sum, s) => sum + s.total_hours, 0) || 0;

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
            <p className="text-2xl font-bold mt-1">{staffMappings.length}</p>
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

      {/* Unmapped Operators Section */}
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
          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or operator code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

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
                    <p className="font-medium">{item.operator_name}</p>
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
                        ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing Mappings Section */}
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
          {staffMappings.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No staff mappings yet. Map operators above to track labour costs.
            </p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {staffMappings.map((mapping) => {
                const linkedStaff = staff?.find(s => s.id === mapping.internal_id);
                return (
                  <div
                    key={mapping.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{mapping.external_name || mapping.external_id}</p>
                        <p className="text-sm text-muted-foreground font-mono">
                          Code: {mapping.external_id} → {linkedStaff ? `${linkedStaff.first_name} ${linkedStaff.last_name}` : "Unknown"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {linkedStaff && (
                        <Badge variant="secondary">
                          {formatCurrency(linkedStaff.hourly_rate)}/hr
                        </Badge>
                      )}
                      {mapping.is_verified ? (
                        <Badge variant="default">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                      <Select
                        value={mapping.internal_id || ""}
                        onValueChange={(v) =>
                          updateMapping.mutate({ id: mapping.id, internal_id: v, is_verified: true })
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Change staff" />
                        </SelectTrigger>
                        <SelectContent>
                          {staff?.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.first_name} {s.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

