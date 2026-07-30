import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tools TICKET de l'agent de code. Deux couches sont testées ici :
 *  - MIN-111 : `read_attachment` sur une maquette doit RENVOYER l'image, en data
 *    URL (l'URL signée expire en 10 min ; le checkpoint est rejoué bien plus tard),
 *    et se comporter exactement comme avant dès que l'une des trois conditions
 *    manque : modèle texte, format non montrable, fichier trop lourd.
 *  - MIN-125 : les tools visent n'importe quel ticket DU PROJET (`issue`), le
 *    ticket du run n'étant que la cible par défaut ; `update_issue` refuse les
 *    statuts ; `create_issue` atterrit sur le réglage de compte du lanceur.
 *
 * `resolveIssueRef` et `assertIssueInProject` sont les VRAIS (c'est l'épinglage au
 * projet qu'on veut vérifier) : seules les grosses lectures de `issue-reads.ts`
 * sont remplacées.
 */

// ── Faux Supabase, par table ────────────────────────────────────────────────
// `.select().eq()…maybeSingle()` — la seule forme qu'utilisent resolveIssueRef,
// assertIssueInProject et la lecture d'une pièce jointe.

// Vrais uuid : `anchorIssueId` est `agent_runs.issue_id`, et la résolution d'une
// référence distingue un uuid d'un identifiant 'KEY-42' sur sa FORME.
const ANCHOR_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "77777777-7777-4777-8777-777777777777";
const FOREIGN_ID = "22222222-2222-4222-8222-222222222222";

const ISSUE_ROWS = [
  { id: ANCHOR_ID, number: 42, project_id: "proj-1" },
  { id: OTHER_ID, number: 7, project_id: "proj-1" },
  { id: FOREIGN_ID, number: 3, project_id: "proj-2" },
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
      table === "issues" ? ISSUE_ROWS : attachment ? [attachment] : [];
    return (
      rows.find((row) =>
        Object.entries(filters).every(
          ([column, value]) => (row as Record<string, unknown>)[column] === value,
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
    query.maybeSingle = async () => ({ data: rowFor(table, filters), error: null });
    return query;
  };
  return { getServiceClient: () => ({ from }) };
});

vi.mock("@/lib/server/attachments", () => ({
  signedAttachmentUrl: async () => "https://signed.example/mockup.png",
  downloadAttachment: async () => downloaded,
}));

vi.mock("@/lib/server/auth-users", () => ({
  fetchAuthUsersById: async () => new Map(),
  toNamed: (u: unknown) => u,
}));

// `vi.mock` est hissé en tête de fichier : les espions doivent l'être aussi.
const { getIssue, searchIssues, updateIssueFields, createIssueForProject } = vi.hoisted(
  () => ({
    getIssue: vi.fn(async () => ({
      issue: { id: ANCHOR_ID, title: "Un ticket", plan: null, assignee_id: null },
      comments: [],
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
vi.mock("@/lib/server/update-issue", () => ({ updateIssueFields }));
vi.mock("@/lib/server/create-issue", () => ({ createIssueForProject }));

import { executeIssueTool, type IssueToolContext } from "./issue-tools";
import type { NumoDefaultStatus } from "@/lib/numo-default-status";

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
  executeIssueTool(ctx({ imageInput }), "read_attachment", { attachment_id: "att-1" });

beforeEach(() => {
  attachment = { ...attachmentBase };
  downloaded = Buffer.from("PNGBYTES");
  vi.clearAllMocks();
});

describe("read_attachment sur une image", () => {
  it("renvoie l'image en data URL quand le modèle la voit", async () => {
    const out = await read(true);
    expect(out.success).toBe(true);
    expect(out.images).toHaveLength(1);
    expect(out.images![0].url).toBe(`data:image/png;base64,${Buffer.from("PNGBYTES").toString("base64")}`);
    expect(out.images![0].name).toBe("mockup.png");
    // Les octets NE sont PAS dans `result` : il part en JSON dans l'event et le message.
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
 * MIN-125 : la pièce jointe est cadrée au PROJET du run, plus au seul ticket
 * d'ancrage — sinon les `attachment_id` que `read_issue` renvoie sur un autre
 * ticket ne seraient ouvrables par rien.
 */
describe("read_attachment — périmètre projet", () => {
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
      expect.objectContaining({ issueId: OTHER_ID }),
    );
    expect(out.result).toMatchObject({ identifier: "MIN-7", tasks: 1 });
  });
});
