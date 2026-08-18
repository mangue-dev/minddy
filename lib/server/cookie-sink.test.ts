import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import { createCookieSink } from "./api-auth";

/**
 * The cookie sink (MIN-293) — the link that prevents a READ session from
 * from destroying it.
 *
 * Read an expired session RENEWS it, and GoTrue spins the token from
 * refresh in passing: the new pair must return to the browser, or
 * the old token — the one the browser keeps — is dead. An adapter which
 * threw away what it was given to write therefore disconnected people silently, at
 * delayed, from a route which only reads (`/feedback`).
 *
 * What matters here and which stands without GoTrue: what the lib puts back to write
 * stands out clearly on the response returned, **redirection included** - this is the form
 * that all the exits of this route take.
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
    // A redirect carries cookies like another response, and remains a
    // redirection: this is the whole reason for this postponement.
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
