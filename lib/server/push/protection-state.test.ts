import { describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => new Map<string, boolean>());
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: rows.get(table) ? { id: true } : null,
          error: null }),
      }) }),
    }),
  }),
}));

const { shouldProtectPush } = await import("./content");
const { shouldProtectInvitations } = await import(
  "@/lib/server/encryption/invitation-email");

describe("protection after a rollout flag pauses", () => {
  it("keeps push registration encrypted after the first protected write", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    vi.stubEnv("MINDDY_PUSH_CONTENT_ENCRYPTION_ENABLED", "false");
    rows.clear();
    rows.set("push_content_write_scope", true);
    try {
      expect(await shouldProtectPush()).toBe(true);
    } finally {
      rows.clear();
      vi.unstubAllEnvs();
    }
  });

  it("keeps invitation creation encrypted after the first protected write", async () => {
    vi.stubEnv("MINDDY_INVITATION_ENCRYPTION_ENABLED", "false");
    rows.clear();
    rows.set("invitation_email_scope", true);
    try {
      expect(await shouldProtectInvitations()).toBe(true);
    } finally {
      rows.clear();
      vi.unstubAllEnvs();
    }
  });
});
