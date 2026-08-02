import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-163bis — le rattachement manuel d'une PR à un ticket, devenu le point de
 * passage des TROIS surfaces (dialog de l'app, MCP, Numo). Ce qui est testé ici
 * est exactement ce qui change selon l'appelant sans devoir changer de réponse :
 * l'échelle des refus, et le fait qu'un agent qui rejoue son appel trouve un
 * succès là où l'écran, lui, doit voir un conflit.
 *
 * Le faux Supabase porte les trois seules formes de requête du cœur : la liste
 * des projets d'un dépôt, la recherche d'une PR vivante sur un ticket, et
 * l'écriture CONDITIONNELLE du lien — c'est elle qui rend le geste atomique, et
 * le faux l'applique vraiment (sinon le test ne dirait rien de la course).
 */

const PR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ISSUE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_ISSUE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PROJECT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FOREIGN_PROJECT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REPO = "mangue-dev/minddy";

interface PrRow {
  id: string;
  provider: string;
  repo_full_name: string;
  number: number;
  state: string;
  issue_id: string | null;
  url: string | null;
  title: string | null;
}

const world = {
  /** Projets qui lient le dépôt (`project_git_links` + son projet embarqué). */
  links: [] as Array<{ provider: string; repo_full_name: string; project_id: string }>,
  prs: [] as PrRow[],
};

function makePr(over: Partial<PrRow> = {}): PrRow {
  return {
    id: PR_ID,
    provider: "github",
    repo_full_name: REPO,
    number: 42,
    state: "open",
    issue_id: null,
    url: `https://github.com/${REPO}/pull/42`,
    title: "Un titre sans référence",
    ...over,
  };
}

vi.mock("@/lib/supabase-service", () => {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let inFilter: { column: string; values: unknown[] } | null = null;
    let patch: Record<string, unknown> | null = null;

    const rows = (): unknown[] => {
      if (table === "project_git_links") {
        return world.links
          .filter((l) =>
            Object.entries(filters).every(
              ([column, value]) => (l as Record<string, unknown>)[column] === value,
            ),
          )
          .map((l) => ({
            provider: l.provider,
            repo_full_name: l.repo_full_name,
            // Relation to-one embarquée : `projectsForRepo` lit `row.project`.
            project: { id: l.project_id, key: "MIN" },
          }));
      }
      return world.prs.filter(
        (pr) =>
          Object.entries(filters).every(
            ([column, value]) =>
              ((pr as unknown as Record<string, unknown>)[column] ?? null) === value,
          ) &&
          (!inFilter ||
            inFilter.values.includes(
              (pr as unknown as Record<string, unknown>)[inFilter.column],
            )),
      );
    };

    /** L'écriture conditionnelle : elle ne touche QUE les lignes que les
        filtres retiennent — `is("issue_id", null)` compris. */
    const applyUpdate = (): unknown[] => {
      const targets = rows() as PrRow[];
      for (const row of targets) Object.assign(row, patch);
      return targets.map((row) => ({ id: row.id }));
    };

    const query: Record<string, unknown> = {};
    const chain = () => query;
    query.select = chain;
    query.limit = chain;
    query.update = (values: Record<string, unknown>) => {
      patch = values;
      return query;
    };
    query.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    };
    query.is = (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    };
    query.in = (column: string, values: unknown[]) => {
      inFilter = { column, values };
      return query;
    };
    // Le balayage tamponne `pull_request_syncs` : rien à observer ici.
    query.upsert = async () => ({ error: null });
    query.maybeSingle = async () => {
      const found = patch ? applyUpdate() : rows();
      return { data: found[0] ?? null, error: null };
    };
    // Awaitable sans `.maybeSingle()` : la forme des lectures de liste.
    query.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: patch ? applyUpdate() : rows(), error: null }).then(resolve);
    return query;
  };
  return { getServiceClient: () => ({ from }) };
});

const broadcast = vi.fn();
vi.mock("./pr-live", () => ({ broadcastPrChanged: (...a: unknown[]) => broadcast(...a) }));

const syncStatus = vi.fn();
vi.mock("./issue-status-sync", async () => {
  const { issueStatusForPrState } = await import("@/lib/pr-issue-status");
  return {
    issueStatusForPrState,
    syncIssueStatusFromPr: (...a: unknown[]) => syncStatus(...a),
  };
});

const cloneTarget = vi.fn(async () => null as { token: string } | null);
vi.mock("./repo-access", () => ({
  resolveRepoCloneTargetForRepo: (...a: unknown[]) => cloneTarget(...(a as [])),
}));

/** Le balayage lit la forge : on lui rend un dépôt vide, ce qui suffit à
    vérifier qu'il a bien été TENTÉ avant de conclure « introuvable ». */
const sweep = vi.fn(async () => ({ pulls: [], truncated: false }));
vi.mock("./forge", () => ({
  forgeFor: () => ({ listPullRequests: sweep }),
}));

const { linkPullRequestToIssue, resolveProjectPullRequest } = await import("./pr-link");

beforeEach(() => {
  world.links = [{ provider: "github", repo_full_name: REPO, project_id: PROJECT_ID }];
  world.prs = [makePr()];
  broadcast.mockClear();
  syncStatus.mockClear();
  cloneTarget.mockClear();
  cloneTarget.mockResolvedValue(null);
});

const link = (over: { pr?: PrRow; issueId?: string; projectId?: string } = {}) =>
  linkPullRequestToIssue({
    pr: (over.pr ?? world.prs[0]) as never,
    issue: { id: over.issueId ?? ISSUE_ID, projectId: over.projectId ?? PROJECT_ID },
    actorId: "user-1",
  });

describe("linkPullRequestToIssue", () => {
  it("rattache une PR libre et aligne le statut du ticket", async () => {
    const result = await link();

    expect(result).toEqual({ ok: true, already: false, status: "in_review" });
    expect(world.prs[0].issue_id).toBe(ISSUE_ID);
    expect(broadcast).toHaveBeenCalledWith(PR_ID, ["pr"]);
    expect(syncStatus).toHaveBeenCalledWith({
      issueId: ISSUE_ID,
      actorId: "user-1",
      prState: "open",
    });
  });

  it("donne à chaque état de PR le statut que la table promet", async () => {
    for (const [state, status] of [
      ["draft", "in_progress"],
      ["merged", "done"],
      ["closed", "todo"],
    ] as const) {
      world.prs = [makePr({ state })];
      await expect(link()).resolves.toMatchObject({ ok: true, status });
    }
  });

  it("rejouer le MÊME rattachement est un succès, sans rien réécrire", async () => {
    world.prs = [makePr({ issue_id: ISSUE_ID })];

    const result = await link();

    expect(result).toEqual({ ok: true, already: true, status: "in_review" });
    // Le geste est déjà fait : ni diffusion, ni statut réécrit.
    expect(broadcast).not.toHaveBeenCalled();
    expect(syncStatus).not.toHaveBeenCalled();
  });

  it("refuse une PR déjà rattachée à un AUTRE ticket", async () => {
    world.prs = [makePr({ issue_id: OTHER_ISSUE_ID })];

    await expect(link()).resolves.toEqual({ ok: false, code: "pr_already_linked" });
    expect(world.prs[0].issue_id).toBe(OTHER_ISSUE_ID);
  });

  it("refuse un ticket dont le projet ne lie pas ce dépôt", async () => {
    await expect(link({ projectId: FOREIGN_PROJECT_ID })).resolves.toEqual({
      ok: false,
      code: "issue_outside_repo",
    });
    expect(world.prs[0].issue_id).toBeNull();
  });

  it("refuse un ticket qui porte déjà une PR VIVANTE", async () => {
    world.prs = [makePr(), makePr({ id: "pr-2", number: 7, state: "draft", issue_id: ISSUE_ID })];

    await expect(link({ pr: world.prs[0] })).resolves.toEqual({
      ok: false,
      code: "issue_already_linked",
    });
  });

  it("accepte un ticket dont les PR précédentes sont TERMINALES", async () => {
    // Un ticket que Numo a repris plusieurs fois enchaîne légitimement les PR :
    // c'est l'unicité « une PR VIVANTE », pas « une PR ».
    world.prs = [makePr(), makePr({ id: "pr-2", number: 7, state: "merged", issue_id: ISSUE_ID })];

    await expect(link({ pr: world.prs[0] })).resolves.toMatchObject({ ok: true });
  });
});

describe("resolveProjectPullRequest", () => {
  const resolve = (ref: string | number | null | undefined, projectId = PROJECT_ID) =>
    resolveProjectPullRequest({ projectId, ref, userId: "user-1" });

  it("trouve la PR du dépôt lié, par numéro comme par URL", async () => {
    await expect(resolve("#42")).resolves.toEqual({ pr: world.prs[0] });
    await expect(resolve(`https://github.com/${REPO}/pull/42`)).resolves.toEqual({
      pr: world.prs[0],
    });
  });

  it("refuse une référence qui ne désigne pas une pull request", async () => {
    await expect(resolve("MIN-42")).resolves.toEqual({ error: "invalid_ref" });
  });

  it("dit qu'il n'y a pas de dépôt plutôt que « introuvable »", async () => {
    world.links = [];
    await expect(resolve("#42")).resolves.toEqual({ error: "no_repository" });
  });

  it("balaye le dépôt avant d'abandonner sur un numéro inconnu", async () => {
    cloneTarget.mockResolvedValue({ token: "t" });

    await expect(resolve("#404")).resolves.toEqual({ error: "not_found" });
    // Le rattrapage a bien eu lieu : une PR ouverte il y a trente secondes sur un
    // dépôt sans webhook n'est pas encore en base, et « introuvable » serait faux.
    expect(cloneTarget).toHaveBeenCalled();
    expect(sweep).toHaveBeenCalled();
  });

  it("ne fait pas tomber la résolution quand la forge est en panne", async () => {
    cloneTarget.mockRejectedValue(new Error("forge down"));
    await expect(resolve("#404")).resolves.toEqual({ error: "not_found" });
  });
});
