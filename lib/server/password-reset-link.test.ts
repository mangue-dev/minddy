import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_PENDING_COOKIE, decodePendingOtp } from "@/lib/auth-otp-pending";
import { desktopAuthLinkFromCallback, parseDesktopAuthLink } from "@/lib/desktop/auth-link";

/**
 * MIN-297 — le lien de réinitialisation, du gabarit d'e-mail jusqu'à l'écran.
 *
 * Ce parcours a la même forme que le contrat i18n : il est juste dans chaque
 * fichier pris séparément, et la faute n'existe qu'ENTRE eux. Le gabarit
 * (`supabase/email-templates/reset-password.html`, recopié dans le dashboard
 * Supabase) compose seul l'URL du bouton, et c'est LUI — pas le client, dont
 * rien de ce qu'il ajoute en query ne survit à l'allowlist GoTrue — qui pose le
 * `type=recovery` et la destination `next=/reset-password`. Une faute de frappe
 * là-dedans ne casse rien à la compilation : elle envoie simplement les gens
 * sur `/home` sans mot de passe à changer, ou nulle part.
 *
 * On lit donc le VRAI gabarit, on substitue ce que GoTrue substitue, et on fait
 * passer l'URL obtenue dans les vraies routes.
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
 * L'URL du lien, telle que GoTrue l'envoie : le premier `href` du gabarit, avec
 * `{{ .RedirectTo }}` et `{{ .TokenHash }}` substitués comme il les substitue.
 * `RedirectTo` vaut le `redirectTo` validé par l'allowlist, donc `…/auth/callback`
 * nu — c'est exactement ce que passe `sendPasswordReset`.
 */
function linkFromTemplate(): string {
  const href = /href="(\{\{ \.RedirectTo \}\}[^"]*)"/.exec(TEMPLATE)?.[1];
  expect(href, "le gabarit doit porter un lien bâti sur {{ .RedirectTo }}").toBeTruthy();
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

describe("le gabarit d'e-mail de réinitialisation", () => {
  it("porte un lien à JETON, jamais `{{ .ConfirmationURL }}`", () => {
    // `{{ .ConfirmationURL }}` passe par `/auth/v1/verify`, qui ouvre une
    // session sur un simple GET — précisément ce que MIN-345 a retiré. On
    // regarde le DOCUMENT, pas l'en-tête de commentaire, qui a le droit d'en
    // parler (et explique justement pourquoi il n'est pas là).
    const document = TEMPLATE.slice(TEMPLATE.indexOf("<!doctype html>"));
    expect(document).not.toContain("ConfirmationURL");
    expect(document).toContain("{{ .TokenHash }}");
  });

  it("dit `type=recovery` et mène à `/reset-password`", () => {
    const params = new URL(linkFromTemplate()).searchParams;
    expect(params.get("type")).toBe("recovery");
    expect(params.get("next")).toBe("/reset-password");
    expect(params.get("token_hash")).toBe(TOKEN_HASH);
  });

  it("pointe tous ses liens au même endroit — bouton EN, bouton FR et repli", () => {
    // Trois boutons/liens dans le corps bilingue, plus le repli en clair : un
    // seul oublié et la moitié des destinataires part ailleurs.
    const hrefs = [...TEMPLATE.matchAll(/href="(\{\{ \.RedirectTo \}\}[^"]*)"/g)].map(
      (match) => match[1],
    );
    expect(hrefs.length).toBeGreaterThanOrEqual(3);
    expect(new Set(hrefs).size).toBe(1);
  });
});

describe("le lien reçu, passé dans les vraies routes", () => {
  it("ne consomme rien sur le GET et met le jeton en attente pour /reset-password", async () => {
    const response = await get(linkFromTemplate());

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/confirm`);
    expect(pendingFrom(response)).toEqual({
      tokenHash: TOKEN_HASH,
      type: "recovery",
      next: "/reset-password",
    });
  });

  it("ouvre la session sur le POST, et dépose bien sur l'écran du mot de passe", async () => {
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

  it("repasse la main à l'app de bureau sans rien consommer, destination comprise", async () => {
    // Dans la fenêtre, le lien arrive marqué `desktop=1` : le navigateur système
    // ne doit pas être connecté à sa place (MIN-291), et la destination doit
    // survivre au deep link — sinon l'app ouvre /home et le mot de passe reste
    // celui qu'on a oublié.
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
    // Et le même verdict lu directement depuis la query, pour que l'échec dise
    // laquelle des deux moitiés a bougé.
    expect(
      desktopAuthLinkFromCallback(new URL(`${linkFromTemplate()}&desktop=1`).searchParams),
    ).toMatchObject({ kind: "otp", type: "recovery", next: "/reset-password" });
  });
});
