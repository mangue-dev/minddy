import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const feedbackRoute = readFileSync(
  join(process.cwd(), "app/api/projects/[id]/feedback/domain/route.ts"),
  "utf8",
);
const shareRoute = readFileSync(
  join(process.cwd(), "app/api/views/[id]/share/domain/route.ts"),
  "utf8",
);

describe("custom-domain provider routes", () => {
  it("passes the authenticated actor into every refresh and removal", () => {
    expect(feedbackRoute).toContain("refreshDomainStatus(row, guard.userId)");
    expect(feedbackRoute).toContain("removeDomain(row, guard.userId)");
    expect(shareRoute).toContain("refreshDomainStatus(row, auth.user.id)");
    expect(shareRoute).toContain("removeDomain(row, auth.user.id, {");
    expect(shareRoute).toContain("resourceKey: `view:${id}`");
  });

  it("uses the shared database guard instead of the process-local limiter", () => {
    expect(feedbackRoute).not.toContain("checkSessionRateLimit");
    expect(shareRoute).not.toContain("checkSessionRateLimit");
    for (const source of [feedbackRoute, shareRoute]) {
      expect(source).toContain('status: 429, headers: { "Retry-After"');
      expect(source).toContain('refusal.error === "provider_unavailable"');
    }
  });
});
