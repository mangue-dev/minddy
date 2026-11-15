import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/csp-report/route";

function post(body: string, type = "application/reports+json") {
  return POST(new Request("https://www.minddy.app/api/csp-report", {
    method: "POST",
    headers: { "content-type": type },
    body,
  }));
}

afterEach(() => vi.restoreAllMocks());

describe("CSP report endpoint", () => {
  it("logs one compact line per violation of a Reporting API batch", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await post(JSON.stringify([
      { type: "csp-violation", body: { effectiveDirective: "require-trusted-types-for", blockedURL: "trusted-types-sink", documentURL: "https://www.minddy.app/home", sample: "Element innerHTML|<b>" } },
      { type: "deprecation", body: { id: "x" } },
    ]));
    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('directive="require-trusted-types-for" blocked="trusted-types-sink" page="https://www.minddy.app/home"');
  });

  it("reads the legacy report-uri format", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await post(
      JSON.stringify({ "csp-report": { "violated-directive": "script-src", "blocked-uri": "inline", "document-uri": "https://www.minddy.app/" } }),
      "application/csp-report",
    );
    expect(response.status).toBe(204);
    expect(warn.mock.calls[0][0]).toContain('directive="script-src" blocked="inline"');
  });

  it("keeps each report on one log line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await post(JSON.stringify([{ type: "csp-violation", body: { effectiveDirective: "script-src", blockedURL: "x\n[csp-report] forged", documentURL: "y\r\nz" } }]));
    expect(String(warn.mock.calls[0][0])).not.toMatch(/[\r\n]/);
  });

  it("bounds what it accepts and logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await post("{}", "text/plain")).status).toBe(415);
    expect((await post("x".repeat(17 * 1024))).status).toBe(413);
    expect((await post("{not json")).status).toBe(400);
    const many = Array.from({ length: 50 }, () => ({ type: "csp-violation", body: { effectiveDirective: "script-src", sample: "y".repeat(1000) } }));
    expect((await post(JSON.stringify(many).slice(0, 15 * 1024).replace(/,[^,]*$/, "]"))).status).toBeLessThan(500);
    expect(warn.mock.calls.length).toBeLessThanOrEqual(10);
    for (const [line] of warn.mock.calls) expect(String(line).length).toBeLessThan(1000);
  });
});
