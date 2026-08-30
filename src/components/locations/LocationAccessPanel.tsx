import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useLocations } from '@/hooks/useLocations';
import {
  useRestaurantMembers,
  useLocationAssignments,
  useSetLocationAssignment,
} from '@/hooks/useUserLocationAssignments';

/**
 * Owner-only control for user_location_access.
 * Owners / full-access members implicitly reach every location and need no rows.
 * Managers and staff see only the locations ticked here — enforced by RLS.
 */
export function LocationAccessPanel() {
  const { data: locations = [] } = useLocations();
  const { data: members = [], isLoading: membersLoading } = useRestaurantMembers();
  const { data: assignments = [], isLoading: assignmentsLoading } = useLocationAssignments();
  const setAssignment = useSetLocationAssignment();

  const isAssigned = (userId: string, locationId: string) =>
    assignments.some((a) => a.user_id === userId && a.location_id === locationId);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Location access</CardTitle>
        <CardDescription>
          Managers and staff can only see and edit the locations assigned to them. Owners
          always have access to every location.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {membersLoading || assignmentsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading members…
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        ) : (
          <div className="space-y-4">
            {members.map((member) => (
              <div key={member.id} className="rounded-md border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-medium">{member.role_name || member.role}</span>
                  <span className="text-xs text-muted-foreground">
                    {member.user_id.slice(0, 8)}…
                  </span>
                  {member.full_access && <Badge variant="secondary">All locations</Badge>}
                </div>
                {member.full_access ? (
                  <p className="text-sm text-muted-foreground">
                    Full access — every location in this restaurant.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    {locations.map((location) => (
                      <label key={location.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={isAssigned(member.user_id, location.id)}
                          onCheckedChange={(checked) =>
                            setAssignment.mutate({
                              userId: member.user_id,
                              locationId: location.id,
                              enabled: checked === true,
                            })
                          }
                        />
                        {location.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
