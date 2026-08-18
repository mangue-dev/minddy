import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_PENDING_COOKIE, decodePendingOtp } from "@/lib/auth-otp-pending";
import { desktopAuthLinkFromCallback, parseDesktopAuthLink } from "@/lib/desktop/auth-link";

/**
 * MIN-297 — the reset link, from the email template to the screen.
 *
 * This route has the same shape as the i18n contract: each file is correct on
 * its own, and the bug exists only BETWEEN them. The template
 * (`supabase/email-templates/reset-password.html`, copied into the Supabase
 * dashboard) alone builds the button URL. It — not the client, whose query
 * additions cannot survive the GoTrue allowlist — sets `type=recovery` and
 * `next=/reset-password`. A typo there does not break compilation; it simply sends
 * people to `/home` with no password to change, or somewhere else entirely.
 *
 * So we read the REAL template, substitute what GoTrue substitutes, and pass the
 * resulting URL through the real routes.
 */

const verifyOtp = vi.fn(async () => ({
  data: { user: { id: "user-1", created_at: "", user_metadata: {} } },
  error: null as { message: string } | null,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { verifyOtp, exchangeCodeForSession: vi.fn() },
  }),
}));

const store = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      store.has(name) ? { name, value: store.get(name)! } : undefined,
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
  }),
}));

const arrivals: string[] = [];
vi.mock("@/lib/server/auth-arrival", async () => {
  const { NextResponse } = await import("next/server");
  return {
    completeAuthArrival: async (_user: unknown, channel: string) => {
      arrivals.push(channel);
    },
    buildAuthFailureRedirect: (origin: string, reason: string) =>
      NextResponse.redirect(`${origin}/login?reason=${reason}`),
  };
});

const { GET } = await import("@/app/auth/callback/route");
const { POST } = await import("@/app/auth/confirm/complete/route");

const ORIGIN = "https://www.minddy.app";
const TOKEN_HASH = "th_recovery_1";

const TEMPLATE = readFileSync(
  path.resolve(__dirname, "../../supabase/email-templates/reset-password.html"),
  "utf8",
);

/**
 * The URL of the link, as GoTrue sends it: the first `href` in the template, with
 * `{{ .RedirectTo }}` and `{{ .TokenHash }}` substituted as it substitutes them.
 * `RedirectTo` is the `redirectTo` validated by the allowlist, so it is the bare
 * `…/auth/callback` URL — exactly what `sendPasswordReset` sends.
 */
function linkFromTemplate(): string {
  const href = /href="(\{\{ \.RedirectTo \}\}[^"]*)"/.exec(TEMPLATE)?.[1];
  expect(href, "the template must contain a link built from {{ .RedirectTo }}").toBeTruthy();
  return href!
    .replace("{{ .RedirectTo }}", `${ORIGIN}/auth/callback`)
    .replace("{{ .TokenHash }}", TOKEN_HASH)
    .replace(/&amp;/g, "&");
}

function get(url: string): Promise<Response> {
  return GET(
    new NextRequest(url, { headers: { host: "www.minddy.app" } }),
  ) as unknown as Promise<Response>;
}

function pendingFrom(response: Response) {
  const raw = response.headers.get("set-cookie") ?? "";
  const value = /mdy_auth_pending=([^;]*)/.exec(raw)?.[1];
  return decodePendingOtp(value ? decodeURIComponent(value) : null);
}

beforeEach(() => {
  store.clear();
  arrivals.length = 0;
  verifyOtp.mockClear();
});

describe("the password-reset email template", () => {
  it("contains a TOKEN link, never `{{ .ConfirmationURL }}`", () => {
    // `{{ .ConfirmationURL }}` goes through `/auth/v1/verify`, which opens a
    // session on a plain GET — exactly what MIN-345 removed. Inspect the DOCUMENT,
    // not the comment header, which is allowed to mention it (and explains why it
    // is absent).
    const document = TEMPLATE.slice(TEMPLATE.indexOf("<!doctype html>"));
    expect(document).not.toContain("ConfirmationURL");
    expect(document).toContain("{{ .TokenHash }}");
  });

  it("sets `type=recovery` and leads to `/reset-password`", () => {
    const params = new URL(linkFromTemplate()).searchParams;
    expect(params.get("type")).toBe("recovery");
    expect(params.get("next")).toBe("/reset-password");
    expect(params.get("token_hash")).toBe(TOKEN_HASH);
  });

  it("points all links to the same place — the button and the plain-text fallback", () => {
    // The body has only one button: its text is selected by the account language
    // (`lib/auth-email-templates.test.ts`), not duplicated. The button and the
    // plain-text fallback remain, and only an overlooked link can point elsewhere.
    const hrefs = [...TEMPLATE.matchAll(/href="(\{\{ \.RedirectTo \}\}[^"]*)"/g)].map(
      (match) => match[1],
    );
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    expect(new Set(hrefs).size).toBe(1);
  });
});

describe("the received link through the real routes", () => {
  it("consumes nothing on GET and queues the token for /reset-password", async () => {
    const response = await get(linkFromTemplate());

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/confirm`);
    expect(pendingFrom(response)).toEqual({
      tokenHash: TOKEN_HASH,
      type: "recovery",
      next: "/reset-password",
    });
  });

  it("opens the session on POST and lands on the password screen", async () => {
    const pending = await get(linkFromTemplate());
    store.set(
      AUTH_PENDING_COOKIE,
      decodeURIComponent(
        /mdy_auth_pending=([^;]*)/.exec(pending.headers.get("set-cookie") ?? "")![1],
      ),
    );

    const response = (await POST(
      new NextRequest(`${ORIGIN}/auth/confirm/complete`, {
        method: "POST",
        headers: { host: "www.minddy.app", origin: ORIGIN },
      }),
    )) as unknown as Response;

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: TOKEN_HASH,
      type: "recovery",
    });
    expect(arrivals).toEqual(["otp"]);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/reset-password`);
  });

  it("hands control back to the desktop app without consuming anything, including the destination", async () => {
    // In the desktop flow, the link is marked `desktop=1`: the system browser must
    // not sign in on the app's behalf (MIN-291), and the destination must survive
    // the deep link — otherwise the app opens /home and the forgotten password
    // remains unchanged.
    const response = await get(`${linkFromTemplate()}&desktop=1`);
    expect(verifyOtp).not.toHaveBeenCalled();

    const deepLink = parseDesktopAuthLink(response.headers.get("location")!);
    expect(deepLink).toEqual({
      kind: "otp",
      tokenHash: TOKEN_HASH,
      type: "recovery",
      next: "/reset-password",
      turn: undefined,
    });
    // Assert the same result directly from the query, so a failure identifies
    // which half changed.
    expect(
      desktopAuthLinkFromCallback(new URL(`${linkFromTemplate()}&desktop=1`).searchParams),
    ).toMatchObject({ kind: "otp", type: "recovery", next: "/reset-password" });
  });
});
