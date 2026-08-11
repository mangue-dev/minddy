import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tools TICKET de l'agent de code. Deux couches sont testées ici :
 *  - MIN-111 : `read_resource` sur une maquette doit RENVOYER l'image, en data
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

const TRASHED_ID = "33333333-3333-4333-8333-333333333333";

/** Le plan stocké du ticket d'ancrage — ce que lisent append_to_plan et
 *  edit_issue_text avant de patcher (MIN-186). */
const STORED_PLAN =
  "# Contexte\n\nLe plan de départ.\n\n## Tâches\n\n- [ ] Première tâche\n\n## Questions\n\n- [ ] Une question parquée\n";

const ISSUE_ROWS = [
  {
    id: ANCHOR_ID,
    number: 42,
    project_id: "proj-1",
    plan: STORED_PLAN,
    description: "Une description de départ, à patcher.",
  },
  { id: OTHER_ID, number: 7, project_id: "proj-1" },
  { id: FOREIGN_ID, number: 3, project_id: "proj-2" },
  // MIN-133 : même projet, mais à la corbeille — l'agent ne doit pas le voir.
  {
    id: TRASHED_ID,
    number: 9,
    project_id: "proj-1",
    deleted_at: "2026-07-01T00:00:00.000Z",
  },
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
          // `?? null` : une colonne absente de la ligne vaut null, pour que
          // `.is("deleted_at", null)` retienne bien les lignes vivantes.
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
    // `.is("deleted_at", null)` — depuis MIN-133 toute lecture de ticket écarte
    // les corbeillés ; le faux applique vraiment le filtre, sans quoi le test ne
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
vi.mock("@/lib/server/update-issue", () => ({
  updateIssueFields,
  MAX_DESCRIPTION_LENGTH: 65_536,
}));
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
  executeIssueTool(ctx({ imageInput }), "read_resource", { resource_id: "att-1" });

beforeEach(() => {
  attachment = { ...attachmentBase };
  downloaded = Buffer.from("PNGBYTES");
  vi.clearAllMocks();
});

describe("read_resource sur une image", () => {
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
 * d'ancrage — sinon les `resource_id` que `read_issue` renvoie sur un autre
 * ticket ne seraient ouvrables par rien.
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
 * MIN-275 : une ressource peut être une PAGE du wiki. Elle n'a ni octets ni
 * adresse — ce que `read_resource` en rend, c'est de quoi ouvrir le document
 * avec `read_page`, et surtout le titre VIVANT (une page renommée ne doit pas
 * revenir sous son ancien nom, qui n'est plus dans aucune sidebar).
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
    // Aucune URL signée : il n'y a pas d'objet dans le bucket.
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

  // MIN-133 — un ticket à la corbeille est, pour l'agent, un ticket qui
  // n'existe pas : il n'a plus à le lire, encore moins à travailler dessus.
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

/**
 * MIN-186 : l'agent de code ne pouvait toucher au plan qu'en le RÉÉMETTANT
 * (`write_issue_plan`), ce qui détruit en silence les états de tâches et ce
 * qu'un autre a écrit entre-temps. Ces deux tools écrivent chirurgicalement,
 * sur le même cœur que le MCP et Numo.
 */
/** Le champ écrit par le DERNIER appel à updateIssueFields. Les espions hissés
 *  n'ont pas de signature typée : on la rend ici, une fois. */
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
    // Les index rendus sont ceux que le modèle réutilisera juste après.
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
    // Une question n'est pas du travail : le total ne bouge pas.
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
    // MIN-7 n'a pas de plan stocké : le bloc devient le plan.
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
    // Et le message renvoie vers la relecture, jamais vers un fichier.
    // Et le message nomme les tools DE L'AGENT, pas ceux du MCP.
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
 * MIN-247 — UNE PIÈCE JOINTE TEXTE NE PERD PLUS SA FIN.
 *
 * La coupe se faisait par la TÊTE : sur un log, une trace ou un export — ce
 * qu'on dépose presque toujours sur un ticket — c'est la fin qui porte le
 * verdict. C'est exactement le défaut que MIN-107 avait nommé pour `run_command`
 * et qui n'avait jamais été porté ici.
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
    // Et le chemin du fichier entier reste dit : l'URL signée, puis read_file.
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
