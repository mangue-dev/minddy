import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteIssueIdentity } from "@/lib/server/git/issue-push";

/**
 * `scheduleRemoteStatusPush` — la moitié MONTANTE de la synchro : le statut d'un
 * ticket minddy referme (ou rouvre) l'issue dont il vient.
 *
 * C'est le seul endroit de la synchro d'issues qui ÉCRIT chez un tiers, et sur
 * le compte de quelqu'un. Trois propriétés méritent d'être épinglées pour cette
 * raison-là, pas pour la couverture :
 *
 *  1. **Le silence par défaut.** La quasi-totalité des tickets naissent dans
 *     minddy et n'ont aucune identité distante : le crochet doit sortir sans
 *     LA MOINDRE requête. Une garde qui se relâcherait ferait un aller-retour
 *     réseau à chaque déplacement de carte, pour rien.
 *  2. **Le toggle coupe les deux sens.** Couper l'import doit couper le retour :
 *     il serait incompréhensible qu'un interrupteur unique n'en arrête qu'un —
 *     et l'utilisateur qui coupe croirait avoir coupé.
 *  3. **Ce qu'on écrit vraiment.** `done` est une coche violette « completed »,
 *     `canceled` un cercle gris « not planned ». C'est la seule nuance de nos
 *     trois statuts clos qui survive à la traversée, et elle se joue sur un
 *     champ du corps de la requête.
 *
 * Le module est best-effort de bout en bout : rien de ce qui échoue ici ne doit
 * remonter à celui qui a déplacé la carte.
 */

interface Row extends Record<string, unknown> {}

let linkRows: Row[] = [];
/** Les appels HTTP sortants, dans l'ordre — la sonde de tout ce fichier. */
let calls: { url: string; method: string; body: Record<string, unknown>; auth: string }[] =
  [];
/** Les travaux d'arrière-plan programmés, à attendre explicitement. */
let background: Promise<unknown>[] = [];
/** Ce que `resolveForgeActor` rend — l'acteur humain et son droit sur le dépôt. */
let actor: { kind: "actor"; token: string; capability: string } | { kind: "none" } = {
  kind: "none",
};
/** Réponse de la forge : `null` = 200, sinon le code d'erreur à rendre. */
let httpError: number | null = null;

function table(rows: () => Row[]) {
  const filters: ((row: Row) => boolean)[] = [];
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = (column: string, value: unknown) => {
    filters.push((row) => row[column] === value);
    return query;
  };
  query.maybeSingle = async () => ({
    data: rows().filter((row) => filters.every((f) => f(row)))[0] ?? null,
    error: null,
  });
  return query;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: () => table(() => linkRows) }),
}));

// Le crochet de fond exécute tout de suite ET rend sa promesse au test : sans
// ça, les assertions courraient devant le travail qu'elles observent.
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (work: () => Promise<void>) => {
    background.push(work().catch(() => {}));
  },
}));

vi.mock("@/lib/server/git/forge-actor", () => ({
  resolveForgeActor: async () => actor,
}));
vi.mock("@/lib/server/git/github-app", () => ({
  getInstallationToken: async () => ({ token: "app-token" }),
}));
vi.mock("@/lib/server/git/gitlab-app", () => ({
  getGitlabAccessToken: async () => "gitlab-connection-token",
}));

const { scheduleRemoteStatusPush } = await import("@/lib/server/git/issue-push");

const PROJECT = "project-1";

/** Une liaison active, telle que `project_git_links` la porte. */
function link(overrides: Row = {}): void {
  linkRows.push({
    project_id: PROJECT,
    provider: "github",
    connection_id: "conn-1",
    installation_id: 42,
    repo_full_name: "acme/app",
    external_repo_id: "9001",
    issue_sync_enabled: true,
    ...overrides,
  });
}

/** Le ticket importé d'un dépôt — celui qui a une identité distante. */
const IMPORTED: RemoteIssueIdentity = {
  projectId: PROJECT,
  provider: "github",
  repoId: "9001",
  number: 7,
};

/** Programme la répercussion et ATTEND le travail de fond qu'elle a posé. */
async function push(issue: RemoteIssueIdentity, status: string): Promise<void> {
  scheduleRemoteStatusPush({
    issue,
    status: status as never,
    actorId: "user-1",
  });
  await Promise.all(background);
}

beforeEach(() => {
  linkRows = [];
  calls = [];
  background = [];
  actor = { kind: "none" };
  httpError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({
      url,
      method: init.method ?? "GET",
      body: JSON.parse(String(init.body ?? "{}")),
      auth: headers.Authorization,
    });
    return httpError
      ? {
          ok: false,
          status: httpError,
          json: async () => ({ message: "Resource not accessible by integration" }),
        }
      : { ok: true, status: 200, json: async () => ({}) };
  });
});

describe("scheduleRemoteStatusPush — quand il ne se passe RIEN", () => {
  it("sort sans aucune requête pour un ticket né dans minddy", async () => {
    link();
    await push({ ...IMPORTED, provider: null, repoId: null, number: null }, "done");

    expect(calls).toHaveLength(0);
  });

  it("ne pousse pas quand la synchro est coupée — le toggle arrête les DEUX sens", async () => {
    link({ issue_sync_enabled: false });
    await push(IMPORTED, "done");

    expect(calls).toHaveLength(0);
  });

  it("ne pousse pas vers un dépôt que ce projet n'a pas lié", async () => {
    link({ external_repo_id: "un-autre-depot" });
    await push(IMPORTED, "done");

    expect(calls).toHaveLength(0);
  });
});

describe("scheduleRemoteStatusPush — GitHub", () => {
  beforeEach(() => link());

  it("ferme en « completed » pour un travail fait", async () => {
    await push(IMPORTED, "done");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe("https://api.github.com/repos/acme/app/issues/7");
    expect(calls[0].body).toEqual({ state: "closed", state_reason: "completed" });
  });

  it("ferme en « not planned » pour un travail qui n'aura pas lieu", async () => {
    await push(IMPORTED, "canceled");
    await push(IMPORTED, "duplicate");

    expect(calls.map((c) => c.body.state_reason)).toEqual(["not_planned", "not_planned"]);
  });

  it("rouvre sans raison de fermeture — `state_reason` n'a de sens qu'à la fermeture", async () => {
    await push(IMPORTED, "in_progress");

    expect(calls[0].body).toEqual({ state: "open" });
  });

  it("signe avec le compte de l'humain quand il peut écrire sur le dépôt", async () => {
    actor = { kind: "actor", token: "human-token", capability: "write" };
    await push(IMPORTED, "done");

    expect(calls[0].auth).toBe("Bearer human-token");
  });

  it("retombe sur l'App quand l'humain n'a que la LECTURE — pas un 403 en son nom", async () => {
    actor = { kind: "actor", token: "human-token", capability: "read" };
    await push(IMPORTED, "done");

    expect(calls[0].auth).toBe("Bearer app-token");
  });

  it("retombe sur l'App quand personne n'a connecté de compte", async () => {
    await push(IMPORTED, "done");

    expect(calls[0].auth).toBe("Bearer app-token");
  });

  it("avale un refus de la forge — déplacer une carte ne doit jamais échouer", async () => {
    httpError = 403; // « Resource not accessible by integration » : Issues (Write) refusé.
    await expect(push(IMPORTED, "done")).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });
});

describe("scheduleRemoteStatusPush — GitLab", () => {
  beforeEach(() => link({ provider: "gitlab", installation_id: null }));

  const GITLAB_ISSUE: RemoteIssueIdentity = { ...IMPORTED, provider: "gitlab" };

  it("envoie une TRANSITION, pas un état — GitLab ne prend que `state_event`", async () => {
    await push(GITLAB_ISSUE, "done");

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://gitlab.com/api/v4/projects/9001/issues/7");
    expect(calls[0].body).toEqual({ state_event: "close" });
  });

  it("ferme pareil pour les trois statuts clos — pas d'équivalent de `state_reason`", async () => {
    await push(GITLAB_ISSUE, "done");
    await push(GITLAB_ISSUE, "canceled");

    expect(calls.map((c) => c.body)).toEqual([
      { state_event: "close" },
      { state_event: "close" },
    ]);
  });

  it("rouvre depuis n'importe quel statut ouvert", async () => {
    await push(GITLAB_ISSUE, "triage");

    expect(calls[0].body).toEqual({ state_event: "reopen" });
  });

  it("signe avec la connexion du lieur, faute d'App", async () => {
    await push(GITLAB_ISSUE, "done");

    expect(calls[0].auth).toBe("Bearer gitlab-connection-token");
  });
});
