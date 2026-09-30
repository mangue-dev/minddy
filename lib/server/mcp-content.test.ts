import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { EncryptedStore, type DataKeyProvider } from "./encryption/store";
import { encryptMcpToken } from "./mcp-credentials";
import { decodeMcpAttempt, decodeMcpConnection, mcpAttemptWrite,
  mcpConnectionWrite, mcpSecret, protectMcpAttempt,
  protectMcpConnection, type McpAttemptRow } from "./mcp-content";
import type { McpConnectionRow } from "./mcp-client";
import { mcpSettingsUpdate } from "./mcp-settings";

const mocks = vi.hoisted(() => ({ store: null as EncryptedStore | null,
  activated: true }));
vi.mock("./encryption/registry", () => ({ getEncryptedStore: () => mocks.store }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () =>
    ({ data: mocks.activated ? { id: true } : null, error: null }) }) }) }),
}) }));

const user = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const id = "33b8b032-d967-4f06-aabd-dc165e988335";
const raw: McpConnectionRow = {
  id, user_id: user, name: "Private tools", url: "https://private-mcp.example/mcp",
  enabled: true, created_at: "2026-09-26", transport: "http",
  auth_mode: "oauth", oauth_connected: false,
  token_encrypted: null, headers_encrypted: null, oauth_encrypted: null,
};

beforeEach(() => {
  vi.stubEnv("AI_KEY_ENCRYPTION_SECRET", "test-secret-with-at-least-thirty-two-characters");
  const keys = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
  const provider: DataKeyProvider = {
    current: async () => ({ version: 2, bytes: Buffer.from(keys.get(2)!) }),
    byVersion: async (_scope, version) => ({ version,
      bytes: Buffer.from(keys.get(version)!) }),
  };
  mocks.store = new EncryptedStore(provider);
  mocks.activated = true;
});
afterEach(() => vi.unstubAllEnvs());

describe("personal MCP content", () => {
  it("seals the endpoint, label and legacy environment-key secrets", async () => {
    const legacy = { ...raw,
      token_encrypted: encryptMcpToken("private-token"),
      headers_encrypted: encryptMcpToken('{"X-Private":"private-header"}'),
      oauth_encrypted: encryptMcpToken('{"tokens":{"access_token":"private-oauth"}}'),
      encryption_version: 0, encrypted_content: null };
    const protectedColumns = await protectMcpConnection(legacy);
    const stored = { ...legacy, ...protectedColumns } as McpConnectionRow;
    for (const column of ["name", "url", "token_encrypted",
      "headers_encrypted", "oauth_encrypted"] as const)
      expect(stored[column]).toBeNull();
    for (const marker of ["Private tools", "private-mcp.example",
      "private-token", "private-header", "private-oauth"])
      expect(JSON.stringify(stored)).not.toContain(marker);
    const opened = await decodeMcpConnection(stored);
    expect(opened.url).toBe(legacy.url);
    expect(opened.name).toBe(legacy.name);
    expect(mcpSecret(opened, "token_encrypted")).toBe("private-token");
    expect(mcpSecret(opened, "headers_encrypted")).toContain("private-header");
    expect(mcpSecret(opened, "oauth_encrypted")).toContain("private-oauth");
    await expect(decodeMcpConnection({ ...stored, user_id: crypto.randomUUID() }))
      .rejects.toThrow();
  });

  it("merges settings without reviving clear columns", async () => {
    const first = await mcpConnectionWrite(user, { ...raw,
      token_encrypted: encryptMcpToken("private-token") });
    const opened = await decodeMcpConnection(first as McpConnectionRow);
    const second = await mcpConnectionWrite(user, { name: "Renamed tools" }, opened);
    expect(second.name).toBeNull();
    expect(second.url).toBeNull();
    expect(second.token_encrypted).toBeNull();
    const decoded = await decodeMcpConnection({ ...opened, ...second } as McpConnectionRow);
    expect(decoded.name).toBe("Renamed tools");
    expect(mcpSecret(decoded, "token_encrypted")).toBe("private-token");
  });

  it("creates protected credentials without the legacy environment key", async () => {
    vi.stubEnv("AI_KEY_ENCRYPTION_SECRET", "");
    const values = mcpSettingsUpdate({ name: raw.name, url: raw.url,
      auth_mode: "oauth", oauth_client_id: "private-client",
      oauth_client_secret: "private-client-secret" }, undefined, true);
    const stored = await mcpConnectionWrite(user, values, undefined, true);
    expect(JSON.stringify(stored)).not.toContain("private-client-secret");
    const opened = await decodeMcpConnection(stored as McpConnectionRow);
    expect(mcpSecret(opened, "oauth_encrypted"))
      .toContain("private-client-secret");
  });

  it("seals the single-use OAuth attempt and recovers its payload", async () => {
    const attempt = { state: "a".repeat(64), user_id: user,
      connection_id: id, endpoint: raw.url,
      payload_encrypted: '{"verifier":"private-verifier"}' };
    const stored = await mcpAttemptWrite(attempt);
    expect(stored.endpoint).toBeNull();
    expect(stored.payload_encrypted).toBeNull();
    expect(JSON.stringify(stored)).not.toContain("private-verifier");
    expect(JSON.stringify(stored)).not.toContain("private-mcp.example");
    const opened = await decodeMcpAttempt(stored as typeof attempt);
    expect(opened.endpoint).toBe(raw.url);
    expect(opened.payload_encrypted).toContain("private-verifier");
    const legacy = { ...attempt,
      payload_encrypted: encryptMcpToken(attempt.payload_encrypted)!,
      encryption_version: 0, encrypted_content: null };
    const rotated = await protectMcpAttempt(legacy);
    expect((await decodeMcpAttempt({ ...legacy, ...rotated } as unknown as McpAttemptRow))
      .payload_encrypted).toBe(attempt.payload_encrypted);
  });
});
