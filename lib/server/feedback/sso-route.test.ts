import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signFeedbackSsoJwt } from "@/lib/feedback/sso-jwt";

/**
 * MIN-345 — l'atterrissage SSO d'un board, du point de vue de ce qui le rend
 * dangereux : une simple navigation `GET` y ouvre une session.
 *
 * Ce qu'on tient ici, et qu'aucun test de `verifyFeedbackSsoJwt` ne peut tenir
 * seul : le jeton est CONSOMMÉ. La vérification de signature dit « ce jeton a
 * été émis par le board » ; elle ne dira jamais « il n'a pas déjà servi ». La
 * différence est toute l'attaque — l'URL traîne dans un `Referer`, un
 * historique, un journal de proxy, et se rejoue.
 */

const SECRET = "board-sso-secret";
const BOARD_TOKEN = "brd_public_token";

const board = {
  id: "board-1",
  enabled: true,
  sso_secret: SECRET as string | null,
};

/** Les lignes de `feedback_sso_replays`, clés par `board_id.token_id`. */
const consumed = new Set<string>();
let insertFails = false;

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      insert: async (values: Record<string, unknown>) => {
        if (insertFails) return { error: { code: "XX000", message: "down" } };
        const key = `${values.board_id}.${values.token_id}`;
        if (consumed.has(key)) {
          return { error: { code: "23505", message: "duplicate key" } };
        }
        consumed.add(key);
        return { error: null };
      },
      delete: () => ({ lt: async () => ({ error: null }) }),
    }),
  }),
}));

vi.mock("@/lib/server/feedback/boards", () => ({
  getBoardByToken: async () => ({ board, project: { id: "proj-1" } }),
}));

vi.mock("@/lib/server/custom-domains", () => ({
  getRequestDomainTarget: async () => null,
  feedbackBasePath: (token: string) => `/f/${token}`,
}));

const sessions: Array<{ boardId: string; userId: string }> = [];

vi.mock("@/lib/server/feedback/identity", () => ({
  FEEDBACK_SESSION_COOKIE: "mdy_feedback_session",
  upsertFeedbackUser: async () => ({ id: "fbu-1" }),
  createFeedbackSession: async (params: { boardId: string; userId: string }) => {
    sessions.push(params);
    return { token: `fbs_${sessions.length}`, expiresAt: new Date(Date.now() + 1000) };
  },
  feedbackSessionCookieOptions: () => ({ path: "/" }),
}));

const { GET } = await import("@/app/f/[token]/sso/route");

function call(jwt: string): Promise<Response> {
  const url = `https://www.minddy.app/f/${BOARD_TOKEN}/sso?jwt=${encodeURIComponent(jwt)}`;
  return GET(new NextRequest(url, { headers: { host: "www.minddy.app" } }), {
    params: Promise.resolve({ token: BOARD_TOKEN }),
  }) as unknown as Promise<Response>;
}

function landedOnBoard(response: Response): boolean {
  return !(response.headers.get("location") ?? "").includes("ssoError");
}

beforeEach(() => {
  consumed.clear();
  sessions.length = 0;
  insertFails = false;
  board.enabled = true;
  board.sso_secret = SECRET;
});

describe("GET /f/<token>/sso", () => {
  it("ouvre la session sur un jeton valide", async () => {
    const response = await call(signFeedbackSsoJwt({ sub: "user-1" }, SECRET));
    expect(landedOnBoard(response)).toBe(true);
    expect(sessions).toHaveLength(1);
  });

  it("refuse le MÊME jeton une seconde fois", async () => {
    const jwt = signFeedbackSsoJwt({ sub: "user-1" }, SECRET);
    expect(landedOnBoard(await call(jwt))).toBe(true);

    const replay = await call(jwt);
    expect(landedOnBoard(replay)).toBe(false);
    // Et surtout : aucune seconde session ouverte.
    expect(sessions).toHaveLength(1);
  });

  /**
   * Le jeton est signé avec le VRAI secret du board : c'est le cas réel, où le
   * backend qui signe est libre de son `exp` — notre signeur n'y est pour rien.
   * Seul le vérificateur peut le refuser, et il doit.
   */
  it("refuse un jeton d'un an, pourtant correctement signé", async () => {
    const now = Math.floor(Date.now() / 1000);
    const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url"
    );
    const body = Buffer.from(
      JSON.stringify({ sub: "user-1", iat: now, exp: now + 31_536_000 })
    ).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");

    expect(landedOnBoard(await call(`${head}.${body}.${sig}`))).toBe(false);
    expect(sessions).toHaveLength(0);
  });

  it("refuse plutôt que de laisser passer quand la garde de rejeu est en panne", async () => {
    insertFails = true;
    expect(landedOnBoard(await call(signFeedbackSsoJwt({ sub: "user-1" }, SECRET)))).toBe(
      false
    );
    expect(sessions).toHaveLength(0);
  });
});
