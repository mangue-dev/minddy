import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ throws: false, encrypted: false, avatarFails: false }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: () => {
  if (fixture.throws) throw new Error("PRIVATE_INVITATION_TRANSPORT_SENTINEL");
  const query: Record<string, unknown> = {};
  for (const method of ["select", "update", "eq", "is", "gt", "limit"]) query[method] = () => query;
  query.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: { message: "PRIVATE_INVITATION_SQL_SENTINEL" } });
  return query;
} }) }));
vi.mock("./encryption/invitation-email", () => ({
  isInvitationEncryptionConfigured: () => fixture.encrypted,
  invitationEmailIndex: async () => { throw new Error("PRIVATE_INVITATION_INDEX_SENTINEL"); },
}));
vi.mock("./avatar-seeds", () => ({
  claimPendingAvatar: async () => { if (fixture.avatarFails) throw new Error("PRIVATE_AVATAR_UPLOAD_TOKEN_SENTINEL"); },
  claimAvatarSeed: async () => {}, clearAvatarUploadToken: async () => {},
}));
vi.mock("./posthog", () => ({ captureServerEvent: vi.fn(), identifyServerUser: vi.fn() }));
const { completeAuthArrival, claimInvitations, claimAvatarChoice } = await import("./auth-arrival");
const { claimPendingInvitationsLate } = await import("./members");
const user: User = { id: "synthetic-user", aud: "authenticated", created_at: "2026-01-01", email: "synthetic@fixture.invalid", email_confirmed_at: "2026-01-01", user_metadata: { avatar_upload_token: "opaque-token" }, app_metadata: {} };
beforeEach(() => { fixture.throws = false; fixture.encrypted = false; fixture.avatarFails = false; vi.stubEnv("NODE_ENV", "production"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const logs = () => vi.spyOn(console, "error").mockImplementation(() => {});
const output = (log: ReturnType<typeof logs>) => log.mock.calls.flat().map(String).join("\n");
it("does not copy avatar-upload failures or invitation SQL failures into arrival logs", async () => {
  const log = logs(); fixture.avatarFails = true;
  await completeAuthArrival(user, "otp");
  expect(log).toHaveBeenCalled(); expect(output(log)).not.toContain("PRIVATE_");
});
it("does not copy thrown invitation transport errors into arrival logs", async () => {
  const log = logs(); fixture.throws = true;
  await claimInvitations(user);
  expect(log).toHaveBeenCalled(); expect(output(log)).not.toContain("PRIVATE_");
});
it("does not copy invitation-index failures into normal or late arrival logs", async () => {
  const log = logs(); fixture.encrypted = true;
  await claimInvitations(user); await claimPendingInvitationsLate(user);
  expect(log).toHaveBeenCalled(); expect(output(log)).not.toContain("PRIVATE_");
});
it("does not copy an avatar exception from the real claim entrypoint", async () => {
  const log = logs(); fixture.avatarFails = true;
  await claimAvatarChoice(user);
  expect(log).toHaveBeenCalled(); expect(output(log)).not.toContain("PRIVATE_");
});
