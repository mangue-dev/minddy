import { generateKeyPairSync } from "node:crypto";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Records each HTTP/2 connection's origin and request headers, and answers 200.
const H = vi.hoisted(() => ({ calls: [] as Array<{ origin: string; headers: Record<string, string> }> }));
vi.mock("node:http2", () => ({
  connect: (origin: string) => {
    const client = Object.assign(new EventEmitter(), { destroy: () => {} });
    return Object.assign(client, {
      request: (headers: Record<string, string>) => {
        H.calls.push({ origin, headers });
        const request = Object.assign(new EventEmitter(), {
          setEncoding: () => {},
          setTimeout: () => {},
          end: () => {
            queueMicrotask(() => {
              request.emit("response", { ":status": 200 });
              request.emit("end");
            });
          },
        });
        return request;
      },
    });
  },
}));

const { apnsProviderToken, isApnsConfigured, sendApnsNotification } = await import("./apns");

const PAYLOAD = { title: "minddy", body: "Hello", url: "/projects/min-3f2a9c81", tag: "t", lang: "en" };
const TOKEN = `apns:${"ab".repeat(32)}`;

function configure(bundle = "com.example.minddy") {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  vi.stubEnv("APNS_TEAM_ID", "TEAM123456");
  vi.stubEnv("APNS_KEY_ID", "KEY1234567");
  vi.stubEnv("APNS_BUNDLE_ID", bundle);
  vi.stubEnv("APNS_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
}

beforeEach(() => {
  vi.unstubAllEnvs();
  H.calls.length = 0;
});

describe("configuration APNs", () => {
  it("reste éteinte sans sa configuration complète", () => {
    expect(isApnsConfigured()).toBe(false);
    expect(apnsProviderToken()).toBeNull();
  });

  it("fabrique un JWT ES256 portant le team id et le key id", () => {
    configure();
    const token = apnsProviderToken(1_800_000_000_000)!;
    const [header, claims, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KEY1234567",
    });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: "TEAM123456",
      iat: 1_800_000_000,
    });
    expect(Buffer.from(signature, "base64url")).toHaveLength(64);
  });
});

describe("APNs target (MIN-907)", () => {
  it("keeps a token without a recorded target on the macOS app in production", async () => {
    configure("app.minddy.desktop");
    expect(await sendApnsNotification(TOKEN, PAYLOAD)).toEqual({ status: 200, reason: null });
    expect(H.calls).toHaveLength(1);
    expect(H.calls[0].origin).toBe("https://api.push.apple.com");
    expect(H.calls[0].headers).toMatchObject({
      ":path": `/3/device/${"ab".repeat(32)}`,
      "apns-topic": "app.minddy.desktop",
    });
  });

  it("sends an iOS development token to the sandbox with the iOS app's topic", async () => {
    configure("app.minddy.desktop");
    await sendApnsNotification(TOKEN, PAYLOAD, { platform: "ios", environment: "sandbox" });
    expect(H.calls[0].origin).toBe("https://api.sandbox.push.apple.com");
    expect(H.calls[0].headers["apns-topic"]).toBe("app.minddy.ios");
  });

  it("sends an iOS store token to production, under APNS_IOS_BUNDLE_ID when set", async () => {
    configure("app.minddy.desktop");
    vi.stubEnv("APNS_IOS_BUNDLE_ID", "com.example.ios");
    await sendApnsNotification(TOKEN, PAYLOAD, { platform: "ios", environment: "production" });
    expect(H.calls[0].origin).toBe("https://api.push.apple.com");
    expect(H.calls[0].headers["apns-topic"]).toBe("com.example.ios");
  });

  it("signs both gateways with the same team key", async () => {
    configure();
    await sendApnsNotification(TOKEN, PAYLOAD, { platform: "macos", environment: "sandbox" });
    await sendApnsNotification(TOKEN, PAYLOAD, { platform: "ios", environment: "production" });
    expect(H.calls.map((call) => call.origin)).toEqual([
      "https://api.sandbox.push.apple.com",
      "https://api.push.apple.com",
    ]);
    expect(H.calls[0].headers.authorization).toBe(H.calls[1].headers.authorization);
  });
});
