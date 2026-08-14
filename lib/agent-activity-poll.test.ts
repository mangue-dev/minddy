import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agentActivityQueryKey,
  fetchAgentActivity,
} from "@/components/agent/agent-activity-context";

/**
 * Le sondage d'activité pilote les halos d'agent sur les cartes. Une erreur
 * réseau ne doit pas devenir « aucun agent ne travaille » : ce serait un
 * mensonge d'affichage, et la détente d'un démontage de carte (MIN-301).
 *
 * Testé sur un `QueryObserver` — le même moteur que `useQuery`, sans React (la
 * suite tourne sur node nu).
 */

const okResponse = (payload: unknown) =>
  ({ ok: true, status: 200, json: async () => payload }) as Response;
const errorResponse = (status: number) =>
  ({ ok: false, status, json: async () => ({}) }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAgentActivity", () => {
  it("lève sur une réponse en échec, au lieu de rendre des listes vides", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => errorResponse(503)));
    await expect(fetchAgentActivity("p1")).rejects.toThrow("agent-activity 503");
  });

  it("comble les champs absents d'une réponse partielle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ workingIssueIds: ["i1"] })),
    );
    await expect(fetchAgentActivity("p1")).resolves.toEqual({
      workingIssueIds: ["i1"],
      sessionIssueIds: [],
      pullRequests: {},
    });
  });

  it("interroge la route globale sans projet, celle du projet sinon", async () => {
    const fetchMock = vi.fn(async (_url: string) => okResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await fetchAgentActivity(null);
    await fetchAgentActivity("p1");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/agent-activity",
      "/api/projects/p1/agent-runs",
    ]);
  });
});

describe("le sondage garde son dernier état connu", () => {
  it("conserve workingIssueIds quand le sondage suivant échoue", async () => {
    let failing = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        failing
          ? errorResponse(500)
          : okResponse({ workingIssueIds: ["i1"], sessionIssueIds: ["i1"] }),
      ),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const observer = new QueryObserver(client, {
      queryKey: agentActivityQueryKey("p1"),
      queryFn: () => fetchAgentActivity("p1"),
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => {});

    await observer.refetch();
    expect(observer.getCurrentResult().data?.workingIssueIds).toEqual(["i1"]);

    failing = true;
    await observer.refetch();

    const result = observer.getCurrentResult();
    expect(result.isError).toBe(true);
    // Le point du ticket : les halos ne s'éteignent pas.
    expect(result.data?.workingIssueIds).toEqual(["i1"]);

    unsubscribe();
    client.clear();
  });
});

describe("agentActivityQueryKey", () => {
  it("distingue le mode global du mode projet", () => {
    expect(agentActivityQueryKey(null)).toEqual([
      "agent-active-issues",
      "__global__",
    ]);
    expect(agentActivityQueryKey("p1")).toEqual(["agent-active-issues", "p1"]);
  });
});
