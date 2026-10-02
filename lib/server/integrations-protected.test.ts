import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: { id: "integration-1", project_id: "project-1", kind: "issues",
    name: "Legacy name", webhook_url: null as string | null,
    webhook_url_protected: true },
  patches: [] as Array<Record<string, unknown>>,
  casValues: [] as Array<string | null>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/safe-fetch", () => ({
  assertPublicHttpUrl: async () => undefined,
}));
vi.mock("./integration-content", () => ({
  shouldProtectIntegrations: async () => false,
  encodeIntegrationField: async (_row: unknown, _field: string, value: string) =>
    `sealed:${value}`,
  decodeIntegrationField: async (_row: unknown, _field: string, value: string | null) =>
    value?.replace(/^sealed:/, "") ?? null,
  decodeIntegration: async (row: Record<string, unknown>) => ({ ...row,
    webhook_url: typeof row.webhook_url === "string"
      ? row.webhook_url.replace(/^sealed:/, "") : null }),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { ...state.row }, error: null }),
      }) }) }),
      update: (patch: Record<string, unknown>) => {
        state.patches.push(patch);
        const chain = {
          eq: (column: string, value: string) => {
            if (column === "webhook_url") state.casValues.push(value);
            return chain;
          },
          is: (column: string, value: null) => {
            if (column === "webhook_url") state.casValues.push(value);
            return chain;
          },
          select: async () => {
            state.row.webhook_url = patch.webhook_url as string | null;
            return { data: [{ ...state.row }], error: null };
          },
        };
        return chain;
      },
    }),
  }),
}));

const { updateIntegrationWebhook } = await import("./integrations");

describe("protected webhook during a flag pause", () => {
  it("seals a destination after disable and preserves the null CAS", async () => {
    state.patches.length = 0;
    state.casValues.length = 0;
    state.row.webhook_url = "sealed:https://old.example/hook";
    const input = (webhook_url: string | null) => ({ webhook_url,
      webhook_events: ["issue.created"], webhook_scope: "integration" });
    const disabled = await updateIntegrationWebhook({ projectId: "project-1",
      integrationId: "integration-1", input: input(null), actor: "human" });
    expect(disabled.ok).toBe(true);
    const enabled = await updateIntegrationWebhook({ projectId: "project-1",
      integrationId: "integration-1",
      input: input("https://new.example/hook"), actor: "human" });
    expect(enabled.ok).toBe(true);
    expect(state.casValues).toEqual([
      "sealed:https://old.example/hook", null,
    ]);
    expect(state.patches.at(-1)?.webhook_url)
      .toBe("sealed:https://new.example/hook");
  });
});
