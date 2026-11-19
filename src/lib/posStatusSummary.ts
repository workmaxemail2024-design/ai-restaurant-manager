// Plain-language per-location POS status for the POS Integrations page.
// Read-only: derives labels from existing integration fields; never treats
// staged/synced API data as applied sales.
export interface POSStatusInput {
  pos_provider: string;
  status: string | null;
  last_test_status?: string | null;
  last_sync_time?: string | null;
  credentialsComplete: boolean;
}

export type POSTone = "ok" | "warn" | "idle";

export interface POSStatusSummary {
  method: string;
  live: string;
  nextAction: string;
  tone: POSTone;
}

export function summarisePOSStatus(i: POSStatusInput | null): POSStatusSummary {
  if (!i) {
    return {
      method: "Manual Captiva XLS import",
      live: "No automatic connection. Sales appear only after you import an XLS file.",
      nextAction: "Import yesterday's Captiva XLS.",
      tone: "idle",
    };
  }
  if (i.pos_provider !== "captiva") {
    return {
      method: i.pos_provider,
      live: i.status === "active" ? "Connection switched on." : "Connection switched off.",
      nextAction: i.status === "active" ? "Run a connection test." : "Switch the connection on, or remove it.",
      tone: i.status === "active" ? "ok" : "idle",
    };
  }
  if (!i.credentialsComplete) {
    return {
      method: "Captiva API (setup incomplete) + XLS import",
      live: "API not live. Use the XLS import for sales.",
      nextAction: "Add the missing Captiva API details, or keep using XLS import.",
      tone: "warn",
    };
  }
  if (i.status !== "active") {
    return {
      method: "Captiva API (switched off) + XLS import",
      live: "API not live. Use the XLS import for sales.",
      nextAction: "Keep using XLS import, or switch the API on and test it.",
      tone: "idle",
    };
  }
  if (i.last_test_status !== "success") {
    return {
      method: "Captiva API (not working yet) + XLS import",
      live: i.last_test_status === "failed"
        ? "Last API test failed. Use the XLS import for sales."
        : "API not tested yet. Use the XLS import for sales.",
      nextAction: "Test the connection. Until it passes, import the XLS file.",
      tone: "warn",
    };
  }
  return {
    method: "Captiva API + XLS import",
    live: i.last_sync_time
      ? "API connected. Fetched data counts as sales only after you Apply it."
      : "API connected but never fetched. Nothing has been applied from it.",
    nextAction: "Fetch sales, then review and Apply them.",
    tone: "ok",
  };
}
