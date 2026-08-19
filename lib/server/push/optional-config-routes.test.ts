import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ assertPublicHttpUrl: vi.fn() }));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: vi.fn(async () => ({
    ok: true,
    user: { id: "user-1" },
    supabase: {},
  })),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/server/safe-fetch", () => ({
  assertPublicHttpUrl: h.assertPublicHttpUrl,
}));

import { POST } from "@/app/api/account/push-subscriptions/route";
import { GET as getVapidKey } from "@/app/api/push/vapid/route";

beforeEach(() => {
  vi.unstubAllEnvs();
  h.assertPublicHttpUrl.mockReset();
});

describe("routes de configuration push optionnelle", () => {
  it("ne publie pas une clé issue d'une configuration Web Push partielle", async () => {
    vi.stubEnv("MINDDY_PUBLIC_VAPID_PUBLIC_KEY", "public-key");

    expect(await getVapidKey().json()).toEqual({ key: null });
  });

  it("publie la clé quand le transport complet est configuré", async () => {
    vi.stubEnv("MINDDY_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:push@example.test");

    expect(await getVapidKey().json()).toEqual({
      key: "public-key",
    });
  });

  it("refuse Web Push absent avant la résolution réseau de l'endpoint", async () => {
    const request = new NextRequest("http://localhost/api/account/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://push.example.test/subscription",
        keys: { p256dh: "p256dh", auth: "auth" },
        locale: "fr",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(h.assertPublicHttpUrl).not.toHaveBeenCalled();
  });
});
