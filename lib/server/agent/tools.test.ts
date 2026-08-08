import { describe, expect, it } from "vitest";
import { agentToolsFor, subagentToolsFor, SUBAGENT_CONTROL_TOOLS } from "./tools";

/**
 * MIN-115 : le jeu de tools d'un run n'est plus fixe. Les modèles `gpt-*`
 * reçoivent `apply_patch` À LA PLACE d'`edit_file` / `apply_edits` / `write_file`,
 * les autres gardent exactement ce qu'ils avaient. C'est le test qui remplace
 * « lancer une session et regarder » : servir les deux jeux ensemble, ou aucun,
 * ne se verrait qu'en production.
 */

const names = (opts: Parameters<typeof agentToolsFor>[0]) =>
  agentToolsFor(opts).map((t) => t.function.name);

const STRING_EDIT = ["edit_file", "apply_edits", "write_file"];

describe("agentToolsFor — interface d'édition", () => {
  for (const anchor of ["issue", "notebook"] as const) {
    it(`sert apply_patch SEUL à un modèle gpt-* (ancrage ${anchor})`, () => {
      const served = names({ anchor, webSearch: true, model: "openai/gpt-5.6-luna" });
      expect(served).toContain("apply_patch");
      for (const tool of STRING_EDIT) expect(served).not.toContain(tool);
    });

    it(`laisse les autres modèles inchangés (ancrage ${anchor})`, () => {
      const served = names({ anchor, webSearch: true, model: "deepseek/deepseek-v4-flash" });
      expect(served).not.toContain("apply_patch");
      for (const tool of STRING_EDIT) expect(served).toContain(tool);
    });

    it(`garde le reste du jeu dans les deux cas (ancrage ${anchor})`, () => {
      for (const model of ["openai/gpt-5.6-luna", "deepseek/deepseek-v4-flash"]) {
        const served = names({ anchor, webSearch: true, model });
        for (const tool of ["read_file", "grep", "move_file", "delete_file", "run_command"]) {
          expect(served).toContain(tool);
        }
        // Aucun doublon : un même nom servi deux fois est un tool-call ambigu.
        expect(new Set(served).size).toBe(served.length);
      }
    });

    it(`sans modèle connu, on reste sur l'édition par chaîne (ancrage ${anchor})`, () => {
      const served = names({ anchor, webSearch: true });
      expect(served).not.toContain("apply_patch");
      expect(served).toContain("edit_file");
    });
  }
});

describe("agentToolsFor — web_search (inchangé)", () => {
  it("retire web_search hors OpenRouter, quelle que soit l'interface d'édition", () => {
    for (const model of ["openai/gpt-5.6-luna", "deepseek/deepseek-v4-flash"]) {
      expect(names({ anchor: "issue", webSearch: false, model })).not.toContain("web_search");
      expect(names({ anchor: "issue", webSearch: true, model })).toContain("web_search");
    }
  });

  /**
   * MIN-245 : le plafond du tour est CHIFFRÉ dans la description. Sans ça, le
   * modèle apprend la limite en heurtant le mur — un round brûlé, alors que la
   * valeur voyage déjà jusqu'ici (`VmJob.webSearchMax`).
   */
  it("chiffre le plafond du tour quand on le lui donne", () => {
    const description = (webSearchMax?: number) =>
      agentToolsFor({ anchor: "issue", webSearch: true, webSearchMax }).find(
        (t) => t.function.name === "web_search",
      )!.function.description;
    expect(description(5)).toContain("5 searches for this turn");
    expect(description(5)).toMatch(/costs real money/);
    // Sans plafond connu, on ne CHIFFRE rien plutôt que d'inventer un nombre.
    expect(description()).not.toMatch(/searches for this turn/);
  });
});

/**
 * MIN-125 : les tools minddy ne sont plus découpés par ancrage. Les DEUX ancrages
 * servent les douze — tickets ET carnet — et l'ancrage ne décide plus que de la
 * CIBLE PAR DÉFAUT, dite dans la description des tools qui prennent `issue`.
 */
const MINDDY_TOOLS = [
  "search_issues",
  "read_issue",
  "read_resource",
  "update_issue",
  "write_issue_plan",
  "append_to_plan",
  "edit_issue_text",
  "create_issue",
  "read_scratchpad",
  "add_scratchpad_tasks",
  "update_scratchpad_task",
  "set_scratchpad",
];

describe("agentToolsFor — tools minddy servis aux deux ancrages", () => {
  for (const anchor of ["issue", "notebook"] as const) {
    it(`sert les douze tools minddy + create_pr (ancrage ${anchor})`, () => {
      const served = names({ anchor, webSearch: true, model: "openai/gpt-5.6-luna" });
      for (const tool of MINDDY_TOOLS) expect(served).toContain(tool);
      expect(served).toContain("create_pr");
      // Un même nom servi deux fois est un tool-call ambigu.
      expect(new Set(served).size).toBe(served.length);
    });
  }

  it("dit la cible par défaut selon l'ancrage, sur les tools ciblables", () => {
    const describeTool = (anchor: "issue" | "notebook", name: string) =>
      agentToolsFor({ anchor, webSearch: true }).find((t) => t.function.name === name)!
        .function.description;

    for (const name of [
      "read_issue",
      "update_issue",
      "write_issue_plan",
      "append_to_plan",
      "edit_issue_text",
    ]) {
      expect(describeTool("issue", name)).toMatch(/`issue` is OPTIONAL/);
      expect(describeTool("issue", name)).not.toMatch(/`issue` is REQUIRED/);
      expect(describeTool("notebook", name)).toMatch(/`issue` is REQUIRED/);
      expect(describeTool("notebook", name)).toMatch(/search_issues/);
    }
    // Les autres tools ticket n'ont pas de cible : pas de phrase de ciblage.
    for (const name of ["search_issues", "create_issue", "read_resource"]) {
      expect(describeTool("notebook", name)).not.toMatch(/`issue` is (OPTIONAL|REQUIRED)/);
    }
  });

  /**
   * MIN-245 : là où la prose dit « REQUIRED », le SCHÉMA le dit aussi. Un appel
   * vide était valide au schéma et n'était refusé qu'à l'exécution
   * (`issue-tools.ts`) — un round brûlé par occurrence.
   */
  it("rend `issue` obligatoire AU SCHÉMA sur un run de carnet", () => {
    const params = (anchor: "issue" | "notebook" | "pr", name: string) =>
      agentToolsFor({ anchor, webSearch: true }).find((t) => t.function.name === name)!.function
        .parameters;

    for (const name of [
      "read_issue",
      "update_issue",
      "write_issue_plan",
      "append_to_plan",
      "edit_issue_text",
    ]) {
      expect(params("notebook", name).required).toContain("issue");
      // Ce que le tool exigeait déjà ne disparaît pas au passage.
      const before = params("issue", name).required ?? [];
      for (const field of before) expect(params("notebook", name).required).toContain(field);
      // Ancrage ticket : `issue` est OPTIONNEL, et le schéma doit le rester.
      expect(params("issue", name).required ?? []).not.toContain("issue");
    }

    // Ancrage PR : le défaut est CONDITIONNEL (le ticket de la PR, quand elle en
    // porte un). Le rendre obligatoire casserait le cas normal.
    expect(params("pr", "read_issue").required ?? []).not.toContain("issue");
  });

  /**
   * MIN-245 : une relecture voit `linked_feedback` dans `read_issue` — elle doit
   * pouvoir l'ouvrir. Exposer des identifiants sans le lecteur qui va avec est
   * exactement le genre d'incohérence qui fait halluciner un appel.
   */
  it("donne `read_feedback` à une relecture, qui voit `linked_feedback`", () => {
    const served = names({ anchor: "pr", webSearch: false });
    expect(served).toContain("read_feedback");
    const readIssue = agentToolsFor({ anchor: "pr", webSearch: false }).find(
      (t) => t.function.name === "read_issue",
    )!.function.description;
    expect(readIssue).toContain("linked_feedback");
  });

  it("ne laisse pas `update_issue` promettre un changement de statut", () => {
    for (const anchor of ["issue", "notebook"] as const) {
      const description = agentToolsFor({ anchor, webSearch: true }).find(
        (t) => t.function.name === "update_issue",
      )!.function;
      expect(description.description).toMatch(/CANNOT change a ticket's STATUS/);
      expect(Object.keys(description.parameters.properties)).not.toContain("status");
      expect(Object.keys(description.parameters.properties)).not.toContain("priority");
    }
  });

  it("ne laisse pas `create_issue` exposer un statut d'atterrissage", () => {
    const tool = agentToolsFor({ anchor: "issue", webSearch: true }).find(
      (t) => t.function.name === "create_issue",
    )!.function;
    expect(Object.keys(tool.parameters.properties)).not.toContain("status");
    expect(tool.description).toMatch(/account setting, not a parameter/);
  });

  it("reformule create_pr selon l'ancrage (le carnet n'a pas de ticket)", () => {
    const pr = (anchor: "issue" | "notebook") =>
      agentToolsFor({ anchor, webSearch: true }).find((t) => t.function.name === "create_pr")!
        .function.description;
    expect(pr("issue")).toMatch(/this ticket's working branch/);
    expect(pr("notebook")).toMatch(/this session's working branch/);
  });
});

/**
 * MIN-111 : `read_resource` est toujours servi, mais il n'ANNONCE une image
 * regardable que sur un run dont le modèle en accepte. La description du tool est
 * ce que le modèle lit en premier — la laisser promettre une capacité absente
 * ferait « je vois la maquette » sur des métadonnées.
 */
describe("agentToolsFor — read_resource et les images", () => {
  const description = (images: boolean) =>
    agentToolsFor({ anchor: "issue", webSearch: true, images }).find(
      (t) => t.function.name === "read_resource",
    )!.function.description;

  it("promet l'image sur un run multimodal", () => {
    expect(description(true)).toMatch(/comes back as the image itself/);
    expect(description(true)).toMatch(/BEFORE writing the code it describes/);
  });

  it("garde le texte d'avant sur un run texte", () => {
    expect(description(false)).not.toMatch(/image itself/);
    expect(description(false)).toBe(
      agentToolsFor({ anchor: "issue", webSearch: true }).find(
        (t) => t.function.name === "read_resource",
      )!.function.description,
    );
  });

  it("ne change rien au jeu de tools servi", () => {
    expect(names({ anchor: "issue", webSearch: true, images: true })).toEqual(
      names({ anchor: "issue", webSearch: true }),
    );
  });
});

/**
 * MIN-112 : la hiérarchie à UN niveau est STRUCTURELLE. Un sous-agent n'a pas
 * `spawn_agent` dans son jeu de tools — ce n'est pas une consigne de prompt qu'un
 * modèle peut décider d'ignorer. Même chose pour le ticket, le carnet et la PR :
 * ils appartiennent au parent, et le seul moyen fiable de le garantir est de ne pas
 * les servir. Ce test remplace « lancer une session et regarder ce qu'elle fait ».
 */
const SUBAGENT_READERS = ["read_file", "list_dir", "glob", "grep"];
const MINDDY_AND_CONTROL = [
  ...MINDDY_TOOLS,
  "create_pr",
  "ask_user",
  "update_plan",
  "run_background",
  "spawn_agent",
  "agent_status",
  "list_agents",
];

describe("subagentToolsFor — hiérarchie à un niveau", () => {
  for (const mode of ["explore", "implement"] as const) {
    it(`ne sert JAMAIS de tool de délégation ni de tool du parent (mode ${mode})`, () => {
      const served = subagentToolsFor(mode, { webSearch: true }).map((t) => t.function.name);
      for (const tool of MINDDY_AND_CONTROL) expect(served).not.toContain(tool);
      // Un même nom servi deux fois est un tool-call ambigu.
      expect(new Set(served).size).toBe(served.length);
      expect(served.length).toBeGreaterThan(0);
    });
  }

  it("sert les quatre lecteurs et RIEN d'autre en mode explore", () => {
    const served = subagentToolsFor("explore", { webSearch: true }).map((t) => t.function.name);
    expect(served.sort()).toEqual([...SUBAGENT_READERS].sort());
  });

  it("ajoute l'édition, run_command et web_search en mode implement", () => {
    const served = subagentToolsFor("implement", { webSearch: true }).map((t) => t.function.name);
    for (const tool of [...SUBAGENT_READERS, "edit_file", "apply_edits", "write_file", "move_file", "delete_file", "run_command", "web_search"]) {
      expect(served).toContain(tool);
    }
  });

  it("sert apply_patch SEUL à une fille qui tourne sur un gpt-*", () => {
    const served = subagentToolsFor("implement", {
      webSearch: false,
      model: "openai/gpt-5.6-luna",
    }).map((t) => t.function.name);
    expect(served).toContain("apply_patch");
    for (const tool of STRING_EDIT) expect(served).not.toContain(tool);
    // Le modèle de la FILLE décide, pas celui du parent : elle peut tourner sur un
    // gpt-* alors que son parent est sur DeepSeek.
    expect(served).not.toContain("web_search");
  });
});

describe("agentToolsFor — les tools de délégation du parent", () => {
  it("sert les trois tools de suivi et de délégation", () => {
    const served = names({ anchor: "issue", webSearch: true });
    for (const tool of SUBAGENT_CONTROL_TOOLS) expect(served).toContain(tool);
  });

  const spawn = (subagentModels?: boolean) =>
    agentToolsFor({ anchor: "issue", webSearch: true, subagentModels }).find(
      (t) => t.function.name === "spawn_agent",
    )!.function;

  it("RETIRE le champ model quand le run ne peut pas en changer (BYOK non-OpenRouter)", () => {
    // Règle du tout ou rien, comme `web_search` : un champ qui reviendrait toujours
    // en erreur ne mérite pas d'être décrit — et la délégation, elle, reste offerte.
    expect(Object.keys(spawn(false).parameters.properties)).not.toContain("model");
    expect(spawn(false).description).toMatch(/always runs on your own model/);
    expect(spawn(undefined).parameters.properties).not.toHaveProperty("model");

    expect(Object.keys(spawn(true).parameters.properties)).toContain("model");
    expect(spawn(true).description).not.toMatch(/always runs on your own model/);
  });

  it("garde task, mode et expected_output obligatoires dans les deux cas", () => {
    for (const models of [true, false]) {
      expect(spawn(models).parameters.required).toEqual(["task", "mode", "expected_output"]);
    }
  });

  it("annonce le lancement asynchrone, le wakeup, l'absence d'attente et le gel des éditions", () => {
    // Le modèle ne peut pas deviner ce contrat : s'il n'est pas écrit ici, il
    // cherchera un `wait_agent`, ou pire, bouclera sur `agent_status`.
    const description = spawn(true).description;
    expect(description).toMatch(/IT DOES NOT BLOCK/);
    expect(description).toMatch(/woken up/);
    expect(description).toMatch(/NO tool to wait/);
    expect(description).toMatch(/YOUR OWN editing tools are refused/);
    expect(description).toMatch(/ability to delegate further/);
    expect(description).toMatch(/report is ALL you get back/);
  });
});

/**
 * MIN-168 : le jeu d'une session de RELECTURE. Ce qui compte ici n'est pas ce
 * qu'il contient mais ce qu'il ne contient PAS : la lecture seule d'une review
 * est une propriété du JEU DE TOOLS, pas une phrase de prompt qu'un modèle peut
 * ignorer. Un `edit_file` qui reviendrait par erreur dans ce jeu suffirait à
 * faire écrire l'agent dans le dépôt de quelqu'un.
 */
describe("agentToolsFor — ancrage pull request", () => {
  const served = names({ anchor: "pr", webSearch: true, model: "openai/gpt-5.6-luna" });

  it("n'offre AUCUN moyen d'écrire dans le dépôt", () => {
    for (const tool of [
      ...STRING_EDIT,
      "apply_patch",
      "move_file",
      "delete_file",
      "create_pr",
    ]) {
      expect(served).not.toContain(tool);
    }
  });

  it("n'offre ni délégation, ni jobs de fond, ni checklist, ni question", () => {
    for (const tool of [
      ...SUBAGENT_CONTROL_TOOLS,
      "run_background",
      "update_plan",
      "ask_user",
      "report_verdict",
      "web_search",
    ]) {
      expect(served).not.toContain(tool);
    }
  });

  it("n'offre aucune écriture minddy ni le carnet", () => {
    for (const tool of [
      "update_issue",
      "write_issue_plan",
      "create_issue",
      "read_scratchpad",
      "add_scratchpad_tasks",
      "update_scratchpad_task",
      "set_scratchpad",
    ]) {
      expect(served).not.toContain(tool);
    }
  });

  it("offre les lecteurs, le shell, les lecteurs minddy et les trois écritures de PR", () => {
    for (const tool of [
      "read_file",
      "list_dir",
      "glob",
      "grep",
      "run_command",
      "search_issues",
      "read_issue",
      "read_resource",
      "comment_pr_line",
      "comment_pr",
      "reply_pr_thread",
    ]) {
      expect(served).toContain(tool);
    }
    expect(new Set(served).size).toBe(served.length);
  });

  it("dit les DEUX cas de ciblage : PR avec ticket, et PR sans", () => {
    const readIssue = agentToolsFor({ anchor: "pr", webSearch: false }).find(
      (t) => t.function.name === "read_issue",
    );
    const d = readIssue?.function.description ?? "";
    expect(d).toContain("this pull request implements");
    // Beaucoup de PR n'ont pas de ticket (MIN-143) : promettre un défaut qui
    // n'existe pas ferait brûler un round au premier `read_issue` sans argument.
    expect(d).toContain("MANY PULL REQUESTS HAVE NO TICKET");
    expect(d).toMatch(/never requires a ticket/);
  });

  it("`report_verdict` reste absent même dans une chaîne", () => {
    const inChain = names({ anchor: "pr", webSearch: false, chain: true });
    expect(inChain).not.toContain("report_verdict");
  });
});
