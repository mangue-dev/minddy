import { describe, expect, it, vi, beforeEach } from "vitest";

type Meta = Record<string, unknown>;

function makeService({ meta }: { meta: Meta }) {
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
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { service };
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => h.service,
}));

import { updateAccountSettings } from "./account-settings";
import { ANALYTICS_CONSENT_META_KEY } from "@/lib/cookie-consent";

let h: { service: ReturnType<typeof makeService>["service"] };

function setup({ meta = {} as Meta } = {}) {
  const made = makeService({ meta });
  h = made;
  return made;
}

beforeEach(() => { setup(); });

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
    const meta: Meta = { automation_efforts: { xl: false } };
    setup({ meta });
    const r = await updateAccountSettings({
      userId: "user-1",
      input: { automation_start_delay_minutes: 10, automation_efforts: { s: false } },
    });
    expect(r).toEqual({ ok: false, error: "Project automations were replaced by routines. Configure a routine instead." });
    expect(meta.automation_start_delay_min).toBeUndefined();

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
});

describe("updateAccountSettings — palettes per mode (MIN-696)", () => {
  it("writes one mode's palette without touching the other or the mode", async () => {
    const meta: Meta = { theme: "system", theme_dark: "nord-dark" };
    setup({ meta });
    const r = await updateAccountSettings({ userId: "user-1", input: { theme_light: "solarized-light" } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings).toMatchObject({
        theme: "system",
        theme_light: "solarized-light",
        theme_dark: "nord-dark",
        theme_transparency: true,
      });
    }
  });

  it("refuses a palette of the other mode, or an unknown one", async () => {
    for (const input of [{ theme_light: "nord-dark" }, { theme_dark: "neon" }, { theme_transparency: "no" }]) {
      const r = await updateAccountSettings({ userId: "user-1", input });
      expect(r.ok, JSON.stringify(input)).toBe(false);
    }
  });

  it("null resets that mode to Minddy and the glass to its default", async () => {
    const meta: Meta = { theme_light: "nord-light", theme_dark: "nord-dark", theme_transparency: false };
    setup({ meta });
    const r = await updateAccountSettings({
      userId: "user-1",
      input: { theme_dark: null, theme_transparency: null },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings.theme_light).toBe("nord-light");
      expect(r.settings.theme_dark).toBe("minddy-dark");
      expect(r.settings.theme_transparency).toBe(true);
    }
    expect(meta).not.toHaveProperty("theme_dark");
  });
});
