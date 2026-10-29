import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * `/api/admin/instance-variables` (MIN-847): the live admin check on every
 * call, a recent second factor for secrets and administrator addresses, and
 * an inbox fan-out after each change.
 */

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  admin: vi.fn(),
  set: vi.fn(),
  clear: vi.fn(),
  rollback: vi.fn(),
  list: vi.fn(),
  status: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: h.auth }));
vi.mock("@/lib/server/admin", () => ({ isAdminUser: h.admin }));
vi.mock("@/lib/server/instance-variables", () => ({
  setInstanceVariable: h.set,
  clearInstanceVariable: h.clear,
  rollbackInstanceVariable: h.rollback,
  listInstanceVariables: h.list,
  instanceOverridesStatus: h.status,
}));
vi.mock("@/lib/server/instance-variable-notify", () => ({ notifyInstanceConfigChange: h.notify }));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: (run: () => Promise<void>) => void run() }));

const { GET, PATCH, DELETE } = await import("@/app/api/admin/instance-variables/route");

const now = Math.floor(Date.now() / 1000);
const freshClaims = { aal: "aal2", amr: [{ method: "totp", timestamp: now - 60 }] };
const staleClaims = { aal: "aal2", amr: [{ method: "totp", timestamp: now - 3600 }] };
const user = { id: "admin-1", email: "ops@example.test", app_metadata: {} };
const patch = (body: unknown) =>
  PATCH(new NextRequest("http://localhost/api/admin/instance-variables", { method: "PATCH", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ ok: true, user, claims: freshClaims });
  h.admin.mockResolvedValue(true);
  h.status.mockReturnValue("enabled");
  h.list.mockResolvedValue([]);
  h.set.mockResolvedValue({ ok: true, key: "MINDDY_PUBLIC_SITE_NAME" });
  h.clear.mockResolvedValue({ ok: true, key: "OPENROUTER_API_KEY" });
  h.notify.mockResolvedValue(undefined);
});

describe("instance variables route", () => {
  it("tells nobody about a save that changed nothing", async () => {
    h.set.mockResolvedValue({ ok: true, key: "MINDDY_PUBLIC_SITE_NAME", unchanged: true });
    const response = await patch({ key: "MINDDY_PUBLIC_SITE_NAME", value: "Acme" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ unchanged: true });
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("forbids a non-admin before reading anything", async () => {
    h.admin.mockResolvedValue(false);
    expect((await GET(new NextRequest("http://localhost/api/admin/instance-variables"))).status).toBe(403);
    expect((await patch({ key: "MINDDY_PUBLIC_SITE_NAME", value: "x" })).status).toBe(403);
    expect(h.list).not.toHaveBeenCalled();
    expect(h.set).not.toHaveBeenCalled();
  });

  it("lists nothing where the layer is off", async () => {
    h.status.mockReturnValue("cloud");
    const response = await GET(new NextRequest("http://localhost/api/admin/instance-variables"));
    expect(await response.json()).toEqual({ status: "cloud", variables: [] });
    expect(h.list).not.toHaveBeenCalled();
  });

  it("asks for a recent second factor before writing a secret", async () => {
    h.auth.mockResolvedValue({ ok: true, user, claims: staleClaims });
    const response = await patch({ key: "OPENROUTER_API_KEY", value: "sk-or-new" });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "reauth_required" });
    expect(h.set).not.toHaveBeenCalled();
    const removal = await DELETE(new NextRequest("http://localhost/api/admin/instance-variables?key=ADMIN_EMAILS", { method: "DELETE" }));
    expect(removal.status).toBe(403);
    expect(h.clear).not.toHaveBeenCalled();
  });

  it("writes a plain setting without asking again, and tells the administrators", async () => {
    h.auth.mockResolvedValue({ ok: true, user, claims: staleClaims });
    const response = await patch({ key: "MINDDY_PUBLIC_SITE_NAME", value: "Acme" });
    expect(response.status).toBe(200);
    expect(h.set).toHaveBeenCalledWith("MINDDY_PUBLIC_SITE_NAME", "Acme", { id: "admin-1", email: "ops@example.test", appMetadata: {} });
    expect(h.notify).toHaveBeenCalledWith("admin-1", undefined);
  });

  it("relays a refusal and tells nobody", async () => {
    h.set.mockResolvedValue({ ok: false, status: 409, reason: "cannot_remove_self" });
    const response = await patch({ key: "ADMIN_EMAILS", value: "other@example.test" });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "cannot_remove_self" });
    expect(h.notify).not.toHaveBeenCalled();
  });
});
