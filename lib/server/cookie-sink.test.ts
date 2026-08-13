import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import { createCookieSink } from "./api-auth";

/**
 * L'évier à cookies (MIN-293) — le maillon qui empêche une LECTURE de session de
 * la détruire.
 *
 * Lire une session expirée la RENOUVELLE, et GoTrue fait tourner le jeton de
 * rafraîchissement au passage : le couple neuf doit revenir au navigateur, ou
 * l'ancien jeton — celui que le navigateur garde — est mort. Un adaptateur qui
 * jetait ce qu'on lui donnait à écrire déconnectait donc les gens en silence, à
 * retardement, depuis une route qui ne fait que lire (`/feedback`).
 *
 * Ce qui compte ici et qui se tient sans GoTrue : ce que la lib remet à écrire
 * ressort bien sur la réponse rendue, **redirection comprise** — c'est la forme
 * que prennent toutes les sorties de cette route-là.
 */
const OPTIONS = { path: "/", httpOnly: true, sameSite: "lax" as const };

describe("createCookieSink", () => {
  it("repose sur la réponse ce que la lib a demandé d'écrire", () => {
    const sink = createCookieSink();
    sink.collect([
      { name: "sb-access-token", value: "neuf", options: OPTIONS },
      { name: "sb-refresh-token", value: "aussi-neuf", options: OPTIONS },
    ]);

    const response = sink.applyCookies(
      NextResponse.redirect("https://feedback.minddy.app", 302)
    );

    expect(response.cookies.get("sb-access-token")?.value).toBe("neuf");
    expect(response.cookies.get("sb-refresh-token")?.value).toBe("aussi-neuf");
    // Une redirection porte des cookies comme une autre réponse, et reste une
    // redirection : c'est toute la raison d'être de ce report.
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://feedback.minddy.app/");
  });

  it("porte les options — un cookie de session sans `path` ne vaut rien", () => {
    const sink = createCookieSink();
    sink.collect([
      { name: "sb-refresh-token", value: "neuf", options: { ...OPTIONS, maxAge: 3600 } },
    ]);
    const cookie = sink
      .applyCookies(NextResponse.json({}))
      .cookies.get("sb-refresh-token");
    expect(cookie?.path).toBe("/");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.maxAge).toBe(3600);
  });

  it("ne pose rien quand rien n'a été rafraîchi — le cas courant", () => {
    const sink = createCookieSink();
    const response = sink.applyCookies(NextResponse.json({ ok: true }));
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("rend la réponse elle-même, pour être chaînable sur un `return`", () => {
    const sink = createCookieSink();
    const response = NextResponse.json({});
    expect(sink.applyCookies(response)).toBe(response);
  });
});
