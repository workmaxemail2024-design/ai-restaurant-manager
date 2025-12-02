import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's auth
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's current restaurant and role
    const { data: userRestaurant, error: urError } = await supabase
      .from('user_restaurants')
      .select(`
        id,
        restaurant_id,
        role_id,
        is_default,
        roles (
          id,
          name,
          description,
          permissions,
          is_system_role
        )
      `)
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single();

    if (urError) {
      console.error('Error fetching user restaurant:', urError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch user permissions',
          permissions: {},
          role: null,
          restaurant_id: null
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userRestaurant) {
      return new Response(
        JSON.stringify({ 
          permissions: {},
          role: null,
          restaurant_id: null,
          message: 'No restaurant assigned'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const role = userRestaurant.roles as any;
    const permissions = role?.permissions || {};

    return new Response(
      JSON.stringify({
        user_id: user.id,
        restaurant_id: userRestaurant.restaurant_id,
        role_id: userRestaurant.role_id,
        role_name: role?.name || null,
        is_system_role: role?.is_system_role || false,
        permissions,
        has_full_access: permissions.full_access === true
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in rbac-resolve-user:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
