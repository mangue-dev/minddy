import { describe, expect, it, vi, beforeEach } from "vitest";

type Meta = Record<string, unknown>;

function makeService({ meta, agentRow }: { meta: Meta; agentRow: Meta }) {
  const service = {
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { id: "user-1", email: "u@example.test", user_metadata: meta } },
          error: null,
        }),
        updateUserById: async (_id: string, patch: { user_metadata: Meta }) => {
          // Mirror GoTrue's merge semantics INCLUDING deletions: keys absent
          // from the patch disappear, so a cleared consent reads back null.
          for (const key of Object.keys(meta)) {
            if (!(key in patch.user_metadata)) delete meta[key];
          }
          Object.assign(meta, patch.user_metadata);
          return { error: null };
        },
      },
    },
    from: (table: string) => {
      if (table !== "user_agent_preferences") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: agentRow, error: null }),
          }),
        }),
        upsert: async (row: Record<string, unknown>) => {
          Object.assign(agentRow, row);
          return { error: null };
        },
      };
    },
  };
  return { service };
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => h.service,
}));

import { updateAccountSettings } from "./account-settings";
import {
  AUTOMATION_EFFORTS_META_KEY,
  AUTOMATION_START_DELAY_META_KEY,
} from "@/lib/automations";
import { ANALYTICS_CONSENT_META_KEY } from "@/lib/cookie-consent";

let h: { service: ReturnType<typeof makeService>["service"] };

function setup({ meta = {} as Meta, agentRow = {} as Meta } = {}) {
  const made = makeService({ meta, agentRow });
  h = made;
  return made;
}

beforeEach(() => setup());

describe("updateAccountSettings — the settings Numo could not reach before", () => {
  it("writes the keyboard send shortcut", async () => {
    const r = await updateAccountSettings({ userId: "user-1", input: { send_shortcut: "enter" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.settings.send_shortcut).toBe("enter");
  });

  it("refuses an unknown send shortcut", async () => {
    const r = await updateAccountSettings({ userId: "user-1", input: { send_shortcut: "ctrl-s" } });
    expect(r.ok).toBe(false);
  });

  it("writes the automation start delay and per-effort switches", async () => {
    const meta: Meta = { [AUTOMATION_EFFORTS_META_KEY]: { xl: false } };
    setup({ meta });
    const r = await updateAccountSettings({
      userId: "user-1",
      input: { automation_start_delay_minutes: 10, automation_efforts: { s: false } },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(meta[AUTOMATION_START_DELAY_META_KEY]).toBe(10);
    // The partial patch merges over the CURRENT value: the xl the user had
    // disabled earlier must stay disabled, not fall back to the default.
    expect(r.settings.automation_efforts).toEqual({
      xs: true, s: false, m: true, l: true, xl: false,
    });
  });

  it("refuses a bad start delay and an unknown effort", async () => {
    expect(
      (await updateAccountSettings({ userId: "user-1", input: { automation_start_delay_minutes: 121 } })).ok
    ).toBe(false);
    expect(
      (await updateAccountSettings({ userId: "user-1", input: { automation_start_delay_minutes: -1 } })).ok
    ).toBe(false);
    expect(
      (await updateAccountSettings({ userId: "user-1", input: { automation_efforts: { huge: false } } })).ok
    ).toBe(false);
    expect(
      (await updateAccountSettings({ userId: "user-1", input: { automation_efforts: { xs: "no" } } })).ok
    ).toBe(false);
  });

  it("writes and clears the analytics consent", async () => {
    const meta: Meta = { [ANALYTICS_CONSENT_META_KEY]: "declined" };
    setup({ meta });
    const accepted = await updateAccountSettings({ userId: "user-1", input: { analytics_consent: "accepted" } });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.settings.analytics_consent).toBe("accepted");

    const cleared = await updateAccountSettings({ userId: "user-1", input: { analytics_consent: null } });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.settings.analytics_consent).toBeNull();
    expect(meta[ANALYTICS_CONSENT_META_KEY]).toBeUndefined();
  });

  it("writes the sandbox region and size into user_agent_preferences", async () => {
    const r = await updateAccountSettings({
      userId: "user-1",
      input: { sandbox_region: "us", sandbox_size: "performance" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings.agent.sandbox_region).toBe("us");
      expect(r.settings.agent.sandbox_size).toBe("performance");
    }
  });

  it("refuses a bad sandbox value without touching the row", async () => {
    const before = JSON.stringify(h);
    expect(
      (await updateAccountSettings({ userId: "user-1", input: { sandbox_region: "mars" } })).ok
    ).toBe(false);
    expect(
      (await updateAccountSettings({ userId: "user-1", input: { sandbox_size: "gigantic" } })).ok
    ).toBe(false);
    expect(JSON.stringify(h)).toBe(before);
  });

  it("reads the sandbox defaults when the account has no preferences row", async () => {
    const r = await updateAccountSettings({ userId: "user-1", input: { send_shortcut: "enter" } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings.agent.sandbox_region).toBe("eu");
      expect(r.settings.agent.sandbox_size).toBe("standard");
    }
  });

  it("keeps the code-worker model boundary", async () => {
    const r = await updateAccountSettings({ userId: "user-1", input: { default_model: "gpt-x" } });
    expect(r.ok).toBe(false);
  });
});
