/**
 * Read-only Captiva Cloud Journals API smoke test.
 *
 * Run locally with Node.js 18+ (never commit real credentials):
 *   CAPTIVA_API_USERID=... CAPTIVA_API_PASS=... node scripts/captiva-journals-readonly.mjs
 *
 * Optional: CAPTIVA_STORE_ID=02137 CAPTIVA_DATE=2026-06-07
 *
 * Requests follow Captiva Cloud Journal API (JSON) v1.2, pp. 3-10.
 * This script never writes to Captiva, Supabase, or local files.
 * It does not download raw journals or print customer/transaction records.
 */
const endpoint = "https://mycaptivaserver001.azurewebsites.net/CaptivaCloudAPIRequest.ashx";
const userId = process.env.CAPTIVA_API_USERID;
const password = process.env.CAPTIVA_API_PASS;
const storeId = process.env.CAPTIVA_STORE_ID || "02137";
const date = process.env.CAPTIVA_DATE || "2026-06-07";

if (!userId || !password) {
  console.error("Missing CAPTIVA_API_USERID and/or CAPTIVA_API_PASS environment variables.");
  process.exitCode = 2;
} else if (!/^\d{5}$/.test(storeId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("Expected a five-digit store ID and ISO date YYYY-MM-DD.");
  process.exitCode = 2;
} else {
  const months = ["jan", "feb", "mar", "apr", "may", "jun",
                  "jul", "aug", "sep", "oct", "nov", "dec"];
  const [year, month, day] = date.split("-").map(Number);
  const formattedDate = `${String(day).padStart(2, "0")}/${months[month - 1]}/${year}`;
  const call = async (apiRequest, extras = {}) => {
    const request = {
      api_userid: userId,
      api_pass: password,
      api_request: apiRequest,
      stores: apiRequest === "get_api_stores" ? [] : [{ id: storeId }],
      ...extras,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok || !payload || typeof payload !== "object") {
        throw new Error(`HTTP ${response.status} or invalid JSON response`);
      }
      const status = String(payload.result || "").toLowerCase();
      if (status === "error" || status === "fail") {
        const code = String(payload.resultcode ?? "");
        const description = String(payload.resultdesc ?? "Request rejected").slice(0, 160);
        throw new Error(`Captiva ${code}: ${description}`);
      }
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    console.log("Testing Captiva Cloud Journals API — read-only");
    const stores = await call("get_api_stores");
    const authorised = Array.isArray(stores.stores) ? stores.stores : [];
    console.log("Authorised store IDs:", authorised.map(s => String(s.storeid ?? s.id ?? "")).filter(Boolean).join(", ") || "(none returned)");
    if (!authorised.some(s => String(s.storeid ?? s.id ?? "") === storeId)) {
      throw new Error("Requested store not listed for this API account.");
    }

    const dashboard = await call("get_api_stores_dashboard", {
      start_date: formattedDate,
      end_date: formattedDate,
    });
    const store = (Array.isArray(dashboard.stores) ? dashboard.stores : [])
      .find(s => String(s.storeid ?? s.id ?? "") === storeId);
    const daily = (Array.isArray(store?.dashboards) ? store.dashboards : [])
      .find(d => typeof d.dashdate === "string");
    const kpis = daily?.report?.kpis;
    console.log("Dashboard available:", Boolean(daily));
    console.log("Journal date:", String(daily?.journal_date ?? daily?.dashdate ?? "unknown"));
    console.log("KPI field names:", kpis && typeof kpis === "object"
      ? Object.keys(kpis).join(", ")
      : "(none found)");
    if (kpis && typeof kpis === "object") {
      for (const key of ["gross_all_sales", "total_all_net_sales", "total_all_vat",
                         "total_all_std_orders", "total_all_visitors"]) {
        console.log(`${key}: ${String(kpis[key] ?? "(missing)")}`);
      }
    }
    console.log("No transactions or sales were staged/applied.");
  } catch (error) {
    console.error("Read-only test failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  }
}
