-- Create automation_rules table
CREATE TABLE public.automation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  trigger JSONB NOT NULL DEFAULT '{}',
  conditions JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  run_frequency TEXT NOT NULL DEFAULT 'realtime',
  last_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create automation_rule_runs table
CREATE TABLE public.automation_rule_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'success',
  message TEXT,
  run_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id UUID,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id UUID,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for automation_rules
CREATE POLICY "Tenant access to automation_rules"
ON public.automation_rules
AS RESTRICTIVE
FOR ALL
USING (user_belongs_to_restaurant(restaurant_id))
WITH CHECK (user_belongs_to_restaurant(restaurant_id));

-- RLS Policies for automation_rule_runs
CREATE POLICY "Tenant access to automation_rule_runs"
ON public.automation_rule_runs
AS RESTRICTIVE
FOR ALL
USING (user_belongs_to_restaurant(restaurant_id))
WITH CHECK (user_belongs_to_restaurant(restaurant_id));

-- RLS Policies for notifications
CREATE POLICY "Tenant access to notifications"
ON public.notifications
AS RESTRICTIVE
FOR ALL
USING (user_belongs_to_restaurant(restaurant_id))
WITH CHECK (user_belongs_to_restaurant(restaurant_id));

-- RLS Policies for audit_logs
CREATE POLICY "Tenant access to audit_logs"
ON public.audit_logs
AS RESTRICTIVE
FOR ALL
USING (user_belongs_to_restaurant(restaurant_id))
WITH CHECK (user_belongs_to_restaurant(restaurant_id));

-- Create indexes
CREATE INDEX idx_automation_rules_restaurant ON public.automation_rules(restaurant_id);
CREATE INDEX idx_automation_rules_active ON public.automation_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_automation_rule_runs_rule ON public.automation_rule_runs(rule_id);
CREATE INDEX idx_notifications_restaurant ON public.notifications(restaurant_id);
CREATE INDEX idx_notifications_user ON public.notifications(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_notifications_unread ON public.notifications(restaurant_id, is_read) WHERE is_read = false;
CREATE INDEX idx_audit_logs_restaurant ON public.audit_logs(restaurant_id);
CREATE INDEX idx_audit_logs_event_type ON public.audit_logs(event_type);

-- Triggers for updated_at
CREATE TRIGGER update_automation_rules_updated_at
BEFORE UPDATE ON public.automation_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create default automation rules
CREATE OR REPLACE FUNCTION public.create_default_automation_rules(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Low stock notification rule
  INSERT INTO public.automation_rules (restaurant_id, name, description, trigger, conditions, actions, run_frequency)
  VALUES (
    p_restaurant_id,
    'Low Stock Alert',
    'Notify when ingredient stock falls below threshold',
    '{"type": "stock_level_changed"}'::jsonb,
    '[{"field": "ingredient.quantity", "operator": "<", "value": 10}]'::jsonb,
    '[{"type": "send_notification", "config": {"title": "Low Stock Alert", "message": "Ingredient stock is running low", "level": "warning", "target_role": "Manager"}}]'::jsonb,
    'realtime'
  );

  -- Daily summary rule
  INSERT INTO public.automation_rules (restaurant_id, name, description, trigger, conditions, actions, run_frequency, is_active)
  VALUES (
    p_restaurant_id,
    'Daily AI Summary',
    'Generate daily business summary using AI',
    '{"type": "daily_at_time", "time": "08:00"}'::jsonb,
    '[]'::jsonb,
    '[{"type": "run_ai_forecast_now", "config": {"type": "daily_summary"}}]'::jsonb,
    'daily',
    false
  );

  -- Weekly forecast rule
  INSERT INTO public.automation_rules (restaurant_id, name, description, trigger, conditions, actions, run_frequency, is_active)
  VALUES (
    p_restaurant_id,
    'Weekly Forecast Generation',
    'Generate weekly sales and inventory forecasts',
    '{"type": "weekly", "day": "monday"}'::jsonb,
    '[]'::jsonb,
    '[{"type": "run_ai_forecast_now", "config": {"type": "weekly_forecast"}}]'::jsonb,
    'weekly',
    false
  );

  -- Auto purchase order rule
  INSERT INTO public.automation_rules (restaurant_id, name, description, trigger, conditions, actions, run_frequency, is_active)
  VALUES (
    p_restaurant_id,
    'Auto Generate Purchase Order',
    'Automatically create purchase orders when stock is critically low',
    '{"type": "stock_level_changed"}'::jsonb,
    '[{"field": "ingredient.quantity", "operator": "<", "value": 5}]'::jsonb,
    '[{"type": "create_purchase_order", "config": {"quantity_multiplier": 3}}]'::jsonb,
    'realtime',
    false
  );
END;
$$;

-- Function to log audit events
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_restaurant_id uuid,
  p_event_type text,
  p_description text,
  p_data jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id uuid;
BEGIN
  INSERT INTO public.audit_logs (restaurant_id, user_id, event_type, description, data)
  VALUES (p_restaurant_id, auth.uid(), p_event_type, p_description, p_data)
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;

-- Function to create notification
CREATE OR REPLACE FUNCTION public.create_notification(
  p_restaurant_id uuid,
  p_title text,
  p_message text,
  p_type text DEFAULT 'info',
  p_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO public.notifications (restaurant_id, user_id, type, title, message, metadata)
  VALUES (p_restaurant_id, p_user_id, p_type, p_title, p_message, p_metadata)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;