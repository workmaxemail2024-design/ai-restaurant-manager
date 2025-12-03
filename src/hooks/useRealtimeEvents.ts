import { useEffect, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export type RealtimeEventType = 
  | 'order_created'
  | 'order_updated'
  | 'stock_updated'
  | 'timesheet_clock_event'
  | 'ai_insight_generated'
  | 'notification_created';

interface RealtimeEvent {
  type: RealtimeEventType;
  table: string;
  payload: any;
  timestamp: Date;
}

interface UseRealtimeEventsOptions {
  onSalesChange?: (payload: any) => void;
  onStockChange?: (payload: any) => void;
  onAttendanceChange?: (payload: any) => void;
  onNotificationCreated?: (payload: any) => void;
  showToasts?: boolean;
}

export function useRealtimeEvents(options: UseRealtimeEventsOptions = {}) {
  const { currentRestaurant } = useRestaurant();
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const addEvent = useCallback((event: RealtimeEvent) => {
    setEvents(prev => [event, ...prev].slice(0, 50)); // Keep last 50 events
  }, []);

  useEffect(() => {
    if (!currentRestaurant?.id) return;

    const restaurantId = currentRestaurant.id;

    // Sales channel
    const salesChannel = supabase
      .channel(`sales-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => {
          console.log('Sales change:', payload);
          const eventType = payload.eventType === 'INSERT' ? 'order_created' : 'order_updated';
          addEvent({
            type: eventType as RealtimeEventType,
            table: 'sales',
            payload: payload.new,
            timestamp: new Date()
          });
          
          queryClient.invalidateQueries({ queryKey: ['sales'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
          
          options.onSalesChange?.(payload);
          
          if (options.showToasts && payload.eventType === 'INSERT') {
            toast.success('New sale recorded');
          }
        }
      )
      .subscribe();

    // Stock levels channel
    const stockChannel = supabase
      .channel(`stock-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_levels',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => {
          console.log('Stock change:', payload);
          addEvent({
            type: 'stock_updated',
            table: 'stock_levels',
            payload: payload.new,
            timestamp: new Date()
          });
          
          queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
          options.onStockChange?.(payload);
          
          if (options.showToasts) {
            toast.info('Stock levels updated');
          }
        }
      )
      .subscribe();

    // Staff attendance channel
    const attendanceChannel = supabase
      .channel(`attendance-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_attendance',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => {
          console.log('Attendance change:', payload);
          addEvent({
            type: 'timesheet_clock_event',
            table: 'staff_attendance',
            payload: payload.new,
            timestamp: new Date()
          });
          
          queryClient.invalidateQueries({ queryKey: ['staff-attendance'] });
          options.onAttendanceChange?.(payload);
        }
      )
      .subscribe();

    // Notifications channel
    const notificationsChannel = supabase
      .channel(`notifications-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => {
          console.log('Notification created:', payload);
          addEvent({
            type: 'notification_created',
            table: 'notifications',
            payload: payload.new,
            timestamp: new Date()
          });
          
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          options.onNotificationCreated?.(payload);
          
          if (options.showToasts) {
            const notification = payload.new as any;
            toast(notification.title, {
              description: notification.message,
            });
          }
        }
      )
      .subscribe();

    setIsConnected(true);

    return () => {
      setIsConnected(false);
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(stockChannel);
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(notificationsChannel);
    };
  }, [currentRestaurant?.id, queryClient, options, addEvent]);

  return {
    events,
    isConnected,
    clearEvents: () => setEvents([])
  };
}
