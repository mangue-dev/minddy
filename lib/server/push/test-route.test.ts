import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  device: null as Record<string, unknown> | null,
  eq: vi.fn(),
  sendPushToUser: vi.fn(),
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: vi.fn(async () => ({
    ok: true,
    user: { id: "user-1" },
    supabase: {
      from: () => {
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            H.eq(column, value);
            return query;
          },
          maybeSingle: async () => ({ data: H.device, error: null }),
        };
        return query;
      },
    },
  })),
}));
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "fr"),
  getTranslations: vi.fn(async () => (key: string) => key),
  createTranslator: vi.fn(() => (key: string) => key),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ service: true }),
}));
vi.mock("@/lib/server/push/vapid", () => ({ isPushConfigured: () => true }));
vi.mock("@/lib/server/push/apns", () => ({ isApnsConfigured: () => true }));
vi.mock("@/lib/server/push/wns", () => ({ isWnsConfigured: () => true }));
vi.mock("@/lib/server/push/send", () => ({ sendPushToUser: H.sendPushToUser }));

const { POST } = await import("@/app/api/account/push-subscriptions/test/route");

function request(body: unknown): Request {
  return new Request("http://localhost/api/account/push-subscriptions/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  H.device = {
    id: "device-1",
    endpoint: "https://push.example/subscriptions/server-owned",
    transport: "web",
    locale: "en",
    enabled: true,
  };
  H.eq.mockReset();
  H.sendPushToUser.mockReset();
  H.sendPushToUser.mockResolvedValue({ sent: 1, gone: 0, failed: 0 });
});

describe("POST /api/account/push-subscriptions/test", () => {
  it("selects by device id and delivers the server-owned subscription", async () => {
    const response = await POST(request({ deviceId: "device-1" }) as never);

    expect(response.status).toBe(200);
    expect(H.eq).toHaveBeenCalledWith("id", "device-1");
    expect(H.sendPushToUser).toHaveBeenCalledWith(
      { service: true },
      "user-1",
      {
        title: "minddy",
        body: "Les notifications fonctionnent sur cet appareil.",
        lang: "fr-FR",
        url: "/inbox",
        tag: "minddy-test",
      },
      { onlyDeviceId: "device-1" },
    );
  });

  it("does not accept an endpoint supplied by the client", async () => {
    const response = await POST(
      request({ endpoint: "https://attacker.example/subscription" }) as never,
    );

    expect(response.status).toBe(400);
    expect(H.eq).not.toHaveBeenCalled();
    expect(H.sendPushToUser).not.toHaveBeenCalled();
  });
});
