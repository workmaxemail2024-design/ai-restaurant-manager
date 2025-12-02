import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { useEffect } from 'react';

export interface Notification {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  type: 'info' | 'warning' | 'error' | 'action_required';
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export function useNotifications(limit: number = 15) {
  const { currentRestaurant } = useRestaurant();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', currentRestaurant?.id, limit],
    queryFn: async () => {
      if (!currentRestaurant?.id) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('restaurant_id', currentRestaurant.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!currentRestaurant?.id
  });

  // Real-time subscription
  useEffect(() => {
    if (!currentRestaurant?.id) return;

    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `restaurant_id=eq.${currentRestaurant.id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRestaurant?.id, queryClient]);

  return query;
}

export function useUnreadNotificationCount() {
  const { currentRestaurant } = useRestaurant();

  return useQuery({
    queryKey: ['notifications-unread-count', currentRestaurant?.id],
    queryFn: async () => {
      if (!currentRestaurant?.id) return 0;

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('restaurant_id', currentRestaurant.id)
        .eq('is_read', false);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentRestaurant?.id
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    }
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();

  return useMutation({
    mutationFn: async () => {
      if (!currentRestaurant?.id) throw new Error('No restaurant selected');

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('restaurant_id', currentRestaurant.id)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    }
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    }
  });
}
