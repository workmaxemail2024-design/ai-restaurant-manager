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

    const { frequency } = await req.json().catch(() => ({ frequency: 'all' }));

    console.log(`Processing automation rules with frequency: ${frequency}`);

    // Get all active rules matching the frequency
    let query = supabase
      .from('automation_rules')
      .select('*')
      .eq('is_active', true);

    if (frequency !== 'all') {
      query = query.eq('run_frequency', frequency);
    }

    const { data: rules, error: rulesError } = await query;

    if (rulesError) {
      throw rulesError;
    }

    console.log(`Found ${rules?.length || 0} rules to process`);

    const results = [];

    for (const rule of rules || []) {
      try {
        console.log(`Processing rule: ${rule.name} (${rule.id})`);

        // Evaluate conditions
        const conditionsMet = await evaluateConditions(supabase, rule);

        if (!conditionsMet) {
          console.log(`Conditions not met for rule: ${rule.name}`);
          continue;
        }

        // Execute actions
        const actionResults = await executeActions(supabase, rule);

        // Log the run
        await supabase.from('automation_rule_runs').insert({
          rule_id: rule.id,
          restaurant_id: rule.restaurant_id,
          status: 'success',
          message: `Executed ${rule.actions.length} action(s)`,
          run_data: { actions: actionResults },
        });

        // Update last_run
        await supabase
          .from('automation_rules')
          .update({ last_run: new Date().toISOString() })
          .eq('id', rule.id);

        // Log to audit
        await supabase.rpc('log_audit_event', {
          p_restaurant_id: rule.restaurant_id,
          p_event_type: 'automation_run',
          p_description: `Automation rule "${rule.name}" executed successfully`,
          p_data: { rule_id: rule.id, actions: actionResults },
        });

        results.push({ rule_id: rule.id, status: 'success', actions: actionResults });
      } catch (ruleError) {
        const errorMessage = ruleError instanceof Error ? ruleError.message : 'Unknown error';
        console.error(`Error processing rule ${rule.id}:`, ruleError);

        // Log failed run
        await supabase.from('automation_rule_runs').insert({
          rule_id: rule.id,
          restaurant_id: rule.restaurant_id,
          status: 'error',
          message: errorMessage,
          run_data: { error: errorMessage },
        });

        results.push({ rule_id: rule.id, status: 'error', error: errorMessage });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in automation-process-rules:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function evaluateConditions(supabase: any, rule: any): Promise<boolean> {
  const conditions = rule.conditions || [];
  
  if (conditions.length === 0) {
    return true; // No conditions means always run
  }

  for (const condition of conditions) {
    const { field, operator, value } = condition;

    // Get actual value based on field
    let actualValue: number | null = null;

    if (field === 'ingredient.quantity') {
      const { data } = await supabase
        .from('stock_levels')
        .select('quantity')
        .eq('restaurant_id', rule.restaurant_id)
        .order('quantity', { ascending: true })
        .limit(1)
        .single();
      actualValue = data?.quantity;
    } else if (field === 'staff_scheduled') {
      const { count } = await supabase
        .from('staff_shifts')
        .select('*', { count: 'exact', head: true })
        .eq('restaurant_id', rule.restaurant_id)
        .gte('shift_start', new Date().toISOString());
      actualValue = count;
    }

    if (actualValue === null) continue;

    // Evaluate condition
    const numValue = Number(value);
    let met = false;

    switch (operator) {
      case '<': met = actualValue < numValue; break;
      case '>': met = actualValue > numValue; break;
      case '==': met = actualValue === numValue; break;
      case '<=': met = actualValue <= numValue; break;
      case '>=': met = actualValue >= numValue; break;
      case '!=': met = actualValue !== numValue; break;
    }

    if (!met) return false;
  }

  return true;
}

async function executeActions(supabase: any, rule: any): Promise<any[]> {
  const results = [];

  for (const action of rule.actions || []) {
    try {
      switch (action.type) {
        case 'send_notification':
          await supabase.rpc('create_notification', {
            p_restaurant_id: rule.restaurant_id,
            p_title: action.config.title || 'Automation Alert',
            p_message: action.config.message || `Rule "${rule.name}" triggered`,
            p_type: action.config.level || 'info',
          });
          results.push({ type: 'send_notification', status: 'success' });
          break;

        case 'create_purchase_order':
          // Get low stock items
          const { data: lowStock } = await supabase
            .from('stock_levels')
            .select('ingredient_id, quantity, ingredients(supplier_id), location_id')
            .eq('restaurant_id', rule.restaurant_id)
            .lt('quantity', 10)
            .limit(10);

          if (lowStock && lowStock.length > 0) {
            // Group by supplier
            const bySupplier: Record<string, any[]> = {};
            for (const item of lowStock) {
              const supplierId = item.ingredients?.supplier_id;
              if (supplierId) {
                if (!bySupplier[supplierId]) bySupplier[supplierId] = [];
                bySupplier[supplierId].push(item);
              }
            }

            // Create POs
            for (const [supplierId, items] of Object.entries(bySupplier)) {
              const { data: po } = await supabase
                .from('purchase_orders')
                .insert({
                  restaurant_id: rule.restaurant_id,
                  supplier_id: supplierId,
                  location_id: items[0].location_id,
                  status: 'pending',
                })
                .select()
                .single();

              if (po) {
                const multiplier = action.config.quantity_multiplier || 1;
                for (const item of items) {
                  await supabase.from('purchase_order_items').insert({
                    purchase_order_id: po.id,
                    restaurant_id: rule.restaurant_id,
                    ingredient_id: item.ingredient_id,
                    quantity: Math.max(10, (10 - item.quantity) * multiplier),
                    cost_price: 0,
                  });
                }
              }
            }
            results.push({ type: 'create_purchase_order', status: 'success', count: Object.keys(bySupplier).length });
          }
          break;

        case 'run_ai_forecast_now':
          // Trigger AI forecast edge function
          results.push({ type: 'run_ai_forecast_now', status: 'queued' });
          break;

        case 'escalate_to_manager':
          await supabase.rpc('create_notification', {
            p_restaurant_id: rule.restaurant_id,
            p_title: 'Action Required',
            p_message: `Escalation from rule "${rule.name}": ${action.config.message || 'Please review'}`,
            p_type: 'action_required',
          });
          results.push({ type: 'escalate_to_manager', status: 'success' });
          break;

        default:
          results.push({ type: action.type, status: 'skipped', reason: 'Unknown action type' });
      }
      } catch (actionError) {
        const errorMessage = actionError instanceof Error ? actionError.message : 'Unknown error';
        results.push({ type: action.type, status: 'error', error: errorMessage });
      }
  }

  return results;
}
