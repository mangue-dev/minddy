import { describe, expect, it } from "vitest";

import {
  DOMAIN_TOOL_NAMES,
  domainToolsFor,
  localToolsFor,
  opencodeToolFiles,
  renderOpencodeTool,
  schemaExpression,
  SUPERVISOR_URL_ENV,
} from "./opencode-tools";
import { OPENCODE_TOOL_DIR } from "./opencode-config";
import { REPO_DIR } from "../repo-host";
import { agentToolsFor, type AgentToolDef } from "../tools";
import type { VmJob } from "./protocol";

/**
 * MIN-286 lot 1 — les tools de domaine, rendus pour opencode.
 *
 * Ce que ces tests gardent tient en une phrase : **il n'y a pas de deuxième
 * table**. Le jour où quelqu'un ajoute un tool à `tools.ts`, il doit apparaître
 * ici sans qu'on ait rien à écrire ; le jour où il en change le schéma, le
 * fichier généré doit changer avec. Une liste recopiée passerait les deux, et le
 * modèle verrait un tool qui n'existe plus.
 *
 * Les formes assertées ont été mesurées sur `opencode-ai@1.18.16` : la forme
 * `tool()` est la seule qui sache dire « ce paramètre est optionnel » (l'objet nu
 * rend TOUT obligatoire), et un tool posé hors du dépôt est bien chargé.
 */

function job(over: Partial<VmJob> = {}): VmJob {
  return {
    runId: "11111111-2222-4333-8444-555555555555",
    ledgerRunId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    projectId: "proj-1",
    appOrigin: "https://minddy.example",
    engine: "opencode",
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
    messages: [],
    instructions: { paths: [], bytes: 0 },
    usageSeqStart: 0,
    parkedForSubagents: false,
    editedPaths: [],
    repoTouched: false,
    prInlineComments: 0,
    baseBranch: "main",
    workBranch: "minddy/agent/min-42-abcd1234",
    authUrl: "https://x-access-token:tok@github.com/org/repo.git",
    commitRef: "MIN-42",
    bootstrapMs: 0,
    filesFromSha: "",
    locale: "fr",
    feature: "agent_code",
    checkpointMaxBytes: 3_200_000,
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
    // Aucun tool servi et « à nous » ne doit manquer : c'est cette assertion-là
    // qui casse quand quelqu'un ajoute un tool minddy sans l'inscrire au routage.
    expect(domain).toEqual(served.filter((n) => DOMAIN_TOOL_NAMES.has(n)));
    expect(domain.length).toBeGreaterThan(30);
  });

  it("hérite des retraits structurels au lieu de les redire", () => {
    // Une ROUTINE n'a pas `create_routine`, une session hors chaîne n'a pas
    // `report_verdict`, un run sans web n'a pas `web_search`. Ces trois règles
    // vivent dans `agentToolsFor` et doivent traverser sans une ligne ici.
    const routine = domainToolsFor(job({ interactive: false })).map((t) => t.function.name);
    expect(routine).not.toContain("create_routine");

    const chain = domainToolsFor(job({ chain: true })).map((t) => t.function.name);
    expect(chain).toContain("report_verdict");
    expect(domainToolsFor(job()).map((t) => t.function.name)).not.toContain("report_verdict");

    const noWeb = domainToolsFor(job({ webSearch: false })).map((t) => t.function.name);
    expect(noWeb).not.toContain("web_search");
  });

  it("suit l'ancrage — une relecture n'écrit ni ticket ni carnet", () => {
    const review = domainToolsFor(job({ anchor: "pr", writesToRepo: false })).map(
      (t) => t.function.name,
    );
    expect(review).toContain("comment_pr_line");
    expect(review).toContain("read_issue");
    for (const forbidden of ["update_issue", "create_pr", "set_scratchpad", "create_issue"]) {
      expect(review).not.toContain(forbidden);
    }
  });

  it("emporte la phrase de ciblage de l'ancrage dans la description", () => {
    const notebook = named(domainToolsFor(job({ anchor: "notebook" })), "read_issue");
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
    // Ce qui n'est pas requis est optionnel — c'est exactement ce que la forme
    // d'objet nu d'opencode ne sait PAS dire, et pourquoi on émet du zod.
    expect(expr).toContain('"status": tool.schema.enum(["pending","completed"]).optional(),');
  });

  it("LÈVE sur un schéma qu'elle ne sait pas traduire", () => {
    // Un `any` silencieux serait un tool dont le modèle ne connaît plus la forme.
    // Mieux vaut un tour qui ne démarre pas qu'un paramètre disparu sans bruit.
    expect(() => schemaExpression({ type: "tuple" } as never)).toThrow(/sans traduction/);
    expect(() => schemaExpression({ type: "array" })).toThrow(/items/);
  });

  it("traduit les 35 tools réels sans en refuser un seul", () => {
    // Le vrai test de couverture : ce sont les schémas de production qui passent,
    // pas trois cas construits pour l'occasion.
    for (const anchor of ["issue", "notebook", "pr"] as const) {
      for (const def of domainToolsFor(job({ anchor, chain: true }))) {
        expect(() => renderOpencodeTool(def), def.function.name).not.toThrow();
      }
    }
  });
});

describe("le fichier généré", () => {
  const file = () => renderOpencodeTool(named(domainToolsFor(job()), "read_issue")!);

  it("emploie la forme `tool()`, la seule qui sache dire « optionnel »", () => {
    expect(file()).toContain('import { tool } from "@opencode-ai/plugin"');
    expect(file()).toContain("export default tool({");
    expect(file()).toContain(".optional()");
  });

  it("lit l'adresse du superviseur dans l'environnement, jamais en dur", () => {
    const content = file();
    expect(content).toContain(`process.env[${JSON.stringify(SUPERVISOR_URL_ENV)}]`);
    // Le port est choisi à l'exécution : une URL en dur serait fausse un tour sur
    // deux, et une origine de plan de contrôle ici contournerait les compteurs.
    expect(content).not.toContain("https://");
    expect(content).not.toContain("127.0.0.1");
  });

  it("rend l'erreur au modèle au lieu de lever", () => {
    // Un tool qui lève coupe le round. Le modèle doit pouvoir lire, réessayer,
    // ou faire autrement.
    const content = file();
    expect(content).toContain("could not reach the harness");
    expect(content).toContain("HTTP ");
    expect(content).not.toContain("throw ");
  });

  it("rend une pièce jointe quand le pont l'annonce, et du texte sinon", () => {
    const content = file();
    // Le tool généré ne DÉCIDE de rien : c'est l'en-tête du pont qui distingue
    // une réponse ordinaire d'une maquette à montrer (MIN-286 lot 3, §2.22).
    expect(content).toContain('res.headers.get("x-minddy-attachments")');
    expect(content).toContain("return { output: envelope.output, attachments: envelope.attachments };");
    // Une enveloppe illisible retombe sur le texte : une maquette perdue vaut
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
    expect(content).toContain('description: "dit \\"bonjour\\"\\net saute une ligne"');
  });
});

describe("où les fichiers sont posés", () => {
  it("un fichier par tool, nommé comme le tool", () => {
    const files = opencodeToolFiles(job());
    const names = [...domainToolsFor(job()), ...localToolsFor(job())].map(
      (t) => t.function.name,
    );
    expect(new Set(files.map((f) => f.path))).toEqual(
      new Set(names.map((n) => `${OPENCODE_TOOL_DIR}/${n}.ts`)),
    );
    expect(files).toHaveLength(names.length);
  });

  /**
   * `run_background` est le seul tool LOCAL (dossier §3.2) : `bash` n'a pas de
   * mode fond. Il est généré comme les autres — le pont l'exécute au lieu de le
   * faire suivre —, et une session de RELECTURE ne l'a pas : elle ne lance rien
   * en fond, et `PR_REVIEW_TOOLS` ne le porte pas.
   */
  it("`run_background` est servi au ticket et au carnet, jamais à une relecture", () => {
    for (const anchor of ["issue", "notebook"] as const) {
      expect(localToolsFor(job({ anchor })).map((t) => t.function.name)).toEqual([
        "run_background",
      ]);
      expect(opencodeToolFiles(job({ anchor })).map((f) => f.path)).toContain(
        `${OPENCODE_TOOL_DIR}/run_background.ts`,
      );
    }
    expect(localToolsFor(job({ anchor: "pr" }))).toEqual([]);
    expect(opencodeToolFiles(job({ anchor: "pr" })).map((f) => f.path)).not.toContain(
      `${OPENCODE_TOOL_DIR}/run_background.ts`,
    );
  });

  it("HORS du dépôt — sinon le `git add -A` de fin de tour les commite", () => {
    for (const f of opencodeToolFiles(job())) {
      expect(f.path.startsWith(`${REPO_DIR}/`)).toBe(false);
    }
  });
});
