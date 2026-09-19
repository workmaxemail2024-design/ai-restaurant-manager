import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No authorization header' }, 401);

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) return json({ error: 'Not authenticated' }, 401);

    // Only members who can administer settings may invite people.
    const { data: allowed, error: permError } = await caller.rpc('user_has_permission', {
      p_resource: 'settings',
      p_action: 'admin',
    });
    if (permError) return json({ error: permError.message }, 400);
    if (allowed !== true) return json({ error: 'Not allowed to invite users' }, 403);

    const { email, redirectTo } = await req.json();
    if (!email || typeof email !== 'string') return json({ error: 'Email is required' }, 400);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email.trim().toLowerCase(),
      redirectTo ? { redirectTo } : undefined,
    );

    if (inviteError) {
      // Someone with an account already exists: the pending invite still applies on next sign-in.
      const message = inviteError.message || 'Could not send the invitation email';
      const alreadyRegistered = /already been registered|already exists/i.test(message);
      return json({ emailSent: false, alreadyRegistered, message }, alreadyRegistered ? 200 : 400);
    }

    return json({ emailSent: true });
  } catch (error) {
    console.error('invite-user error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
