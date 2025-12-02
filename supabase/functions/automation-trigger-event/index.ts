import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { event_type, restaurant_id, data } = await req.json();

    if (!event_type || !restaurant_id) {
      return new Response(JSON.stringify({ error: 'Missing event_type or restaurant_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing trigger event: ${event_type} for restaurant: ${restaurant_id}`);

    // Map event types to trigger types
    const triggerMap: Record<string, string> = {
      stock_updated: 'stock_level_changed',
      sale_created: 'sales_imported',
      purchase_completed: 'supplier_delivery_completed',
      forecast_complete: 'ai_forecast_ready',
    };

    const triggerType = triggerMap[event_type] || event_type;

    // Get all active realtime rules matching the trigger
    const { data: rules, error: rulesError } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .eq('is_active', true)
      .eq('run_frequency', 'realtime')
      .contains('trigger', { type: triggerType });

    if (rulesError) {
      throw rulesError;
    }

    console.log(`Found ${rules?.length || 0} matching realtime rules`);

    const results = [];

    for (const rule of rules || []) {
      try {
        // Call the main process function for each rule
        const response = await supabase.functions.invoke('automation-process-rules', {
          body: { frequency: 'realtime', rule_id: rule.id },
        });

        results.push({ rule_id: rule.id, status: 'processed' });
      } catch (ruleError) {
        const errorMessage = ruleError instanceof Error ? ruleError.message : 'Unknown error';
        console.error(`Error triggering rule ${rule.id}:`, ruleError);
        results.push({ rule_id: rule.id, status: 'error', error: errorMessage });
      }
    }

    // Log the trigger event
    await supabase.rpc('log_audit_event', {
      p_restaurant_id: restaurant_id,
      p_event_type: 'automation_run',
      p_description: `Trigger event "${event_type}" processed ${rules?.length || 0} rule(s)`,
      p_data: { event_type, trigger_type: triggerType, results },
    });

    return new Response(JSON.stringify({ 
      event_type,
      trigger_type: triggerType,
      rules_processed: results.length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in automation-trigger-event:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
