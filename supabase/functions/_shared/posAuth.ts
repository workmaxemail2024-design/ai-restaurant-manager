// Shared authorization helpers for POS / ingest edge functions.
// Never trust restaurant_id / location_id from a request body: always resolve
// the tenant from the database and verify the caller's membership.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Caller =
  | { kind: "service" }
  | { kind: "cron" }
  | { kind: "user"; userId: string }
  | { kind: "none"; reason: string };

const serviceRoleKey = () =>
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";

/** Resolve who is calling: internal service-role, cron secret, or a signed-in user. */
export async function resolveCaller(req: Request): Promise<Caller> {
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const providedCron = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret && providedCron && providedCron === cronSecret) {
    return { kind: "cron" };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { kind: "none", reason: "Missing authorization header" };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const srk = serviceRoleKey();
  if (srk && token === srk) {
    return { kind: "service" };
  }

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await anonClient.auth.getClaims(token);
  const userId = data?.claims?.sub as string | undefined;
  if (error || !userId) {
    return { kind: "none", reason: "Unauthorized" };
  }
  return { kind: "user", userId };
}

/** True when the caller is an internal (service-role / cron) invocation. */
export function isInternal(caller: Caller): boolean {
  return caller.kind === "service" || caller.kind === "cron";
}

/** Verify a signed-in user belongs to the restaurant (optionally with a permission). */
export async function userBelongsToRestaurant(
  adminClient: SupabaseClient,
  userId: string,
  restaurantId: string,
): Promise<boolean> {
  if (!restaurantId) return false;
  const { data, error } = await adminClient
    .from("user_restaurants")
    .select("id, role_id, roles(permissions)")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .limit(1);
  if (error) {
    console.error("membership lookup failed:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Verify membership AND a resource/action permission from the user's role. */
export async function userHasPermission(
  adminClient: SupabaseClient,
  userId: string,
  restaurantId: string,
  resource: string,
  action: "view" | "edit" | "admin",
): Promise<boolean> {
  const { data, error } = await adminClient
    .from("user_restaurants")
    .select("id, roles(permissions)")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;

  const perms = ((data as Record<string, unknown>).roles as { permissions?: Record<string, unknown> } | null)
    ?.permissions ?? {};
  if (perms.full_access === true) return true;

  const res = perms[resource] as Record<string, boolean> | undefined;
  if (!res) return false;
  if (action === "view") return !!(res.view || res.edit || res.admin);
  if (action === "edit") return !!(res.edit || res.admin);
  return !!res.admin;
}

export function unauthorized(message: string, headers: Record<string, string>, status = 401): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
