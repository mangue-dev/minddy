import { describe, expect, it } from "vitest";

import {
  DOMAIN_TOOL_NAMES,
  domainToolsFor,
  localToolsFor,
  opencodeToolFiles,
  renderOpencodeTool,
  retargetToolNames,
  schemaExpression,
  SUPERVISOR_URL_ENV,
} from "./opencode-tools";
import { opencodeToolDir } from "./opencode-config";
import { cloudLayout } from "../harness-layout";
import { agentToolsFor, type AgentToolDef } from "../tools";
import { VM_PROTOCOL_VERSION, type VmJob } from "./protocol";

/**
 * MIN-286 batch 1 — domain tools, rendered for opencode.
 *
 * What these tests keep is in one sentence: **there is no second
 * table**. The day someone adds a tool to `tools.ts`, it should appear
 * here without having to write anything; the day it changes the schema, the
 * generated file must change with it. A copied list would pass both, and the
 * model would see a tool that no longer exists.
 *
 * The asserted forms were measured on `opencode-ai@1.18.16`: the form
 * `tool()` is the only one that knows how to say "this parameter is optional" (the nu
 * object makes EVERYTHING mandatory), and a tool placed outside the repository is loaded.
 */

/** The run paths, derived from the layout that the job carries (MIN-354). */
const LAYOUT = cloudLayout();
const TOOL_DIR = opencodeToolDir(LAYOUT);

function job(over: Partial<VmJob> = {}): VmJob {
  return {
    protocolVersion: VM_PROTOCOL_VERSION,
    layout: LAYOUT,
    runId: "11111111-2222-4333-8444-555555555555",
    ledgerRunId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    projectId: "proj-1",
    appOrigin: "https://minddy.example",
    opencodeInput: { prompt: "vas-y", anchorInstructions: "# ancrage" },
    model: "deepseek/deepseek-v4-flash",
    baseUrl: "https://openrouter.ai/api/v1",
    provider: "openrouter",
    llmPlaceholderKey: "minddy-placeholder-key",
    reasoningLevel: "medium",
    contextWindow: 200_000,
    inputUsdPerMTok: 0.3,
    anchor: "issue",
    writesToRepo: true,
    interactive: true,
    chain: false,
    imageInput: false,
    webSearch: true,
    webSearchMax: 5,
    subagents: {
      models: false,
      favorites: [],
      maxParallel: 2,
      allowedIds: [],
      abovePlanIds: [],
      maxMultiplier: null,
    },
    instructions: { paths: [], bytes: 0 },
    usageSeqStart: 0,
    editedPaths: [],
    repoTouched: false,
    prInlineComments: 0,
    baseBranch: "main",
    workBranch: "minddy/agent/min-42-abcd1234",
    repoMode: "clone",
    committer: { name: "minddy agent", email: "agent@minddy.app" },
    authUrl: "https://x-access-token:tok@github.com/org/repo.git",
    commitRef: "MIN-42",
    bootstrapMs: 0,
    filesFromSha: "",
    locale: "fr",
    feature: "agent_code",
    ...over,
  };
}

const named = (defs: AgentToolDef[], name: string) =>
  defs.find((d) => d.function.name === name);

describe("le jeu de tools de domaine sort de tools.ts, pas d'une liste", () => {
  it("prend TOUS les tools servis dont l'exécution nous revient", () => {
    const served = agentToolsFor({
      anchor: "issue",
      webSearch: true,
      webSearchMax: 5,
      model: "deepseek/deepseek-v4-flash",
    }).map((t) => t.function.name);
    const domain = domainToolsFor(job()).map((t) => t.function.name);
    // No tool served and “ours” must be missing: that’s this assertion
    // qui casse quand quelqu'un ajoute un tool minddy sans l'inscrire au routage.
    expect(domain).toEqual(served.filter((n) => DOMAIN_TOOL_NAMES.has(n)));
    expect(domain.length).toBeGreaterThan(25);
  });

  it("keeps trigger-independent tools while honoring provider web availability", () => {
    const routine = domainToolsFor(job({ interactive: false })).map(
      (t) => t.function.name,
    );
    expect(routine).toContain("create_routine");

    const chain = domainToolsFor(job({ chain: true })).map(
      (t) => t.function.name,
    );
    expect(chain).toContain("report_verdict");
    expect(domainToolsFor(job()).map((t) => t.function.name)).toContain(
      "report_verdict",
    );

    const noWeb = domainToolsFor(job({ webSearch: false })).map(
      (t) => t.function.name,
    );
    expect(noWeb).not.toContain("web_search");
  });

  it("keeps the domain catalog identical for pull-request runs", () => {
    const review = domainToolsFor(
      job({ anchor: "pr", writesToRepo: false }),
    ).map((t) => t.function.name);
    expect(review).toEqual(
      domainToolsFor(job()).map((tool) => tool.function.name),
    );
  });

  it("emporte la phrase de ciblage de l'ancrage dans la description", () => {
    const notebook = named(
      domainToolsFor(job({ anchor: "notebook" })),
      "read_issue",
    );
    expect(notebook?.function.description).toContain("`issue` is REQUIRED");
    const issue = named(domainToolsFor(job()), "read_issue");
    expect(issue?.function.description).toContain("`issue` is OPTIONAL");
  });
});

describe("la traduction d'un schéma", () => {
  it("rend les types simples avec leur description", () => {
    expect(schemaExpression({ type: "string", description: "un id" })).toBe(
      'tool.schema.string().describe("un id")',
    );
    expect(schemaExpression({ type: "boolean" })).toBe("tool.schema.boolean()");
    expect(schemaExpression({ type: "number" })).toBe("tool.schema.number()");
  });

  it("rend un enum comme un enum, pas comme une chaîne", () => {
    expect(schemaExpression({ type: "string", enum: ["open", "closed"] })).toBe(
      'tool.schema.enum(["open","closed"])',
    );
  });

  it("descend dans les tableaux et les objets imbriqués", () => {
    const expr = schemaExpression({
      type: "array",
      items: {
        type: "object",
        properties: {
          step: { type: "string" },
          status: { type: "string", enum: ["pending", "completed"] },
        },
        required: ["step"],
      },
    });
    expect(expr).toContain("tool.schema.array(");
    expect(expr).toContain('"step": tool.schema.string(),');
    // What is not required is optional — that's exactly what the form
    // of bare object of opencode does NOT know how to say, and why we emit zod.
    expect(expr).toContain(
      '"status": tool.schema.enum(["pending","completed"]).optional(),',
    );
  });

  it("LÈVE sur un schéma qu'elle ne sait pas traduire", () => {
    // A silent `any` would be a tool whose model no longer knows the form.
    // Better a ride that doesn't start than a parameter that disappears quietly.
    expect(() => schemaExpression({ type: "tuple" } as never)).toThrow(
      /sans traduction/,
    );
    expect(() => schemaExpression({ type: "array" })).toThrow(/items/);
  });

  it("traduit les 35 tools réels sans en refuser un seul", () => {
    // The real coverage test: these are the production plans that pass,
    // not three cases built for the occasion.
    for (const anchor of ["issue", "notebook", "pr"] as const) {
      for (const def of domainToolsFor(job({ anchor, chain: true }))) {
        expect(() => renderOpencodeTool(def), def.function.name).not.toThrow();
      }
    }
  });
});

describe("le fichier généré", () => {
  const file = () =>
    renderOpencodeTool(named(domainToolsFor(job()), "read_issue")!);

  it("emploie la forme `tool()`, la seule qui sache dire « optionnel »", () => {
    expect(file()).toContain('import { tool } from "@opencode-ai/plugin"');
    expect(file()).toContain("export default tool({");
    expect(file()).toContain(".optional()");
  });

  it("lit l'adresse du superviseur dans l'environnement, jamais en dur", () => {
    const content = file();
    expect(content).toContain(
      `process.env[${JSON.stringify(SUPERVISOR_URL_ENV)}]`,
    );
    // The port is chosen at runtime: a hard URL would be wrong on one turn
    // two, and a control plane origin here would bypass the counters.
    expect(content).not.toContain("https://");
    expect(content).not.toContain("127.0.0.1");
  });

  it("rend l'erreur au modèle au lieu de lever", () => {
    // A tool that raises cuts the round. The model must be able to read, retry,
    // ou faire autrement.
    const content = file();
    expect(content).toContain("could not reach the harness");
    expect(content).toContain("HTTP ");
    expect(content).not.toContain("throw ");
  });

  it("rend une pièce jointe quand le pont l'annonce, et du texte sinon", () => {
    const content = file();
    // The generated tool does not DECIDE anything: it is the bridge header which distinguishes
    // an ordinary response of a model to show (MIN-286 lot 3, §2.22).
    expect(content).toContain('res.headers.get("x-minddy-attachments")');
    expect(content).toContain(
      "return { output: envelope.output, attachments: envelope.attachments };",
    );
    // An illegible envelope falls on the text: a lost model is worth
    // mieux qu'un round perdu.
    expect(content).toContain("return text;");
    expect(content).not.toContain("throw ");
  });

  it("échappe une description qui contient des guillemets et des retours ligne", () => {
    const content = renderOpencodeTool({
      type: "function",
      function: {
        name: "t",
        description: 'dit "bonjour"\net saute une ligne',
        parameters: { type: "object", properties: {} },
      },
    });
    expect(content).toContain(
      'description: "dit \\"bonjour\\"\\net saute une ligne"',
    );
  });
});

describe("où les fichiers sont posés", () => {
  it("un fichier par tool, nommé comme le tool", () => {
    const files = opencodeToolFiles(job());
    const names = [...domainToolsFor(job()), ...localToolsFor(job())].map(
      (t) => t.function.name,
    );
    expect(new Set(files.map((f) => f.path))).toEqual(
      new Set(names.map((n) => `${TOOL_DIR}/${n}.ts`)),
    );
    expect(files).toHaveLength(names.length);
  });

  /**
   * The LOCAL tools (folder §3.2), which the supervisor executes in the microVM:
   * `run_background`, because `bash` does not have a background mode, and `update_plan`,
   * which is a CONTROL tool — it does not execute anything, it emits the event that the thread
   * renders as a checklist. Stored on the domain side, it went back to the control plane and y
   * received a 404 on each call.
   *
   * They are generated like the others — the bridge executes them instead of making them
   * follow —, and a REVIEW session does not have `run_background` : she doesn't
   * throw anything in the background, and `PR_REVIEW_TOOLS` doesn't carry it.
   */
  it("serves the same local tools to every anchor", () => {
    for (const anchor of ["issue", "notebook", "pr"] as const) {
      expect(
        localToolsFor(job({ anchor })).map((t) => t.function.name),
      ).toEqual([
        "run_background",
        "update_plan",
        "validate_changes",
        "list_projects",
      ]);
      expect(opencodeToolFiles(job({ anchor })).map((f) => f.path)).toContain(
        `${TOOL_DIR}/run_background.ts`,
      );
    }
  });

  it("keeps shell-backed tools on a local host", () => {
    const local = job({ controlToken: "bail-hs256" });
    expect(localToolsFor(local).map((t) => t.function.name)).toEqual([
      "run_background",
      "update_plan",
      "validate_changes",
      "list_projects",
    ]);
    for (const name of [
      "run_background",
      "validate_changes",
      "list_projects",
    ]) {
      expect(opencodeToolFiles(local).map((f) => f.path)).toContain(
        `${TOOL_DIR}/${name}.ts`,
      );
    }
    expect(domainToolsFor(local).map((t) => t.function.name)).toEqual(
      domainToolsFor(job()).map((t) => t.function.name),
    );
  });

  it("HORS du dépôt — sinon le `git add -A` de fin de tour les commite", () => {
    for (const f of opencodeToolFiles(job())) {
      expect(f.path.startsWith(`${LAYOUT.repoDir}/`)).toBe(false);
    }
  });
});

/**
 * MIN-286 — DESCRIPTIONS CITE NEIGHBORING TOOLS, and they must cite
 * those that opencode SERT.
 *
 * `tools.ts` is the only source, and its text speaks the language of the loop
 * house: “use run_command for those”, “exactly like edit_file”. Served as
 * as it is, it gives the model a tool name that does not exist — while its
 * system prompt cites the correct one (`OPENCODE_TOOL_NAMES`). Two truths in the
 * same context, and one round burned to find out which one is the right one.
 */
describe("les descriptions, dites avec les noms d'opencode", () => {
  /** The description as the MODEL reads it: that of the generated file. */
  const servedDescription = (name: string, over: Partial<VmJob> = {}) =>
    renderOpencodeTool(
      [...domainToolsFor(job(over)), ...localToolsFor(job(over))].find(
        (t) => t.function.name === name,
      )!,
    );

  it("renomme les tools de la boucle maison, sans toucher aux nôtres", () => {
    expect(
      retargetToolNames(
        "use run_command for those, it gives you the exit code",
      ),
    ).toBe("use bash for those, it gives you the exit code");
    expect(
      retargetToolNames("exactly like edit_file, but on the minddy ticket"),
    ).toBe("exactly like edit, but on the minddy ticket");
    // Our domain tools keep their name: they are the ones served.
    expect(
      retargetToolNames("get the id from read_issue, then read_page"),
    ).toBe("get the id from read_issue, then read_page");
  });

  it("ne laisse aucun nom de l'ancien harnais dans un tool généré", () => {
    const dead =
      /\b(run_command|read_file|write_file|edit_file|list_dir|ask_user|spawn_agent)\b/;
    for (const anchor of ["issue", "notebook", "pr"] as const) {
      for (const file of opencodeToolFiles(job({ anchor, imageInput: true }))) {
        expect(dead.test(file.content), `${anchor}: ${file.path}`).toBe(false);
      }
    }
  });

  it("envoie le modèle au `bash` d'opencode pour curler son serveur", () => {
    // The case that cost a round: `run_background` tells how to use this
    // that he just launched, and he said it with the name of an absent tool.
    const background = servedDescription("run_background");
    expect(background).toContain("use bash to curl it");
    expect(background).not.toContain("run_command");
  });

  it("dit `read` pour aller chercher les octets d'une pièce jointe", () => {
    expect(servedDescription("read_resource")).toContain(
      "download them with bash",
    );
  });
});
