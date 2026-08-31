import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { toast } from 'sonner';

// profiles / restaurant_invites were added after the generated Supabase types
// snapshot, so they are accessed through an untyped client handle until the
// types regenerate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface RestaurantInvite {
  id: string;
  restaurant_id: string;
  email: string;
  role: string;
  role_id: string;
  location_id: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface MemberProfile {
  id: string;
  email: string;
  full_name: string | null;
}

/** Profiles of users the current admin may see (RLS scoped). */
export function useMemberProfiles(userIds: string[]) {
  const key = [...userIds].sort().join(',');
  return useQuery({
    queryKey: ['member-profiles', key],
    enabled: userIds.length > 0,
    queryFn: async (): Promise<Record<string, MemberProfile>> => {
      const { data, error } = await db
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);
      if (error) throw error;
      const map: Record<string, MemberProfile> = {};
      (data ?? []).forEach((p: MemberProfile) => { map[p.id] = p; });
      return map;
    },
  });
}

/** Invitations for the current restaurant (settings:admin only, enforced by RLS). */
export function useInvites() {
  const { currentRestaurant } = useRestaurant();
  return useQuery({
    queryKey: ['restaurant-invites', currentRestaurant?.id],
    enabled: !!currentRestaurant?.id,
    queryFn: async (): Promise<RestaurantInvite[]> => {
      const { data, error } = await db
        .from('restaurant_invites')
        .select('*')
        .eq('restaurant_id', currentRestaurant!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateInvite() {
  const { currentRestaurant, user } = useRestaurant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, roleId, locationId }: {
      email: string;
      roleId: string;
      locationId: string | null;
    }) => {
      const { error } = await db.from('restaurant_invites').insert({
        restaurant_id: currentRestaurant!.id,
        email: email.trim().toLowerCase(),
        role_id: roleId,
        location_id: locationId,
        invited_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-invites'] });
      toast.success('Invitation saved. The user joins on their next login.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await db
        .from('restaurant_invites')
        .update({ status: 'revoked' })
        .eq('id', inviteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-invites'] });
      toast.success('Invitation revoked');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
