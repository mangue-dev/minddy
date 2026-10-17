import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Smart Fill relations (MIN-717). The pure helpers are tested directly; the
 * pass itself runs against mocked boundaries — issue reads, the index, the
 * relation core, the decision runner — so each gate (opt-out, budget, no
 * candidate, stale content, team-owned or dismissed pairs, cycles, cache) is
 * observable through what reached the engines and the relation core.
 */

const h = vi.hoisted(() => ({
  meta: {} as Record<string, unknown>,
  metaByUser: {} as Record<string, Record<string, unknown>>,
  // Subject title seen by list reads (the post-embedding freshness check), when set.
  raceTitle: null as string | null,
  projects: [] as Record<string, unknown>[],
  cursor: null as string | null,
  issues: new Map<string, Record<string, unknown>>(),
  // Content returned by the SECOND subject read (stale check), when set.
  staleTitle: null as string | null,
  subjectReads: 0,
  embeddings: [] as Record<string, unknown>[],
  relations: [] as { id: string; source_id: string; target_id: string; type: "blocks" | "related" }[],
  inferences: [] as Record<string, unknown>[],
  upserts: [] as Record<string, unknown>[][],
  budget: true,
  runtime: { provider: "openrouter", model: "openai/text-embedding-3-small", apiKey: "k", mode: "platform" },
  vector: [1, 0, 0] as number[] | null,
  decision: null as null | Record<string, { value: string; probability: number | null; confidence: number | null }>,
  runDecision: vi.fn(),
  requestEmbeddings: vi.fn(),
  addIssueRelation: vi.fn(),
  writeIssueEmbedding: vi.fn(),
  reencodeClearEmbedding: vi.fn(),
  deleted: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: async () => ({}),
  setAppConfigValue: async (_key: string, value: string) => { h.cursor = value; },
}));
vi.mock("@/lib/server/usage", () => ({ hasUsageBudget: async () => h.budget }));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async () => ({ canWrite: true }),
}));
vi.mock("@/lib/server/ai-runtime", () => ({ resolveAiRuntime: async () => h.runtime }));
vi.mock("@/lib/server/smart-fill", () => ({ resolveCreationAccount: async () => null }));
vi.mock("@/lib/server/embeddings", () => ({
  cosineSimilarity: (a: number[], b: number[]) => {
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
    return aa && bb ? dot / Math.sqrt(aa * bb) : null;
  },
  requestEmbeddings: h.requestEmbeddings,
}));
vi.mock("@/lib/server/issue-embedding-store", () => ({
  listIssueEmbeddings: async (_s: unknown, ids: string[]) =>
    h.embeddings.filter((row) => ids.includes(row.issue_id as string)),
  deleteIssueEmbeddingVersions: async (_s: unknown, issueId: string, versions: string[]) => {
    h.deleted.push(...versions.map((version) => `${issueId}@${version}`));
    h.embeddings = h.embeddings.filter((row) => !(row.issue_id === issueId && versions.includes(row.index_version as string)));
  },
  reencodeClearEmbedding: h.reencodeClearEmbedding,
  listProjectEmbeddings: async (_s: unknown, _p: string, version: string) =>
    h.embeddings.filter((row) => row.index_version === version),
  writeIssueEmbedding: h.writeIssueEmbedding,
}));
vi.mock("@/lib/server/issue-relations", () => ({
  listIssueRelations: async () => ({ relations: h.relations }),
  addIssueRelation: h.addIssueRelation,
}));
vi.mock("@/lib/server/decisions/runner", () => ({ runDecision: h.runDecision }));

/** A thenable query over a list, enough for the filters this module uses. */
function query(
  rows: () => Record<string, unknown>[],
  listRows: (rows: Record<string, unknown>[]) => Record<string, unknown>[] = (r) => r,
) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let max = Infinity;
  let sortBy: string | null = null;
  const q = {
    select: () => q,
    eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return q; },
    is(c: string, v: unknown) { filters.push((r) => (r[c] ?? null) === v); return q; },
    in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return q; },
    gt(c: string, v: string) { filters.push((r) => String(r[c]) > v); return q; },
    order(c: string) { sortBy = c; return q; },
    limit(n: number) { max = n; return q; },
    upsert(values: Record<string, unknown>[]) { h.upserts.push(values); return Promise.resolve({ error: null }); },
    async maybeSingle() {
      const found = rows().filter((r) => filters.every((f) => f(r)));
      return { data: found[0] ?? null, error: null };
    },
    then(resolve: (v: unknown) => unknown) {
      const found = rows().filter((r) => filters.every((f) => f(r)));
      if (sortBy) found.sort((a, b) => String(a[sortBy!]).localeCompare(String(b[sortBy!])));
      return Promise.resolve({ data: listRows(found).slice(0, max), error: null }).then(resolve);
    },
  };
  return q;
}

vi.mock("@/lib/server/issue-store", () => ({
  issueStore: () => {
    // List reads (not single reads) see the racing edit: that is the
    // freshness check made after the embedding call.
    const q = query(() => [...h.issues.values()], (rows) => rows.map((row) =>
      row.id === "subject" && h.raceTitle ? { ...row, title: h.raceTitle } : row));
    const maybeSingle = q.maybeSingle.bind(q);
    q.maybeSingle = async () => {
      const result = await maybeSingle();
      if (result.data && result.data.id === "subject") {
        h.subjectReads++;
        if (h.subjectReads > 1 && h.staleTitle) return { data: { ...result.data, title: h.staleTitle }, error: null };
      }
      return result;
    };
    return q;
  },
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    auth: { admin: { getUserById: async (id: string) =>
      ({ data: { user: { user_metadata: h.metaByUser[id] ?? h.meta } }, error: null }) } },
    from: (table: string) =>
      query(() => (table === "issue_embeddings" ? h.embeddings
        : table === "issue_relation_inferences" ? h.inferences
          : table === "projects" ? h.projects : [])),
  }),
}));

import {
  cachedVerdict,
  contentFingerprint,
  dismissedCandidates,
  indexVersion,
  lexicalScore,
  rankVectorNeighbours,
  relationScopeAllows,
  runIssueAiPass,
  runIssueIndexBackfill,
  wouldCloseBlockingCycle,
} from "./issue-relation-inference";

const VERSION = "openrouter:openai/text-embedding-3-small:3";

function issue(id: string, title: string, description: string | null = null, status = "todo", createdBy = "u1") {
  h.issues.set(id, { id, project_id: "p1", number: Number(id.replace(/\D/g, "") || 1), title, description, status,
    deleted_at: null, created_by: createdBy });
}

function indexRow(id: string, embedding: number[], version = VERSION) {
  const content = h.issues.get(id)!;
  h.embeddings.push({
    issue_id: id, project_id: "p1", index_version: version, content_version: `v-${id}`,
    dimensions: embedding.length, embedding,
    content_hash: contentFingerprint(content.title as string, content.description as string | null),
  });
}

const pass = () =>
  runIssueAiPass({ issueId: "subject", projectId: "p1", projectName: "Minddy", payerId: "u1", inferRelations: true });

beforeEach(() => {
  h.meta = {};
  h.metaByUser = {};
  h.raceTitle = null;
  h.projects = [{ id: "p1", owner_id: "owner", deleted_at: null }];
  h.cursor = null;
  h.issues = new Map();
  h.staleTitle = null;
  h.subjectReads = 0;
  h.embeddings = [];
  h.relations = [];
  h.inferences = [];
  h.upserts = [];
  h.budget = true;
  h.vector = [1, 0, 0];
  h.decision = null;
  h.runDecision.mockReset().mockImplementation(async () =>
    h.decision ? { engine: "llm", answers: h.decision, confidence: 1, fallbackReason: null } : null);
  h.requestEmbeddings.mockReset().mockImplementation(async (texts: string[]) => ({
    vectors: texts.map(() => h.vector), provider: "openrouter", model: "openai/text-embedding-3-small", keyMode: "platform",
  }));
  h.addIssueRelation.mockReset().mockImplementation(async (input: { sourceId: string; targetId: string }) => ({
    ok: true, relation: { id: `rel-${input.targetId}`, source_id: input.sourceId, target_id: input.targetId, type: "related" },
  }));
  h.writeIssueEmbedding.mockReset().mockResolvedValue(undefined);
  h.reencodeClearEmbedding.mockReset().mockResolvedValue(false);
  h.deleted = [];
  issue("subject", "Add SSO login", "Use the new auth provider for sign-in.");
});

describe("pure helpers", () => {
  it("versions the index by provider, model and dimensions", () => {
    expect(indexVersion("openrouter", "openai/text-embedding-3-small:nitro", 1536))
      .toBe("openrouter:openai/text-embedding-3-small:1536");
    // Equal dimensions do not make two embedding spaces compatible.
    expect(indexVersion("openai", "text-embedding-3-small", 1536))
      .not.toBe(indexVersion("google", "gemini-embedding-001", 1536));
  });

  it("scores lexical overlap across accents and requires two shared words", () => {
    expect(lexicalScore("Connexion SSO échoue après rotation", "La connexion échoue après la rotation des clés"))
      .toBeGreaterThan(0.2);
    expect(lexicalScore("Dark mode toggle", "Dark theme colors")).toBe(0);
  });

  it("ranks vector neighbours above the floor, excluding the issue itself", () => {
    const ranked = rankVectorNeighbours([1, 0], [
      { issue_id: "self", embedding: [1, 0] },
      { issue_id: "close", embedding: [0.9, 0.1] },
      { issue_id: "far", embedding: [0, 1] },
    ], "self");
    expect(ranked.map((r) => r.id)).toEqual(["close"]);
  });

  it("detects a blocks edge that would close a cycle", () => {
    const edges = [{ source_id: "a", target_id: "b" }, { source_id: "b", target_id: "c" }];
    expect(wouldCloseBlockingCycle(edges, "c", "a")).toBe(true);
    expect(wouldCloseBlockingCycle(edges, "a", "c")).toBe(false);
  });

  it("remembers dismissed pairs and reads cached verdicts from both sides", () => {
    const rows = [
      { issue_id: "s", candidate_id: "x", issue_version: "1", candidate_version: "2", verdict: "related" as const, relation_id: null, applied_at: "t" },
      { issue_id: "y", candidate_id: "s", issue_version: "3", candidate_version: "1", verdict: "blocks" as const, relation_id: null, applied_at: null },
    ];
    expect([...dismissedCandidates("s", rows)]).toEqual(["x"]);
    expect(cachedVerdict(rows, "s", "1", "y", "3")).toBe("blocked_by");
    expect(cachedVerdict(rows, "s", "changed", "y", "3")).toBeNull();
  });

  it("never lets a member's explicit choice override the owner's triage refusal", () => {
    const ownerRefusesTriage = { smart_fill_triage: false };
    expect(relationScopeAllows("created", "triage", ownerRefusesTriage, true,
      { ownerBilledTriage: true, actorId: "member", payerId: "owner" })).toBe(false);
    // The owner promoting feedback themselves may still opt this issue in.
    expect(relationScopeAllows("created", "triage", ownerRefusesTriage, true,
      { ownerBilledTriage: true, actorId: "owner", payerId: "owner" })).toBe(true);
  });

  it("applies the creation scopes to creations and the relation switch to edits", () => {
    expect(relationScopeAllows("created", "created", {}, undefined)).toBe(true);
    expect(relationScopeAllows("created", "created", { smart_fill_created: false }, undefined)).toBe(false);
    expect(relationScopeAllows("created", "created", { smart_fill_created: false }, true)).toBe(true);
    expect(relationScopeAllows("created", "created", {}, false)).toBe(false);
    expect(relationScopeAllows("edited", "created", { smart_fill_created: false }, undefined)).toBe(true);
    expect(relationScopeAllows("edited", "created", { smart_fill: false }, undefined)).toBe(false);
  });
});

describe("runIssueAiPass", () => {
  it("indexes and links a semantically close issue confirmed by the decision", async () => {
    issue("c2", "Single sign-on for enterprise customers");
    indexRow("c2", [0.95, 0.05, 0]);
    h.decision = { candidate_1: { value: "related", probability: null, confidence: null } };

    const result = await pass();

    expect(result).toMatchObject({ indexed: true, candidates: 1, decided: 1, applied: 1 });
    expect(h.requestEmbeddings).toHaveBeenCalledTimes(1);
    expect(h.requestEmbeddings.mock.calls[0][1]).toMatchObject({
      modelKey: "issue_embedding_model",
      feature: "issue_embedding",
      record: { billTo: { userId: "u1" } },
    });
    expect(h.addIssueRelation).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "u1", sourceId: "subject", targetId: "c2", type: "related", viaSmartFill: true,
    }));
    expect(h.upserts[0][0]).toMatchObject({ verdict: "related", relation_id: "rel-c2" });
  });

  it("reuses an unchanged vector without a second embedding charge", async () => {
    indexRow("subject", [1, 0, 0]);
    await pass();
    expect(h.requestEmbeddings).not.toHaveBeenCalled();
  });

  it("never compares vectors of another index version", async () => {
    issue("c2", "Unrelated wording entirely");
    indexRow("c2", [1, 0, 0], "openai:text-embedding-3-large:3");
    const result = await pass();
    expect(result.skipped).toBe("no_candidates");
    expect(h.runDecision).not.toHaveBeenCalled();
  });

  it("does nothing billable once the account opted out of both halves", async () => {
    h.meta = { issue_indexing: false, smart_fill_relations: false };
    const result = await pass();
    expect(result.skipped).toBe("opted_out");
    expect(h.requestEmbeddings).not.toHaveBeenCalled();
    expect(h.runDecision).not.toHaveBeenCalled();
  });

  it("falls back to lexical candidates without indexing, and generates no vector", async () => {
    h.meta = { issue_indexing: false };
    issue("c3", "SSO login provider migration", "Switch the sign-in auth provider.");
    h.decision = { candidate_1: { value: "none", probability: null, confidence: null } };

    const result = await pass();

    expect(h.requestEmbeddings).not.toHaveBeenCalled();
    expect(h.runDecision).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ indexed: false, candidates: 1, applied: 0 });
    expect(h.addIssueRelation).not.toHaveBeenCalled();
  });

  it("skips the decision when no candidate exists", async () => {
    const result = await pass();
    expect(result.skipped).toBe("no_candidates");
    expect(h.runDecision).not.toHaveBeenCalled();
  });

  it("leaves pairs the team already linked, and pairs whose applied link was removed", async () => {
    issue("c2", "Single sign-on for enterprise customers");
    issue("c4", "SSO for the admin console");
    indexRow("c2", [0.95, 0.05, 0]);
    indexRow("c4", [0.9, 0.1, 0]);
    h.relations = [{ id: "r1", source_id: "c2", target_id: "subject", type: "blocks" }];
    h.inferences = [{ issue_id: "c4", candidate_id: "subject", issue_version: "old", candidate_version: "old",
      verdict: "related", relation_id: null, applied_at: "2026-10-01T00:00:00Z" }];
    const result = await pass();
    expect(result.skipped).toBe("no_candidates");
    expect(h.runDecision).not.toHaveBeenCalled();
  });

  it("drops a decision made on content that changed meanwhile", async () => {
    issue("c2", "Single sign-on for enterprise customers");
    indexRow("c2", [0.95, 0.05, 0]);
    h.decision = { candidate_1: { value: "related", probability: null, confidence: null } };
    h.staleTitle = "Edited while deciding";
    const result = await pass();
    expect(result.skipped).toBe("stale_content");
    expect(h.addIssueRelation).not.toHaveBeenCalled();
  });

  it("refuses a dependency that would close a blocking cycle", async () => {
    issue("c2", "Identity provider contract");
    issue("c5", "Something in between");
    indexRow("c2", [0.95, 0.05, 0]);
    // subject → c5 → c2 already: "subject blocked_by c2" would store c2 → subject.
    h.relations = [
      { id: "r1", source_id: "subject", target_id: "c5", type: "blocks" },
      { id: "r2", source_id: "c5", target_id: "c2", type: "blocks" },
    ];
    h.decision = { candidate_1: { value: "blocked_by", probability: null, confidence: null } };
    const result = await pass();
    expect(result.applied).toBe(0);
    expect(h.addIssueRelation).not.toHaveBeenCalled();
    expect(h.upserts[0][0]).toMatchObject({ verdict: "blocked_by", relation_id: null, applied_at: null });
  });

  it("reuses a cached verdict on unchanged content instead of paying again", async () => {
    issue("c2", "Single sign-on for enterprise customers");
    indexRow("subject", [1, 0, 0]);
    indexRow("c2", [0.95, 0.05, 0]);
    h.inferences = [{ issue_id: "subject", candidate_id: "c2", issue_version: "v-subject", candidate_version: "v-c2",
      verdict: "none", relation_id: null, applied_at: null }];
    const result = await pass();
    expect(h.runDecision).not.toHaveBeenCalled();
    expect(result).toMatchObject({ candidates: 1, decided: 0, applied: 0 });
  });

  it("keeps the issue usable when the budget is exhausted", async () => {
    h.budget = false;
    issue("c3", "SSO login provider migration", "Switch the sign-in auth provider.");
    const result = await pass();
    expect(h.requestEmbeddings).not.toHaveBeenCalled();
    expect(h.runDecision).not.toHaveBeenCalled();
    expect(result.skipped).toBe("budget_exhausted");
  });

  it("survives a provider failure on the index", async () => {
    h.requestEmbeddings.mockResolvedValue(null);
    const result = await pass();
    expect(result.indexed).toBe(false);
    expect(result.skipped).toBe("no_candidates");
  });

  it("keeps another embedding space of the same text and drops the ones of former text", async () => {
    const hash = contentFingerprint("Add SSO login", "Use the new auth provider for sign-in.");
    h.embeddings.push(
      { issue_id: "subject", project_id: "p1", index_version: "openai:text-embedding-3-small:3", content_version: "byok",
        dimensions: 3, embedding: [1, 0, 0], content_hash: hash },
      { issue_id: "subject", project_id: "p1", index_version: "google:gemini-embedding-001:3", content_version: "old",
        dimensions: 3, embedding: [0, 1, 0], content_hash: "former-text" },
    );
    await pass();
    expect(h.requestEmbeddings).toHaveBeenCalledTimes(1);
    const [, , stale] = h.writeIssueEmbedding.mock.calls[0];
    expect(stale).toEqual(["google:gemini-embedding-001:3"]);
  });

  it("does not write a vector of text that changed while the embedding call ran", async () => {
    h.raceTitle = "Edited during the call";
    await pass();
    expect(h.requestEmbeddings).toHaveBeenCalledTimes(1);
    expect(h.writeIssueEmbedding).not.toHaveBeenCalled();
  });

  it("drops vectors of former text without paying when indexing is off", async () => {
    h.meta = { issue_indexing: false, smart_fill_relations: false };
    indexRow("subject", [1, 0, 0]);
    h.embeddings[0].content_hash = "former-text";
    const result = await pass();
    expect(result.skipped).toBe("opted_out");
    expect(h.deleted).toEqual([`subject@${VERSION}`]);
    expect(h.requestEmbeddings).not.toHaveBeenCalled();
  });

  it("respects the author's indexing refusal when someone else edits the issue", async () => {
    issue("subject", "Add SSO login", "Use the new auth provider for sign-in.", "todo", "author");
    h.metaByUser.author = { issue_indexing: false };
    await pass();
    expect(h.requestEmbeddings).not.toHaveBeenCalled();
  });

  it("re-decides a candidate whose vector predates its current text", async () => {
    issue("c2", "Single sign-on for enterprise customers");
    indexRow("subject", [1, 0, 0]);
    indexRow("c2", [0.95, 0.05, 0]);
    // c2 was edited without reindexing: its stored fingerprint is outdated.
    h.embeddings[1].content_hash = "former-text";
    h.inferences = [{ issue_id: "subject", candidate_id: "c2", issue_version: "v-subject", candidate_version: "v-c2",
      verdict: "none", relation_id: null, applied_at: null }];
    h.decision = { candidate_1: { value: "related", probability: null, confidence: null } };
    const result = await pass();
    expect(h.runDecision).toHaveBeenCalledTimes(1);
    expect(result.applied).toBe(1);
    expect(h.upserts[0][0].candidate_version).not.toBe("v-c2");
  });

  it("applies at most three relations in one pass", async () => {
    const decision: Record<string, { value: string; probability: null; confidence: null }> = {};
    for (let i = 0; i < 5; i++) {
      issue(`c${i + 10}`, `SSO variant ${i}`);
      indexRow(`c${i + 10}`, [1, 0.01 * (i + 1), 0]);
      decision[`candidate_${i + 1}`] = { value: "related", probability: null, confidence: null };
    }
    h.decision = decision;
    const result = await pass();
    expect(result).toMatchObject({ candidates: 5, applied: 3 });
    expect(h.addIssueRelation).toHaveBeenCalledTimes(3);
    expect(h.upserts[0]).toHaveLength(5);
  });
});

describe("runIssueAiPass — review fixes", () => {
  it("leaves a pair someone linked while the decision ran", async () => {
    issue("c2", "Single sign-on for enterprise customers");
    indexRow("c2", [0.95, 0.05, 0]);
    h.decision = { candidate_1: { value: "related", probability: null, confidence: null } };
    h.runDecision.mockImplementation(async () => {
      // The creation dialog posts its chosen relation meanwhile.
      h.relations = [{ id: "manual", source_id: "subject", target_id: "c2", type: "blocks" }];
      return { engine: "llm", answers: h.decision, confidence: 1, fallbackReason: null };
    });
    const result = await pass();
    expect(result.applied).toBe(0);
    expect(h.addIssueRelation).not.toHaveBeenCalled();
  });

  it("does not store unreusable verdicts of throwaway versions", async () => {
    h.meta = { issue_indexing: false };
    issue("c3", "SSO login provider migration", "Switch the sign-in auth provider.");
    h.decision = { candidate_1: { value: "none", probability: null, confidence: null } };
    await pass();
    expect(h.runDecision).toHaveBeenCalledTimes(1);
    expect(h.upserts).toEqual([]);
  });
});

describe("runIssueIndexBackfill", () => {
  it("indexes for the project owner, skips authors who refused, re-encodes clear rows and saves its cursor", async () => {
    issue("c2", "Second issue", null, "todo", "member");
    issue("c3", "Third issue", null, "todo", "refuser");
    h.metaByUser.refuser = { issue_indexing: false };
    indexRow("c2", [0, 1, 0]);
    h.embeddings[0].stored_clear = true;
    h.reencodeClearEmbedding.mockResolvedValue(true);

    const result = await runIssueIndexBackfill(100);

    expect(result).toMatchObject({ scanned: 3, reencoded: 1, wrapped: true });
    const texts = h.requestEmbeddings.mock.calls.flatMap((call) => call[0] as string[]);
    expect(texts.some((text) => text.startsWith("Third issue"))).toBe(false);
    expect(h.requestEmbeddings.mock.calls[0][1]).toMatchObject({ billedUserId: "owner" });
    expect(h.cursor).toBe("");
  });

  it("resumes after the last issue of a full page", async () => {
    issue("c2", "Second issue");
    await runIssueIndexBackfill(1);
    expect(h.cursor).toBe("c2");
  });
});
