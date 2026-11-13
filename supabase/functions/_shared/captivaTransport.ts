/**
 * Optional fixed-egress HTTP CONNECT proxy for Captiva's IP allowlist.
 *
 * Supabase Edge Functions do not have stable outbound IP addresses. When a
 * proxy is configured via server-side Supabase secrets, only the *Captiva*
 * fetches are sent through the proxy; database and other network traffic is
 * unaffected. Never expose credentials to the browser.
 *
 * Required together:
 *   CAPTIVA_PROXY_URL=http://proxy.example.net:3128
 *   CAPTIVA_PROXY_USERNAME=<username>
 *   CAPTIVA_PROXY_PASSWORD=<password>
 *
 * The proxy should have a dedicated static IPv4 that is added to Captiva's
 * Integrator IP Whitelist. Do not enable open or unauthenticated proxies.
 */
export function createCaptivaHttpClient(): Deno.HttpClient | undefined {
  const proxyUrl = Deno.env.get("CAPTIVA_PROXY_URL")?.trim();
  const username = Deno.env.get("CAPTIVA_PROXY_USERNAME")?.trim();
  const password = Deno.env.get("CAPTIVA_PROXY_PASSWORD");
  const configured = [!!proxyUrl, !!username, !!password];
  if (configured.every(v => !v)) return undefined;
  if (!configured.every(Boolean)) {
    throw new Error("Captiva proxy has incomplete server-side configuration");
  }
  const parsed = new URL(proxyUrl!);
  if (!["http:", "https:"].includes(parsed.protocol) ||
      !parsed.hostname || parsed.username || parsed.password ||
      parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Captiva proxy must be an HTTP(S) proxy origin without embedded credentials");
  }
  return Deno.createHttpClient({
    proxy: {
      url: parsed.origin,
      basicAuth: { username: username!, password: password! },
    },
  });
}
