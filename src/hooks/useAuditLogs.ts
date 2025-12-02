import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRestaurant } from '@/contexts/RestaurantContext';

export interface AuditLog {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  event_type: string;
  description: string;
  data: Record<string, unknown>;
  created_at: string;
}

export const EVENT_TYPES = [
  'automation_run',
  'ai_action',
  'pos_sync',
  'staff_schedule_change',
  'menu_price_change',
  'inventory_correction',
  'role_change',
  'rule_created',
  'rule_updated',
  'rule_deleted',
  'purchase_order_created',
  'notification_sent',
];

export function useAuditLogs(filters?: {
  eventType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const { currentRestaurant } = useRestaurant();

  return useQuery({
    queryKey: ['audit-logs', currentRestaurant?.id, filters],
    queryFn: async () => {
      if (!currentRestaurant?.id) return [];

      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('restaurant_id', currentRestaurant.id)
        .order('created_at', { ascending: false });

      if (filters?.eventType) {
        query = query.eq('event_type', filters.eventType);
      }

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      } else {
        query = query.limit(100);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AuditLog[];
    },
    enabled: !!currentRestaurant?.id
  });
}
