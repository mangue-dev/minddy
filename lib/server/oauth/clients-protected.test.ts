import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

let stored: Record<string, unknown> | null = null;
const key = randomBytes(32);
const testStore = new EncryptedStore({
  current: async () => ({ version: 2, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => testStore,
}));
vi.mock("@/lib/server/encryption/content-config", () => ({
  isContentEncryptionEnabled: () => true,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      expect(table).toBe("oauth_clients");
      return {
        insert: (row: Record<string, unknown>) => {
          stored = { ...row, created_at: "2026-09-27T00:00:00Z" };
          return { select: () => ({ single: async () => ({
            data: { client_id: row.client_id, created_at: "2026-09-27T00:00:00Z" },
            error: null,
          }) }) };
        },
        select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: stored, error: null,
        }) }) }),
      };
    },
  }),
}));

const { getClient, registerClient } = await import("./clients");

afterEach(() => { vi.unstubAllEnvs(); stored = null; });

describe("protected OAuth client writer", () => {
  it("never persists a plaintext registration and reads it through the codec", async () => {
    vi.stubEnv("MINDDY_OAUTH_CLIENT_ENCRYPTION_ENABLED", "true");
    const client = await registerClient({ clientName: "Private desktop app",
      redirectUris: ["cursor://private.example/callback"],
      clientUri: "https://private.example", logoUri: null });
    expect(client).not.toBeNull();
    expect(stored).toMatchObject({ client_name: null, redirect_uris: null,
      logo_uri: null, client_uri: null, encryption_version: 2 });
    expect(JSON.stringify(stored)).not.toContain("Private desktop app");
    expect(JSON.stringify(stored)).not.toContain("private.example");
    expect(await getClient(client!.client_id)).toMatchObject({
      client_name: "Private desktop app",
      redirect_uris: ["cursor://private.example/callback"],
    });
  });
});
