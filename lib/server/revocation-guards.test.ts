import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * MIN-351 — CE QUI DOIT S'ARRÊTER QUAND ON EST RETIRÉ D'UN PROJET.
 *
 * Le fil rouge de ces cas est une seule confusion : « c'est moi qui l'ai écrit »
 * a été pris pour une autorisation. C'en est une preuve d'appartenance de la
 * LIGNE, pas du droit d'y toucher aujourd'hui. Retiré du projet, l'ancien membre
 * gardait donc la main sur ses commentaires, ses pièces jointes, et une fenêtre
 * de lecture continue sur les tickets par le truchement de son inbox — laquelle
 * réhydratait des titres et des extraits VIVANTS en clé service.
 *
 * Ce qu'on exerce ici : les deux gardes écrites en TypeScript (ressources,
 * notifications), et le contenu des policies pour celles qui vivent en SQL — la
 * base n'est pas joignable depuis la suite, mais la migration, elle, est la
 * source de vérité de ce qui y sera posé, et une garde retirée par distraction
 * se voit ici.
 */

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const OTHER_PROJECT = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "22222222-2222-4222-8222-222222222222";

// ─────────────────────────────────────────────────────────────────────────────
// Décor commun
// ─────────────────────────────────────────────────────────────────────────────

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const accessibleProjectIds = vi.fn();
const removeStorageObjects = vi.fn();

/** Ce que la clé service a réellement lu ou effacé, par table. */
const serviceCalls: { deleted: string[]; read: Record<string, string[][]> } = {
  deleted: [],
  read: {},
};

let attachmentRow: Record<string, unknown> | null = null;
let notificationRows: Record<string, unknown>[] = [];

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
  accessibleProjectIds: (...args: unknown[]) => accessibleProjectIds(...args),
}));
vi.mock("@/lib/server/attachments", () => ({
  removeStorageObjects: (...args: unknown[]) => removeStorageObjects(...args),
}));
vi.mock("@/lib/server/auth-users", () => ({
  fetchAuthUsersById: async () => new Map(),
  toNamed: (u: unknown) => u,
}));
vi.mock("@/lib/server/avatar-seeds", () => ({
  fetchAvatarSeeds: async () => new Map(),
}));
vi.mock("@/lib/server/api-key-actors", () => ({
  resolveApiKeyActors: async () => new Map(),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from(table: string) {
      const record = (ids: string[]) => {
        (serviceCalls.read[table] ??= []).push(ids);
      };
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: attachmentRow }) }),
          }),
          in: (_column: string, ids: string[]) => {
            record(ids);
            // Une ligne vivante par id demandé : ce test parle de ce qui est LU,
            // pas du filtre de corbeille (`targetAlive`), qui écarterait tout si
            // l'hydratation rendait vide.
            const rows = ids.map((id) => ({ id, title: "t", number: 1, body: "b" }));
            return Object.assign(Promise.resolve({ data: rows, error: null }), {
              is: async () => ({ data: rows, error: null }),
            });
          },
        }),
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => {
                  serviceCalls.deleted.push(RESOURCE);
                  return { data: { storage_path: "projects/x/f.pdf" }, error: null };
                },
              }),
            }),
          }),
        }),
      };
    },
  }),
}));

const { DELETE: deleteResource } = await import("@/app/api/resources/[id]/route");
const { GET: listNotifications } = await import("@/app/api/notifications/route");

function req(): never {
  return new Request("https://www.minddy.app/api/x", { method: "DELETE" }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceCalls.deleted = [];
  serviceCalls.read = {};
  attachmentRow = { project_id: PROJECT };
  notificationRows = [];
  getAuthedUser.mockResolvedValue({
    ok: true,
    user: { id: USER },
    supabase: {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: async () => ({ data: notificationRows, error: null }),
          }),
        }),
      }),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La ressource : déposant ET membre
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/resources/[id]", () => {
  it("refuse au déposant qui n'est plus membre du projet, sans rien effacer", async () => {
    getProjectAccess.mockResolvedValue(null);

    const response = await deleteResource(req(), {
      params: Promise.resolve({ id: RESOURCE }),
    });

    expect(response.status).toBe(404);
    expect(serviceCalls.deleted).toEqual([]);
    expect(removeStorageObjects).not.toHaveBeenCalled();
  });

  it("laisse passer le déposant encore membre", async () => {
    getProjectAccess.mockResolvedValue({ isMember: true, isOwner: false, project: {} });

    const response = await deleteResource(req(), {
      params: Promise.resolve({ id: RESOURCE }),
    });

    expect(response.status).toBe(200);
    expect(serviceCalls.deleted).toEqual([RESOURCE]);
    expect(getProjectAccess).toHaveBeenCalledWith(USER, PROJECT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L'inbox : ce qu'on a le droit de RELIRE
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/notifications", () => {
  it("écarte les lignes d'un projet quitté, et ne va pas lire leur contenu", async () => {
    notificationRows = [
      { id: "n1", type: "comment", project_id: PROJECT, issue_id: "i1", comment_id: "c1" },
      {
        id: "n2",
        type: "comment",
        project_id: OTHER_PROJECT,
        issue_id: "i2",
        comment_id: "c2",
      },
    ];
    // Le projet quitté ne ressort pas de la revérification d'accès.
    accessibleProjectIds.mockResolvedValue(new Set([PROJECT]));

    const response = await listNotifications(req());
    const body = (await response.json()) as { id: string }[];

    expect(body.map((n) => n.id)).toEqual(["n1"]);
    // Et surtout : l'extrait du commentaire de l'autre projet n'a jamais été
    // demandé. Filtrer l'affichage après coup n'aurait pas suffi — la lecture
    // en clé service EST la fuite.
    expect(serviceCalls.read.comments).toEqual([["c1"]]);
    expect(serviceCalls.read.issues).toEqual([["i1"]]);
  });

  it("garde une ligne sans projet — il n'y a pas d'accès à revérifier", async () => {
    notificationRows = [{ id: "n1", type: "assigned", project_id: null }];
    accessibleProjectIds.mockResolvedValue(new Set());

    const response = await listNotifications(req());
    const body = (await response.json()) as { id: string }[];

    expect(body.map((n) => n.id)).toEqual(["n1"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Les gardes qui vivent en SQL
// ─────────────────────────────────────────────────────────────────────────────

/** La dernière migration qui (re)définit cet objet : c'est elle qui fait foi. */
function latestMigrationDefining(needle: string): string {
  const dir = path.join(process.cwd(), "supabase/migrations");
  const hits = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(path.join(dir, f), "utf8").includes(needle));
  expect(hits.length).toBeGreaterThan(0);
  return readFileSync(path.join(dir, hits[hits.length - 1]), "utf8");
}

/** Le corps d'une policy, de son `create policy` au `;` qui la ferme. */
function policyBody(sql: string, name: string): string {
  const start = sql.indexOf(`create policy ${name} `);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n);", start);
  return sql.slice(start, end);
}

describe("policies (SQL)", () => {
  it.each(["comments_update", "comments_delete"])(
    "%s exige l'appartenance au projet du parent, pas seulement l'auteur",
    (name) => {
      const body = policyBody(latestMigrationDefining(`create policy ${name} `), name);
      expect(body).toContain("author_id = (select auth.uid())");
      expect(body).toContain("public.can_access_comment_parent(");
    },
  );

  it.each(["comments_insert", "page_comments_insert"])(
    "%s épingle via_assistant et via_mcp à false",
    (name) => {
      const body = policyBody(latestMigrationDefining(`create policy ${name} `), name);
      expect(body).toContain("via_assistant = false");
      expect(body).toContain("via_mcp = false");
    },
  );

  it.each([
    "members_receive_broadcasts",
    "members_receive_page_presence",
    "members_track_page_presence",
  ])("%s ne caste plus le topic à cru", (name) => {
    const body = policyBody(latestMigrationDefining(`create policy ${name} `), name);
    // Un topic malformé rendrait NULL au lieu de LEVER — et une branche qui
    // lève fait tomber la policy entière, donc tout le temps réel de la session.
    expect(body).toContain("public.can_access_project(public.topic_uuid(realtime.topic()))");
    expect(body).not.toMatch(/split_part\(realtime\.topic\(\), ':', 2\)::uuid/);
  });

  it("topic_uuid rend NULL au lieu de lever", () => {
    const sql = latestMigrationDefining("create or replace function public.topic_uuid");
    expect(sql).toContain("exception when others then\n  return null;");
    // Appelée depuis une policy : sans `execute`, l'appel lève et la policy
    // tombe avec lui (MIN-329).
    expect(sql).toContain("grant execute on function public.topic_uuid(text) to authenticated");
  });
});
