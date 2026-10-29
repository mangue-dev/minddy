import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who hears about an instance variable change (MIN-847): the other
 * administrators in their inbox; the actor only by email, the alert a
 * hijacked session cannot clear.
 */

const h = vi.hoisted(() => ({ recipients: vi.fn(), insert: vi.fn(), configured: false }));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: `${id}@example.test`, user_metadata: {} } } }) } } }),
}));
vi.mock("@/lib/server/capabilities", () => ({ capability: () => ({ configured: h.configured }) }));
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: h.insert }));
vi.mock("@/lib/server/instance-variables", () => ({ instanceAdminRecipients: h.recipients }));

const { notifyInstanceConfigChange } = await import("./instance-variable-notify");

beforeEach(() => {
  vi.clearAllMocks();
  h.configured = false;
  h.insert.mockResolvedValue(undefined);
});

describe("notifyInstanceConfigChange", () => {
  it("puts the change in every other administrator's inbox, not the actor's", async () => {
    h.recipients.mockResolvedValue([
      { id: "admin-1", email: "ops@example.test" },
      { id: "admin-2", email: "lead@example.test" },
    ]);
    await notifyInstanceConfigChange("admin-1");
    const rows = h.insert.mock.calls[0][1] as Array<{ user_id: string; actor_id: string; type: string }>;
    expect(rows).toEqual([expect.objectContaining({ user_id: "admin-2", actor_id: "admin-1", type: "instance_config_changed" })]);
  });

  it("writes no inbox row when the actor is the only administrator", async () => {
    h.recipients.mockResolvedValue([{ id: "admin-1", email: "ops@example.test" }]);
    await notifyInstanceConfigChange("admin-1");
    expect(h.insert).not.toHaveBeenCalled();
  });
});
