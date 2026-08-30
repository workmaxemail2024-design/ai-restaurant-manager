import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { toast } from 'sonner';

// user_location_access was added after the generated Supabase types snapshot,
// so it is accessed through an untyped client handle until types regenerate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface RestaurantMember {
  id: string;
  user_id: string;
  role: string;
  role_name: string | null;
  full_access: boolean;
}

export interface LocationAssignment {
  id: string;
  user_id: string;
  location_id: string;
}

/** Members of the current restaurant (Owner-visible; RLS enforces the rest). */
export function useRestaurantMembers() {
  const { currentRestaurant } = useRestaurant();
  return useQuery({
    queryKey: ['restaurant-members', currentRestaurant?.id],
    enabled: !!currentRestaurant?.id,
    queryFn: async (): Promise<RestaurantMember[]> => {
      const { data, error } = await supabase
        .from('user_restaurants')
        .select('id, user_id, role, roles(name, permissions)')
        .eq('restaurant_id', currentRestaurant!.id);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const role = row.roles as { name?: string; permissions?: Record<string, unknown> } | null;
        return {
          id: row.id,
          user_id: row.user_id,
          role: row.role,
          role_name: role?.name ?? null,
          full_access: role?.permissions?.full_access === true,
        };
      });
    },
  });
}

/** Explicit location assignments for the current restaurant. */
export function useLocationAssignments() {
  const { currentRestaurant } = useRestaurant();
  return useQuery({
    queryKey: ['user-location-access', currentRestaurant?.id],
    enabled: !!currentRestaurant?.id,
    queryFn: async (): Promise<LocationAssignment[]> => {
      const { data, error } = await db
        .from('user_location_access')
        .select('id, user_id, location_id')
        .eq('restaurant_id', currentRestaurant!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Owner-only: grant or revoke a location for a member. RLS rejects everyone else. */
export function useSetLocationAssignment() {
  const { currentRestaurant } = useRestaurant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      locationId,
      enabled,
    }: { userId: string; locationId: string; enabled: boolean }) => {
      if (enabled) {
        const { error } = await db.from('user_location_access').insert({
          user_id: userId,
          restaurant_id: currentRestaurant!.id,
          location_id: locationId,
        });
        if (error) throw error;
      } else {
        const { error } = await db
          .from('user_location_access')
          .delete()
          .eq('user_id', userId)
          .eq('restaurant_id', currentRestaurant!.id)
          .eq('location_id', locationId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-location-access'] });
      toast.success('Location access updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
