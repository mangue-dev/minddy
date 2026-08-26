import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Code Agent Tools TICKET. Two layers are tested here:
 * - MIN-111: `read_resource` on a model must RETURN the image, in data
 * URL (the signed URL expires in 10 min; the checkpoint is replayed much later),
 * and behave exactly as before as soon as one of the three conditions
 * missing: text model, format not showable, file too large.
 * - MIN-125: the tools target any ticket FROM THE PROJECT (`issue`), the
 * ticket from the run being only the default target; `update_issue` refuses
 * statuses; `create_issue` lands on the launcher's account setting.
 *
 * `resolveIssueRef` and `assertIssueInProject` are the REAL ones (it's the pinning to the
 * project we want to check): only the big readings of `issue-reads.ts`
 * are replaced.
 */

// ── Faux Supabase, par table ────────────────────────────────────────────────
// `.select().eq()…maybeSingle()` — the only form that resolveIssueRef uses,
// assertIssueInProject and reading an attachment.

// True uuid: `anchorIssueId` is `agent_runs.issue_id`, and the resolution of a
// reference distinguishes a uuid from a 'KEY-42' identifier on its FORM.
const ANCHOR_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "77777777-7777-4777-8777-777777777777";
const FOREIGN_ID = "22222222-2222-4222-8222-222222222222";

const TRASHED_ID = "33333333-3333-4333-8333-333333333333";

/** The stored plan of the anchor ticket — what append_to_plan and
 * edit_issue_text read before patching (MIN-186). */
const STORED_PLAN =
  "# Contexte\n\nLe plan de départ.\n\n## Tâches\n\n- [ ] Première tâche\n\n## Questions\n\n- [ ] Une question parquée\n";

const ISSUE_ROWS = [
  {
    id: ANCHOR_ID,
    number: 42,
    project_id: "proj-1",
    updated_at: "2026-08-26T00:00:00.000Z",
    plan: STORED_PLAN,
    description: "Une description de départ, à patcher.",
  },
  {
    id: OTHER_ID,
    number: 7,
    project_id: "proj-1",
    updated_at: "2026-08-26T00:00:00.000Z",
  },
  {
    id: FOREIGN_ID,
    number: 3,
    project_id: "proj-2",
    updated_at: "2026-08-26T00:00:00.000Z",
  },
  // MIN-133: same project, but in the trash — the agent should not see it.
  {
    id: TRASHED_ID,
    number: 9,
    project_id: "proj-1",
    deleted_at: "2026-07-01T00:00:00.000Z",
  },
];

/** Project Goals (MIN-287) — the target of `objective` on create/update. */
const OBJECTIVE_ID = "44444444-4444-4444-8444-444444444444";
const FOREIGN_OBJECTIVE_ID = "55555555-5555-4555-8555-555555555555";
const OBJECTIVE_ROWS = [
  { id: OBJECTIVE_ID, project_id: "proj-1", name: "Refonte du board", status: "in_progress" },
  { id: FOREIGN_OBJECTIVE_ID, project_id: "proj-2", name: "Ailleurs", status: "planned" },
];

const attachmentBase = {
  id: "att-1",
  issue_id: ANCHOR_ID,
  storage_path: "proj/issue/mockup.png",
  file_name: "mockup.png",
  mime_type: "image/png",
  size_bytes: 120 * 1024,
  comment_id: null,
};

let attachment: Record<string, unknown> | null = { ...attachmentBase };
let downloaded: Buffer | null = Buffer.from("PNGBYTES");

vi.mock("@/lib/supabase-service", () => {
  const rowFor = (table: string, filters: Record<string, unknown>) => {
    const rows =
      table === "issues"
        ? ISSUE_ROWS
        : table === "objectives"
          ? OBJECTIVE_ROWS
          : attachment
            ? [attachment]
            : [];
    return (
      rows.find((row) =>
        Object.entries(filters).every(
          // `?? null`: a column absent from the row is null, so that
          // `.is("deleted_at", null)` retains live lines well.
          ([column, value]) =>
            ((row as Record<string, unknown>)[column] ?? null) === value,
        ),
      ) ?? null
    );
  };
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};
    query.select = () => query;
    query.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    };
    // `.is("deleted_at", null)` — since MIN-133 any ticket reading discards
    // the baskets; the false one really applies the filter, otherwise the test will not
    // dirait rien de ce que voit l'agent.
    query.is = (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    };
    query.maybeSingle = async () => ({ data: rowFor(table, filters), error: null });
    return query;
  };
  return { getServiceClient: () => ({ from }) };
});

vi.mock("@/lib/server/attachments", () => ({
  signedAttachmentUrl: async () => "https://signed.example/mockup.png",
  downloadAttachment: async () => downloaded,
}));

const { safeFetch } = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/server/safe-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/safe-fetch")>();
  return { ...actual, safeFetch };
});

vi.mock("@/lib/server/auth-users", () => ({
  fetchAuthUsersById: async () => new Map(),
  toNamed: (u: unknown) => u,
}));

// `vi.mock` is placed at the top of the file: the spies must be there too.
const { getIssue, searchIssues, updateIssueFields, createIssueForProject } = vi.hoisted(
  () => ({
    getIssue: vi.fn(async () => ({
      issue: {
        id: ANCHOR_ID,
        title: "Un ticket",
        plan: null,
        assignee_id: null,
        resources: [] as Array<Record<string, unknown>>,
      },
      comments: [] as Array<Record<string, unknown>>,
      sub_issues: [],
      relations: [],
    })),
    searchIssues: vi.fn(async () => ({ issues: [{ identifier: "MIN-7" }] })),
    updateIssueFields: vi.fn(async () => ({ ok: true, issue: {} })),
    createIssueForProject: vi.fn(async () => ({
      ok: true,
      issue: { id: "new-1", number: 99 },
    })),
  }),
);

vi.mock("@/lib/server/issue-reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/issue-reads")>();
  return { ...actual, getIssue, searchIssues };
});
vi.mock("@/lib/server/update-issue", () => ({
  updateIssueFields,
  MAX_DESCRIPTION_LENGTH: 65_536,
}));
vi.mock("@/lib/server/create-issue", () => ({ createIssueForProject }));

import { executeIssueTool, type IssueToolContext } from "./issue-tools";
import type { NumoDefaultStatus } from "@/lib/numo-default-status";
import { SafeFetchError } from "@/lib/server/safe-fetch";

const ctx = (over: Partial<IssueToolContext> = {}): IssueToolContext => ({
  anchorIssueId: ANCHOR_ID,
  projectId: "proj-1",
  projectKey: "MIN",
  actorId: "user-1",
  numoDefaultStatus: "triage",
  imageInput: false,
  ...over,
});

const read = (imageInput: boolean) =>
  executeIssueTool(ctx({ imageInput }), "read_resource", { resource_id: "att-1" });

beforeEach(() => {
  attachment = { ...attachmentBase };
  downloaded = Buffer.from("PNGBYTES");
  vi.clearAllMocks();
});

describe("read_resource link network policy", () => {
  const storedUrl = "https://public.example/spec";

  beforeEach(() => {
    attachment = {
      ...attachmentBase,
      kind: "link",
      url: storedUrl,
      file_name: "External specification",
      storage_path: null,
      mime_type: null,
      size_bytes: 0,
    };
  });

  it("fetches link content through the capped guarded client without exposing the URL", async () => {
    safeFetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      url: new URL("https://redirect.example/spec"),
      bytes: Buffer.from("<h1>Deployment guide</h1>"),
      truncated: false,
    });

    const out = await read(false);

    expect(out.success).toBe(true);
    expect(out.result).toMatchObject({
      kind: "link",
      title: "External specification",
      http_status: 200,
      content_type: "text/html",
      content: "<h1>Deployment guide</h1>",
    });
    expect(JSON.stringify(out.result)).not.toContain(storedUrl);
    expect(JSON.stringify(out.result)).not.toContain("redirect.example");
    expect(safeFetch).toHaveBeenCalledWith(
      storedUrl,
      expect.objectContaining({
        maxBytes: 256 * 1024,
        onOverflow: "truncate",
        maxRedirects: 3,
        timeoutMs: 10_000,
      }),
    );
  });

  it("fails closed when the destination or a redirect hop violates policy", async () => {
    safeFetch.mockRejectedValue(new SafeFetchError("url"));

    const out = await read(false);

    expect(out.success).toBe(false);
    expect(out.result).toEqual({ error: "Link target is blocked by the outbound network policy." });
    expect(JSON.stringify(out.result)).not.toContain(storedUrl);
  });

  it("removes link destinations from live issue and comment resource summaries", async () => {
    getIssue.mockResolvedValueOnce({
      issue: {
        id: ANCHOR_ID,
        title: "Un ticket",
        plan: null,
        assignee_id: null,
        resources: [{ id: "link-1", kind: "link", url: storedUrl, title: "Spec" }],
      },
      comments: [
        {
          id: "comment-1",
          body: "See the resource.",
          resources: [{ id: "link-2", kind: "link", url: storedUrl, title: "Spec" }],
        },
      ],
      sub_issues: [],
      relations: [],
    });

    const out = await executeIssueTool(ctx(), "read_issue", {});

    expect(out.success).toBe(true);
    expect(JSON.stringify(out.result)).not.toContain(storedUrl);
    expect(out.result).toMatchObject({
      issue: { resources: [{ id: "link-1", kind: "link", title: "Spec" }] },
      comments: [
        { resources: [{ id: "link-2", kind: "link", title: "Spec" }] },
      ],
    });
  });
});

describe("read_resource sur une image", () => {
  it("renvoie l'image en data URL quand le modèle la voit", async () => {
    const out = await read(true);
    expect(out.success).toBe(true);
    expect(out.images).toHaveLength(1);
    expect(out.images![0].url).toBe(`data:image/png;base64,${Buffer.from("PNGBYTES").toString("base64")}`);
    expect(out.images![0].name).toBe("mockup.png");
    // The bytes are NOT in `result`: it goes into JSON in the event and the message.
    expect(JSON.stringify(out.result)).not.toContain("base64");
    expect(JSON.stringify(out.result)).toContain("mockup.png");
  });

  it("ne change RIEN sur un run non multimodal", async () => {
    const out = await read(false);
    expect(out.images).toBeUndefined();
    expect(out.result).toMatchObject({ file_name: "mockup.png" });
    expect(JSON.stringify(out.result)).toContain("content_omitted");
    expect(JSON.stringify(out.result)).toContain("download_url");
  });

  it("refuse une image trop lourde, en le disant, et donne l'URL de repli", async () => {
    attachment = { ...attachmentBase, size_bytes: 5 * 1024 * 1024 };
    const out = await read(true);
    expect(out.images).toBeUndefined();
    expect(JSON.stringify(out.result)).toContain("image_omitted");
    expect(JSON.stringify(out.result)).toContain("download_url");
  });

  it("retombe sur l'URL signée quand le téléchargement échoue", async () => {
    downloaded = null;
    const out = await read(true);
    expect(out.images).toBeUndefined();
    expect(JSON.stringify(out.result)).toContain("content_omitted");
  });

  it("laisse les formats non montrables au chemin binaire", async () => {
    for (const mime of ["image/heic", "image/tiff", "application/pdf"]) {
      attachment = { ...attachmentBase, mime_type: mime, file_name: `f.${mime.split("/")[1]}` };
      const out = await read(true);
      expect(out.images).toBeUndefined();
      expect(JSON.stringify(out.result)).toContain("content_omitted");
    }
  });

  it("garde la lecture inline du texte intacte", async () => {
    attachment = { ...attachmentBase, mime_type: "text/markdown", file_name: "spec.md", size_bytes: 8 };
    downloaded = Buffer.from("# Spec");
    const out = await read(true);
    expect(out.images).toBeUndefined();
    expect(out.result).toMatchObject({ content: "# Spec" });
  });

  it("refuse une pièce jointe qui n'existe pas", async () => {
    attachment = null;
    const out = await read(true);
    expect(out.success).toBe(false);
    expect(out.images).toBeUndefined();
  });
});

/**
 * MIN-125: the attachment is framed to the PROJECT of the run, no longer to the only anchor ticket
 * - otherwise the `resource_id` that `read_issue` returns on another
 * ticket would not be openable by anything.
 */
describe("read_resource — périmètre projet", () => {
  it("ouvre une pièce d'un AUTRE ticket du même projet", async () => {
    attachment = { ...attachmentBase, issue_id: OTHER_ID };
    const out = await read(true);
    expect(out.success).toBe(true);
    expect(out.images).toHaveLength(1);
  });

  it("refuse une pièce d'un ticket d'un AUTRE projet", async () => {
    attachment = { ...attachmentBase, issue_id: FOREIGN_ID };
    const out = await read(true);
    expect(out.success).toBe(false);
    expect(JSON.stringify(out.result)).toContain("not found in this project");
  });
});

/**
 * MIN-275: A resource can be a wiki PAGE. It has neither bytes nor
 * address - what `read_resource` renders is enough to open the document
 * with `read_page`, and especially the title LIVING (a renamed page must not
 * return under its old name, which is no longer in any sidebar).
 */
describe("read_resource sur une page du wiki", () => {
  const pageRow = (over: Record<string, unknown> = {}) => ({
    id: "att-1",
    issue_id: ANCHOR_ID,
    project_id: "proj-1",
    kind: "page",
    page_id: "55555555-5555-4555-8555-555555555555",
    storage_path: null,
    url: null,
    file_name: "Ancien titre",
    mime_type: "application/vnd.minddy.page",
    size_bytes: 0,
    comment_id: null,
    page: {
      id: "55555555-5555-4555-8555-555555555555",
      title: "Spécification des pages",
      deleted_at: null,
    },
    ...over,
  });

  it("rend l'id et le titre vivant, et renvoie vers read_page", async () => {
    attachment = pageRow();
    const out = await read(true);
    expect(out.success).toBe(true);
    expect(out.images).toBeUndefined();
    expect(out.result).toMatchObject({
      kind: "page",
      page_id: "55555555-5555-4555-8555-555555555555",
      title: "Spécification des pages",
      read_with: "read_page",
    });
    // No signed URL: there is no object in the bucket.
    expect(JSON.stringify(out.result)).not.toContain("download_url");
  });

  it("dit qu'une page est à la corbeille, en retombant sur le titre de la ligne", async () => {
    attachment = pageRow({
      page: {
        id: "55555555-5555-4555-8555-555555555555",
        title: "",
        deleted_at: "2026-08-01T00:00:00.000Z",
      },
    });
    const out = await read(true);
    expect(out.result).toMatchObject({
      title: "Ancien titre",
      page_in_trash: true,
    });
  });
});

describe("update_issue — les statuts restent manuels", () => {
  it("refuse `status`, sans rien écrire", async () => {
    const out = await executeIssueTool(ctx(), "update_issue", {
      title: "Nouveau titre",
      status: "done",
    });
    expect(out.success).toBe(false);
    expect(String((out.result as { error: string }).error)).toMatch(/status/i);
    expect(updateIssueFields).not.toHaveBeenCalled();
  });

  it("refuse `priority`, sans rien écrire", async () => {
    const out = await executeIssueTool(ctx(), "update_issue", {
      title: "Nouveau titre",
      priority: "urgent",
    });
    expect(out.success).toBe(false);
    expect(String((out.result as { error: string }).error)).toMatch(/priority/i);
    expect(updateIssueFields).not.toHaveBeenCalled();
  });

  it("refuse un appel sans aucun champ écrivable", async () => {
    const out = await executeIssueTool(ctx(), "update_issue", {});
    expect(out.success).toBe(false);
    expect(updateIssueFields).not.toHaveBeenCalled();
  });

  it("écrit titre, description et effort sur le ticket VISÉ", async () => {
    const out = await executeIssueTool(ctx(), "update_issue", {
      issue: "MIN-7",
      title: "Renommé",
      effort: "m",
    });
    expect(out.success).toBe(true);
    expect(updateIssueFields).toHaveBeenCalledWith({
      issueId: OTHER_ID,
      actorId: "user-1",
      input: { title: "Renommé", effort: "m" },
      viaAssistant: true,
    });
    expect(out.result).toMatchObject({ identifier: "MIN-7", changed: ["title", "effort"] });
  });

  it("accepte `effort: null` pour effacer l'estimation", async () => {
    const out = await executeIssueTool(ctx(), "update_issue", { effort: null });
    expect(out.success).toBe(true);
    expect(updateIssueFields).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: ANCHOR_ID, input: { effort: null } }),
    );
  });
});

describe("read_issue — cible par défaut et ciblage explicite", () => {
  it("lit le ticket du run quand `issue` est absent", async () => {
    const out = await executeIssueTool(ctx(), "read_issue", {});
    expect(out.success).toBe(true);
    expect(getIssue).toHaveBeenCalledWith(expect.anything(), { issue_id: ANCHOR_ID });
  });

  it("résout `MIN-7` et ne lit PAS le ticket d'ancrage", async () => {
    const out = await executeIssueTool(ctx(), "read_issue", { issue: "MIN-7" });
    expect(out.success).toBe(true);
    expect(getIssue).toHaveBeenCalledWith(expect.anything(), { issue_id: OTHER_ID });
    expect((out.result as { issue: { identifier: string } }).issue.identifier).toBe("MIN-7");
  });

  it("sans ancrage ni `issue`, renvoie vers search_issues", async () => {
    const out = await executeIssueTool(ctx({ anchorIssueId: null }), "read_issue", {});
    expect(out.success).toBe(false);
    expect(String((out.result as { error: string }).error)).toMatch(/search_issues/);
    expect(getIssue).not.toHaveBeenCalled();
  });

  it("refuse un identifiant d'un autre projet", async () => {
    const out = await executeIssueTool(ctx(), "read_issue", { issue: "ACME-3" });
    expect(out.success).toBe(false);
    expect(String((out.result as { error: string }).error)).toMatch(/doesn't match this project/);
    expect(getIssue).not.toHaveBeenCalled();
  });

  // MIN-133 — a ticket in the trash does not exist for the agent:
  // it no longer has to read it, much less work on it.
  it("ne résout pas un ticket mis à la corbeille", async () => {
    const out = await executeIssueTool(ctx(), "read_issue", { issue: "MIN-9" });
    expect(out.success).toBe(false);
    expect(getIssue).not.toHaveBeenCalled();
  });
});

describe("create_issue — le statut d'atterrissage vient du compte du lanceur", () => {
  for (const status of ["triage", "backlog", "todo"] as NumoDefaultStatus[]) {
    it(`pose '${status}' sur un run de ticket`, async () => {
      const out = await executeIssueTool(
        ctx({ numoDefaultStatus: status }),
        "create_issue",
        { title: "Nouveau ticket" },
      );
      expect(out.success).toBe(true);
      expect(createIssueForProject).toHaveBeenCalledWith(
        expect.objectContaining({ input: expect.objectContaining({ status }) }),
      );
      expect(out.result).toMatchObject({
        issue: { identifier: "MIN-99", title: "Nouveau ticket", status },
      });
    });

    it(`pose '${status}' sur un run de CARNET (plus de 'todo' en dur)`, async () => {
      await executeIssueTool(
        ctx({ anchorIssueId: null, numoDefaultStatus: status }),
        "create_issue",
        { title: "Depuis une note" },
      );
      expect(createIssueForProject).toHaveBeenCalledWith(
        expect.objectContaining({ input: expect.objectContaining({ status }) }),
      );
    });
  }
});

/**
 * MIN-287 — ATTACHMENT to a goal. A ticket created or modified without
 * objective is outside of any progress bar and outside the filling of
 * cycle: it is this hole that these three cases close, at the two write gates
 * and in reading.
 */
describe("objectif d'un ticket", () => {
  it("create_issue rattache le ticket à l'objectif visé", async () => {
    const out = await executeIssueTool(ctx(), "create_issue", {
      title: "Nouveau ticket",
      objective: OBJECTIVE_ID,
    });
    expect(out.success).toBe(true);
    expect(createIssueForProject).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ objective_id: OBJECTIVE_ID }),
      }),
    );
    expect(out.result).toMatchObject({ issue: { objective_id: OBJECTIVE_ID } });
  });

  it("create_issue sans objectif le DIT, plutôt que de le taire", async () => {
    const out = await executeIssueTool(ctx(), "create_issue", { title: "Orphelin" });
    expect(out.success).toBe(true);
    expect(JSON.stringify(out.result)).toMatch(/no objective/i);
  });

  it("create_issue refuse un objectif d'un autre projet, sans rien créer", async () => {
    const out = await executeIssueTool(ctx(), "create_issue", {
      title: "Ticket",
      objective: FOREIGN_OBJECTIVE_ID,
    });
    expect(out.success).toBe(false);
    expect(createIssueForProject).not.toHaveBeenCalled();
  });

  it("update_issue attache et détache", async () => {
    const attach = await executeIssueTool(ctx(), "update_issue", {
      objective: OBJECTIVE_ID,
    });
    expect(attach.success).toBe(true);
    expect(updateIssueFields).toHaveBeenCalledWith(
      expect.objectContaining({ input: { objective_id: OBJECTIVE_ID } }),
    );

    vi.clearAllMocks();
    const detach = await executeIssueTool(ctx(), "update_issue", { objective: null });
    expect(detach.success).toBe(true);
    expect(updateIssueFields).toHaveBeenCalledWith(
      expect.objectContaining({ input: { objective_id: null } }),
    );
  });

  it("read_issue nomme l'objectif du ticket au lieu d'un uuid muet", async () => {
    getIssue.mockResolvedValueOnce({
      issue: {
        id: ANCHOR_ID,
        title: "Un ticket",
        plan: null,
        assignee_id: null,
        objective_id: OBJECTIVE_ID,
      },
      comments: [],
      sub_issues: [],
      relations: [],
    } as never);
    const out = await executeIssueTool(ctx(), "read_issue", {});
    expect(out.success).toBe(true);
    expect((out.result as { issue: Record<string, unknown> }).issue.objective).toMatchObject({
      id: OBJECTIVE_ID,
      name: "Refonte du board",
      status: "in_progress",
    });
  });

  it("read_issue dit qu'un ticket sans objectif est hors de toute barre", async () => {
    const out = await executeIssueTool(ctx(), "read_issue", {});
    const issue = (out.result as { issue: Record<string, unknown> }).issue;
    expect(issue.objective).toBeNull();
    expect(String(issue.objective_note)).toMatch(/progress bar/i);
  });
});

describe("search_issues", () => {
  it("passe la requête au cœur partagé et renvoie les lignes telles quelles", async () => {
    const out = await executeIssueTool(ctx(), "search_issues", { query: "recherche" });
    expect(out.success).toBe(true);
    expect(searchIssues).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1", projectKey: "MIN" }),
      { query: "recherche" },
    );
    expect(out.result).toEqual({ issues: [{ identifier: "MIN-7" }] });
  });
});

describe("write_issue_plan — ciblable", () => {
  it("écrit le plan du ticket visé et rend son identifiant", async () => {
    const out = await executeIssueTool(ctx(), "write_issue_plan", {
      issue: "7",
      plan: "# Plan\n\n- [ ] Faire la chose",
    });
    expect(out.success).toBe(true);
    expect(updateIssueFields).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: OTHER_ID,
        expectedUpdatedAt: "2026-08-26T00:00:00.000Z",
      }),
    );
    expect(out.result).toMatchObject({ identifier: "MIN-7", tasks: 1 });
  });
});

/**
 * MIN-186: The code agent could only touch the plan by REISSUEING
 * (`write_issue_plan`), which silently destroys the task states and this
 * that someone else wrote in the meantime. These two tools surgically write,
 * on the same core as the MCP and Numo.
 */
/** The field written by the LAST call to updateIssueFields. Hoisted spies
 * do not have a typed signature: we return it here, once. */
const lastWrite = (): Record<string, unknown> => {
  const calls = updateIssueFields.mock.calls as unknown as Array<
    [{ input: Record<string, unknown> }]
  >;
  return calls[calls.length - 1][0].input;
};

describe("append_to_plan — faire grossir un plan sans le réémettre", () => {
  it("ajoute le bloc AU-DESSUS des questions, sans toucher au reste", async () => {
    const out = await executeIssueTool(ctx(), "append_to_plan", {
      markdown: "- [ ] Deuxième tâche, découverte en route",
    });
    expect(out.success).toBe(true);
    const written = lastWrite().plan as string;
    expect(written).toContain("Le plan de départ.");
    expect(written).toContain("- [ ] Première tâche");
    expect(written.indexOf("Deuxième tâche")).toBeLessThan(
      written.indexOf("## Questions"),
    );
    // The indexes returned are those that the model will reuse immediately afterwards.
    expect(out.result).toMatchObject({
      identifier: "MIN-42",
      plan_progress: { done: 0, total: 2 },
    });
  });

  it("vise une section existante, et refuse une section inconnue", async () => {
    const parked = await executeIssueTool(ctx(), "append_to_plan", {
      markdown: "- [ ] Deuxième question",
      section: "Questions",
    });
    expect(parked.success).toBe(true);
    // A question is not work: the total does not change.
    expect(parked.result).toMatchObject({ plan_progress: { done: 0, total: 1 } });

    updateIssueFields.mockClear();
    const nope = await executeIssueTool(ctx(), "append_to_plan", {
      markdown: "- [ ] perdu",
      section: "Section inexistante",
    });
    expect(nope.success).toBe(false);
    expect(String((nope.result as { error: string }).error)).toContain("read_issue");
    expect(updateIssueFields).not.toHaveBeenCalled();
  });

  it("écrit sur le ticket VISÉ, pas sur celui du run", async () => {
    const out = await executeIssueTool(ctx(), "append_to_plan", {
      issue: "7",
      markdown: "- [ ] Sur l'autre ticket",
    });
    // MIN-7 has no stored plan: the block becomes the plan.
    expect(out.success).toBe(true);
    expect(updateIssueFields).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: OTHER_ID }),
    );
  });
});

describe("edit_issue_text — corriger un passage en place", () => {
  it("réécrit une phrase du plan et laisse le reste au byte près", async () => {
    const out = await executeIssueTool(ctx(), "edit_issue_text", {
      field: "plan",
      old_string: "Le plan de départ.",
      new_string: "Le plan de départ, corrigé.",
    });
    expect(out.success).toBe(true);
    const written = lastWrite().plan as string;
    expect(written).toContain("Le plan de départ, corrigé.");
    expect(written).toContain("- [ ] Une question parquée");
    expect(out.result).toMatchObject({ field: "plan", additions: 1, deletions: 1 });
  });

  it("patche aussi la description, et ne rend alors pas de tâches", async () => {
    const out = await executeIssueTool(ctx(), "edit_issue_text", {
      field: "description",
      old_string: "à patcher",
      new_string: "patchée",
    });
    expect(out.success).toBe(true);
    expect(lastWrite()).toEqual({
      description: "Une description de départ, patchée.",
    });
    expect((out.result as Record<string, unknown>).plan_tasks).toBeUndefined();
  });

  it("refuse BRUYAMMENT un passage périmé, sans rien écrire", async () => {
    updateIssueFields.mockClear();
    const out = await executeIssueTool(ctx(), "edit_issue_text", {
      field: "plan",
      old_string: "Une phrase que le plan ne porte plus",
      new_string: "n'importe quoi",
    });
    expect(out.success).toBe(false);
    expect(updateIssueFields).not.toHaveBeenCalled();
    // And the message refers to rereading, never to a file.
    // And the message names the AGENT tools, not the MCP ones.
    const error = String((out.result as { error: string }).error);
    expect(error).toContain("read_issue");
    expect(error).not.toMatch(/write_file|minddy_/);
  });

  it("refuse un `field` hors des deux textes du ticket", async () => {
    updateIssueFields.mockClear();
    const out = await executeIssueTool(ctx(), "edit_issue_text", {
      field: "title",
      old_string: "a",
      new_string: "b",
    });
    expect(out.success).toBe(false);
    expect(updateIssueFields).not.toHaveBeenCalled();
  });
});

/**
 * MIN-247 — A TEXT ATTACHMENT NO LONGER LOSE ITS END.
 *
 * The cut was done by the HEAD: on a log, a trace or an export — this
 * which is almost always placed on a ticket — it is the end which carries the
 * verdict. This is exactly the default that MIN-107 named for `run_command`
 * and which was never ported here.
 */
describe("read_resource sur un texte trop long", () => {
  it("garde le DÉBUT et la FIN, et dit que c'est le milieu qui manque", async () => {
    attachment = {
      ...attachmentBase,
      mime_type: "text/plain",
      file_name: "run.log",
      size_bytes: 50_000,
    };
    const body = `PREMIÈRE LIGNE\n${"remplissage\n".repeat(2_000)}DERNIÈRE LIGNE`;
    downloaded = Buffer.from(body, "utf8");

    const out = await executeIssueTool(ctx(), "read_resource", { resource_id: "att-1" });
    const result = out.result as { content: string; content_note?: string };

    expect(result.content).toContain("PREMIÈRE LIGNE");
    expect(result.content).toContain("DERNIÈRE LIGNE");
    expect(result.content).toContain("chars elided");
    expect(result.content_note).toContain("MIDDLE");
    // And the path of the entire file remains: the signed URL, then read_file.
    expect(result.content_note).toContain("read_file");
  });

  it("ne touche pas à un texte qui tient en entier", async () => {
    attachment = {
      ...attachmentBase,
      mime_type: "text/plain",
      file_name: "note.txt",
      size_bytes: 20,
    };
    downloaded = Buffer.from("court et complet", "utf8");

    const out = await executeIssueTool(ctx(), "read_resource", { resource_id: "att-1" });
    const result = out.result as { content: string; content_note?: string };
    expect(result.content).toBe("court et complet");
    expect(result.content_note).toBeUndefined();
  });
});

/**
 * THE HOLE THAT MIN-287 FOUND IN PASSING: `search_pages` was served to model
 * and routed to `executeIssueTool` by `ISSUE_TOOL_NAMES`, but missing from its
 * `switch` — every call went back to “Unknown issue tool”. An unrouted tool served and
 * is not seen in any schema test or in any executor test:
 * the fault only exists BETWEEN the two tables. Hence this case, which confronts them.
 */
describe("routage — tout nom servi est un nom exécuté", () => {
  it("chaque nom d'ISSUE_TOOL_NAMES a sa branche dans executeIssueTool", async () => {
    const [{ ISSUE_TOOL_NAMES }, { readFile }] = await Promise.all([
      import("./platform-tool-names"),
      import("node:fs/promises"),
    ]);
    const source = await readFile(new URL("./issue-tools.ts", import.meta.url), "utf8");
    const routed = new Set(
      [...source.matchAll(/case "([a-z_]+)":/g)].map((m) => m[1]),
    );
    for (const name of ISSUE_TOOL_NAMES) {
      expect(routed, `${name} est servi mais jamais routé`).toContain(name);
    }
  });
});
