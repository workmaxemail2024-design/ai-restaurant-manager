import { describe, it, expect } from "bun:test";
import { summarisePOSStatus } from "../src/lib/posStatusSummary";

const base = { pos_provider: "captiva", status: "active", credentialsComplete: true };

describe("summarisePOSStatus", () => {
  it("no integration means XLS only, never live", () => {
    expect(summarisePOSStatus(null).method).toBe("Manual Captiva XLS import");
  });
  it("failed test is a warning and recommends XLS", () => {
    const s = summarisePOSStatus({ ...base, last_test_status: "failed" });
    expect(s.tone).toBe("warn");
    expect(s.live).toContain("XLS");
  });
  it("missing credentials is not live", () => {
    expect(summarisePOSStatus({ ...base, credentialsComplete: false, last_test_status: "success" }).tone).toBe("warn");
  });
  it("working API still says data needs Apply", () => {
    const s = summarisePOSStatus({ ...base, last_test_status: "success", last_sync_time: "2026-11-18T00:00:00Z" });
    expect(s.tone).toBe("ok");
    expect(s.live).toContain("Apply");
  });
});
