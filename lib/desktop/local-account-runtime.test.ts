import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `desktop/src/local-account.ts` against a fake GoTrue: the admin calls that
 * create or recover the owner, the keychain round trip, and the password grant.
 */
const dirs = vi.hoisted(() => ({ userData: "" }));
// Only the asynchronous keychain API exists here: Electron 46 removes the
// synchronous methods, so a call to one of them fails the suite.
const keychain = vi.hoisted(() => ({ available: true, rotated: false, prefix: "enc:" }));
vi.mock("../../desktop/node_modules/electron", () => ({
  app: { getPath: () => dirs.userData },
  safeStorage: {
    isAsyncEncryptionAvailable: async () => keychain.available,
    encryptStringAsync: async (value: string) => Buffer.from(`${keychain.prefix}${value}`),
    decryptStringAsync: async (value: Buffer) => ({
      result: value.toString().replace(/^(?:enc|v2):/, ""),
      shouldReEncrypt: keychain.rotated,
    }),
  },
}));

let server: Server;
let root: string;
let users: Array<{ id: string; email: string; password: string }>;
let calls: string[];

beforeEach(async () => {
  vi.resetModules();
  Object.assign(keychain, { available: true, rotated: false, prefix: "enc:" });
  users = [];
  calls = [];
  dirs.userData = mkdtempSync(path.join(tmpdir(), "minddy-account-"));
  root = mkdtempSync(path.join(tmpdir(), "minddy-clone-"));
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const json = body ? JSON.parse(body) : {};
      calls.push(`${request.method} ${request.url} ${request.headers.apikey}`);
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(value));
      };
      if (request.method === "POST" && request.url === "/auth/v1/admin/users") {
        if (users.some((user) => user.email === json.email)) return send(422, { msg: "already registered" });
        users.push({ id: `u${users.length + 1}`, email: json.email, password: json.password });
        return send(200, { id: users.at(-1)!.id });
      }
      if (request.method === "GET" && request.url?.startsWith("/auth/v1/admin/users")) return send(200, { users });
      if (request.method === "PUT" && request.url?.startsWith("/auth/v1/admin/users/")) {
        const user = users.find((entry) => request.url!.endsWith(entry.id));
        if (!user) return send(404, {});
        user.password = json.password;
        return send(200, { id: user.id });
      }
      if (request.method === "POST" && request.url === "/auth/v1/token?grant_type=password") {
        const user = users.find((entry) => entry.email === json.email && entry.password === json.password);
        return user ? send(200, { access_token: "access", refresh_token: "refresh" }) : send(400, { error: "invalid_grant" });
      }
      send(404, {});
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  writeFileSync(
    path.join(root, ".env.local"),
    `MINDDY_PUBLIC_SUPABASE_URL=http://127.0.0.1:${port}\nMINDDY_PUBLIC_SUPABASE_ANON_KEY=anon\nSUPABASE_SERVICE_ROLE_KEY=service\n`,
  );
});

afterEach(() => {
  server.close();
  rmSync(dirs.userData, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

describe("desktop local account runtime", () => {
  it("creates the owner with the service key, keeps the password encrypted, and signs in with the anon key", async () => {
    const { ensureLocalAccount, localAccountSession } = await import("../../desktop/src/local-account");
    await ensureLocalAccount(root);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("owner@local.minddy.app");
    const stored = JSON.parse(readFileSync(path.join(dirs.userData, "local-account.json"), "utf8"));
    expect(stored.password).not.toContain(users[0].password);
    await expect(localAccountSession(root)).resolves.toEqual({ access_token: "access", refresh_token: "refresh" });
    expect(calls[0]).toBe("POST /auth/v1/admin/users service");
    expect(calls.at(-1)).toBe("POST /auth/v1/token?grant_type=password anon");
  });

  it("finds the owner again after a reinstall and gives it a new password", async () => {
    users.push({ id: "kept", email: "owner@local.minddy.app", password: "old" });
    const { ensureLocalAccount, localAccountSession } = await import("../../desktop/src/local-account");
    await ensureLocalAccount(root);
    expect(users).toHaveLength(1);
    expect(users[0].password).not.toBe("old");
    await expect(localAccountSession(root)).resolves.not.toBeNull();
  });

  it("signs nothing in for another folder or without a managed account", async () => {
    const { ensureLocalAccount, localAccountSession } = await import("../../desktop/src/local-account");
    await expect(localAccountSession(root)).resolves.toBeNull();
    await ensureLocalAccount(root);
    await expect(localAccountSession(path.join(root, "elsewhere"))).resolves.toBeNull();
    await expect(localAccountSession(null)).resolves.toBeNull();
  });
  it("signs in with a password stored before the move to the asynchronous keychain", async () => {
    const { ensureLocalAccount, localAccountSession } = await import("../../desktop/src/local-account");
    await ensureLocalAccount(root);
    const file = path.join(dirs.userData, "local-account.json");
    const stored = JSON.parse(readFileSync(file, "utf8"));
    // encryptString() and encryptStringAsync() write the same base64 blob.
    writeFileSync(file, JSON.stringify({ ...stored, password: Buffer.from(`enc:${users[0].password}`).toString("base64") }));
    await expect(localAccountSession(root)).resolves.toEqual({ access_token: "access", refresh_token: "refresh" });
  });

  it("re-encrypts the stored password when the keychain rotated its key", async () => {
    const { ensureLocalAccount, localAccountSession } = await import("../../desktop/src/local-account");
    await ensureLocalAccount(root);
    const file = path.join(dirs.userData, "local-account.json");
    Object.assign(keychain, { rotated: true, prefix: "v2:" });
    await expect(localAccountSession(root)).resolves.not.toBeNull();
    const stored = JSON.parse(readFileSync(file, "utf8"));
    expect(Buffer.from(stored.password, "base64").toString()).toBe(`v2:${users[0].password}`);
  });

  it("refuses to create or sign in the account without a keychain", async () => {
    const { ensureLocalAccount, localAccountSession } = await import("../../desktop/src/local-account");
    await ensureLocalAccount(root);
    keychain.available = false;
    await expect(ensureLocalAccount(root)).rejects.toThrow("The system keychain is unavailable.");
    await expect(localAccountSession(root)).resolves.toBeNull();
  });
});
