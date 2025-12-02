import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { toast } from 'sonner';

export interface AutomationTrigger {
  type: string;
  time?: string;
  day?: string;
}

export interface AutomationCondition {
  field: string;
  operator: '<' | '>' | '==' | '<=' | '>=' | '!=';
  value: number | string;
}

export interface AutomationAction {
  type: string;
  config: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  run_frequency: string;
  last_run: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRuleRun {
  id: string;
  rule_id: string;
  restaurant_id: string;
  status: string;
  message: string | null;
  run_data: Record<string, unknown> | null;
  created_at: string;
}

export const TRIGGER_TYPES = [
  { value: 'stock_level_changed', label: 'Stock Level Changed' },
  { value: 'daily_at_time', label: 'Daily at Time' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'sales_imported', label: 'Sales Imported' },
  { value: 'supplier_delivery_completed', label: 'Supplier Delivery Completed' },
  { value: 'ai_forecast_ready', label: 'AI Forecast Ready' },
];

export const CONDITION_FIELDS = [
  { value: 'ingredient.quantity', label: 'Ingredient Quantity' },
  { value: 'forecasted_sales', label: 'Forecasted Sales' },
  { value: 'waste', label: 'Waste Amount' },
  { value: 'staff_scheduled', label: 'Staff Scheduled' },
  { value: 'dish.margin', label: 'Dish Margin %' },
];

export const ACTION_TYPES = [
  { value: 'create_purchase_order', label: 'Create Purchase Order' },
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'adjust_menu_price', label: 'Adjust Menu Price' },
  { value: 'schedule_additional_staff', label: 'Schedule Additional Staff' },
  { value: 'reduce_waste_item', label: 'Reduce Waste Item' },
  { value: 'run_ai_forecast_now', label: 'Run AI Forecast' },
  { value: 'escalate_to_manager', label: 'Escalate to Manager' },
];

export const RUN_FREQUENCIES = [
  { value: 'realtime', label: 'Realtime' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

export function useAutomationRules() {
  const { currentRestaurant } = useRestaurant();

  return useQuery({
    queryKey: ['automation-rules', currentRestaurant?.id],
    queryFn: async () => {
      if (!currentRestaurant?.id) return [];

      const { data, error } = await supabase
        .from('automation_rules')
        .select('*')
        .eq('restaurant_id', currentRestaurant.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(rule => ({
        ...rule,
        trigger: rule.trigger as unknown as AutomationTrigger,
        conditions: rule.conditions as unknown as AutomationCondition[],
        actions: rule.actions as unknown as AutomationAction[],
      })) as AutomationRule[];
    },
    enabled: !!currentRestaurant?.id
  });
}

export function useAutomationRuleRuns(ruleId?: string) {
  const { currentRestaurant } = useRestaurant();

  return useQuery({
    queryKey: ['automation-rule-runs', currentRestaurant?.id, ruleId],
    queryFn: async () => {
      if (!currentRestaurant?.id) return [];

      let query = supabase
        .from('automation_rule_runs')
        .select('*')
        .eq('restaurant_id', currentRestaurant.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (ruleId) {
        query = query.eq('rule_id', ruleId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AutomationRuleRun[];
    },
    enabled: !!currentRestaurant?.id
  });
}

export function useCreateAutomationRule() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();

  return useMutation({
    mutationFn: async (rule: Omit<AutomationRule, 'id' | 'restaurant_id' | 'created_at' | 'updated_at' | 'last_run'>) => {
      if (!currentRestaurant?.id) throw new Error('No restaurant selected');

      const { data, error } = await supabase
        .from('automation_rules')
        .insert({
          restaurant_id: currentRestaurant.id,
          name: rule.name,
          description: rule.description || null,
          is_active: rule.is_active,
          trigger: JSON.parse(JSON.stringify(rule.trigger)),
          conditions: JSON.parse(JSON.stringify(rule.conditions)),
          actions: JSON.parse(JSON.stringify(rule.actions)),
          run_frequency: rule.run_frequency,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      toast.success('Automation rule created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create rule: ${error.message}`);
    }
  });
}

export function useUpdateAutomationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AutomationRule> & { id: string }) => {
      const updateData: Record<string, unknown> = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.is_active !== undefined) updateData.is_active = updates.is_active;
      if (updates.trigger !== undefined) updateData.trigger = JSON.parse(JSON.stringify(updates.trigger));
      if (updates.conditions !== undefined) updateData.conditions = JSON.parse(JSON.stringify(updates.conditions));
      if (updates.actions !== undefined) updateData.actions = JSON.parse(JSON.stringify(updates.actions));
      if (updates.run_frequency !== undefined) updateData.run_frequency = updates.run_frequency;

      const { data, error } = await supabase
        .from('automation_rules')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      toast.success('Automation rule updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update rule: ${error.message}`);
    }
  });
}

export function useDeleteAutomationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('automation_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      toast.success('Automation rule deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete rule: ${error.message}`);
    }
  });
}

export function useToggleAutomationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('automation_rules')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      toast.success(`Rule ${data.is_active ? 'enabled' : 'disabled'}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to toggle rule: ${error.message}`);
    }
  });
}
