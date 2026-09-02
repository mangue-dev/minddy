import { describe, expect, it } from "vitest";
import { agentToolsFor } from "./tools";

/**
 * MIN-115: the toolset of a run is no longer fixed. The `gpt-*` models
 * receive `apply_patch` INSTEAD of `edit_file` / `apply_edits` / `write_file`,
 * the others keep exactly what they had. This is the test that replaces
 * “start a session and watch”: serve both games together, or neither,
 * would only be visible in production.
 */

const names = (opts: Parameters<typeof agentToolsFor>[0]) =>
  agentToolsFor(opts).map((t) => t.function.name);

describe("agentToolsFor — web_search (inchangé)", () => {
  it("retire web_search hors OpenRouter, quelle que soit l'interface d'édition", () => {
    for (const model of ["openai/gpt-5.6-luna", "deepseek/deepseek-v4-flash"]) {
      expect(names({ anchor: "issue", webSearch: false, model })).not.toContain(
        "web_search",
      );
      expect(names({ anchor: "issue", webSearch: true, model })).toContain(
        "web_search",
      );
    }
  });

  /**
   * MIN-245: the round cap is ENCIMED in the description. Without that, the
   * model learns the limit by hitting the wall — a burnt round, while the
   * value already travels here (`VmJob.webSearchMax`).
   */
  it("chiffre le plafond du tour quand on le lui donne", () => {
    const description = (webSearchMax?: number) =>
      agentToolsFor({ anchor: "issue", webSearch: true, webSearchMax }).find(
        (t) => t.function.name === "web_search",
      )!.function.description;
    expect(description(5)).toContain("5 searches for this turn");
    expect(description(5)).toMatch(/costs real money/);
    // Without a known ceiling, we don't CUMBER anything rather than inventing a number.
    expect(description()).not.toMatch(/searches for this turn/);
  });
});

describe("agentToolsFor — local project context", () => {
  it("keeps project discovery in the canonical catalog", () => {
    expect(names({ anchor: "issue", webSearch: true })).toContain(
      "list_projects",
    );
    const local = agentToolsFor({
      anchor: "issue",
      webSearch: true,
      local: true,
    }).find((tool) => tool.function.name === "list_projects");
    expect(local?.function.description).toContain("local_path");
    expect(local?.function.description).toContain("without asking the user");
  });
});

/**
 * MIN-125: minddy tools are no longer cut by anchoring. The TWO anchors
 * serve the twelve — tickets AND notebook — and the anchorage only decides on the
 * DEFAULT TARGET, said in the description of tools which take `issue`.
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
    it(`serves the repository validation and pull request tools (anchor ${anchor})`, () => {
      const served = names({
        anchor,
        webSearch: true,
        model: "openai/gpt-5.6-luna",
      });
      for (const tool of MINDDY_TOOLS) expect(served).toContain(tool);
      expect(served).toContain("validate_changes");
      expect(served).toContain("create_pr");
      // The same name used twice is an ambiguous tool-call.
      expect(new Set(served).size).toBe(served.length);
    });
  }

  it("dit la cible par défaut selon l'ancrage, sur les tools ciblables", () => {
    const describeTool = (anchor: "issue" | "notebook", name: string) =>
      agentToolsFor({ anchor, webSearch: true }).find(
        (t) => t.function.name === name,
      )!.function.description;

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
    // The other tool tickets have no target: no targeting phrase.
    for (const name of ["search_issues", "create_issue", "read_resource"]) {
      expect(describeTool("notebook", name)).not.toMatch(
        /`issue` is (OPTIONAL|REQUIRED)/,
      );
    }
  });

  /**
   * MIN-245: Where the prose says “REQUIRED”, the DIAGRAM says so too. A call
   * empty was valid for the schema and was only refused at runtime
   * (`issue-tools.ts`) — one round burned per occurrence.
   */
  it("rend `issue` obligatoire AU SCHÉMA sur un run de carnet", () => {
    const params = (anchor: "issue" | "notebook" | "pr", name: string) =>
      agentToolsFor({ anchor, webSearch: true }).find(
        (t) => t.function.name === name,
      )!.function.parameters;

    for (const name of [
      "read_issue",
      "update_issue",
      "write_issue_plan",
      "append_to_plan",
      "edit_issue_text",
    ]) {
      expect(params("notebook", name).required).toContain("issue");
      // What the tool already required does not disappear in passing.
      const before = params("issue", name).required ?? [];
      for (const field of before)
        expect(params("notebook", name).required).toContain(field);
      // Ticket anchor: `issue` is OPTIONAL, and the schema must remain so.
      expect(params("issue", name).required ?? []).not.toContain("issue");
    }

    // PR anchoring: the defect is CONDITIONAL (the ticket of the PR, when it
    // wears a). Making it mandatory would break the normal case.
    expect(params("pr", "read_issue").required ?? []).not.toContain("issue");
  });

  /**
   * MIN-245: a replay sees `linked_feedback` in `read_issue` — it should
   * be able to open it. Exposing credentials without the reader that goes with them is
   * exactly the kind of inconsistency that makes a call hallucinate.
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
      expect(description.description).toMatch(
        /CANNOT change a ticket's STATUS/,
      );
      expect(Object.keys(description.parameters.properties)).not.toContain(
        "status",
      );
      expect(Object.keys(description.parameters.properties)).not.toContain(
        "priority",
      );
    }
  });

  it("ne laisse pas `create_issue` exposer un statut d'atterrissage", () => {
    const tool = agentToolsFor({ anchor: "issue", webSearch: true }).find(
      (t) => t.function.name === "create_issue",
    )!.function;
    expect(Object.keys(tool.parameters.properties)).not.toContain("status");
    expect(tool.description).toMatch(/account setting, not a parameter/);
  });

  it("uses the same create_pr definition for every anchor", () => {
    const pr = (anchor: "issue" | "notebook") =>
      agentToolsFor({ anchor, webSearch: true }).find(
        (t) => t.function.name === "create_pr",
      )!.function.description;
    expect(pr("issue")).toMatch(/this run's working branch/);
    expect(pr("notebook")).toBe(pr("issue"));
  });
});

/**
 * MIN-111: `read_resource` is always served, but it ANNOUNCES a viewable image
 * only on a run whose model accepts one. The tool description is what the model
 * reads first — letting it promise an absent capability would make it say “I can
 * see the mockup” about metadata.
 */
/**
 * MIN-287: the agent had NO objective tool, while the MCP has five. It therefore
 * worked on a ticket without knowing which goal it served, and a ticket it
 * created fell outside every progress bar.
 */
describe("agentToolsFor — les objectifs", () => {
  const OBJECTIVE_TOOLS = [
    "list_objectives",
    "read_objective",
    "create_objective",
    "update_objective",
    "comment_objective",
  ];

  for (const anchor of ["issue", "notebook"] as const) {
    it(`sert les cinq tools d'objectif (ancrage ${anchor})`, () => {
      const served = names({ anchor, webSearch: true });
      for (const tool of OBJECTIVE_TOOLS) expect(served).toContain(tool);
      expect(new Set(served).size).toBe(served.length);
    });
  }

  it("keeps objective readers and writers in pull-request runs", () => {
    const served = names({ anchor: "pr", webSearch: false });
    for (const tool of OBJECTIVE_TOOLS) expect(served).toContain(tool);
  });

  it("laisse rattacher un ticket à un objectif, à la création comme à la mise à jour", () => {
    const params = (name: string) =>
      agentToolsFor({ anchor: "issue", webSearch: true }).find(
        (t) => t.function.name === name,
      )!.function.parameters;
    for (const name of ["create_issue", "update_issue"]) {
      expect(Object.keys(params(name).properties)).toContain("objective");
    }
    // `update_issue` can detach; `create_issue` has nothing to detach.
    expect(JSON.stringify(params("update_issue").properties.objective)).toMatch(
      /null to detach/,
    );
  });

  it("n'exige jamais un objectif inventé : la référence vient de list_objectives", () => {
    const tools = agentToolsFor({ anchor: "issue", webSearch: true });
    const objectiveRef = (name: string) =>
      String(
        (
          tools.find((t) => t.function.name === name)!.function.parameters
            .properties.objective as { description: string }
        ).description,
      );
    for (const name of [
      "create_issue",
      "update_issue",
      "read_objective",
      "comment_objective",
    ]) {
      expect(objectiveRef(name)).toMatch(/list_objectives/);
    }
    // And `create_objective` says it's not up to him to invent a goal.
    expect(
      tools.find((t) => t.function.name === "create_objective")!.function
        .description,
    ).toMatch(/ONLY when the user asks/);
  });
});

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

  it("routes links through the outbound guard instead of shell fetching", () => {
    expect(description(false)).toContain(
      "fetched by this tool through the outbound-network guard",
    );
    expect(description(false)).toContain(
      "unsafe/private targets and redirect hops are refused",
    );
    expect(description(false)).toContain("never fetch the link separately");
    expect(description(false)).not.toContain("A LINK returns its url");
  });
});

/**
 * MIN-112: ONE-level hierarchy is STRUCTURAL. A subagent does not have
 * `spawn_agent` in its set of tools — it is not a prompt instruction but a
 * model can decide to ignore. Same thing for the ticket, the notebook and the PR:
 * they belong to the parent, and the only reliable way to guarantee this is not to
 * serve them. This test replaces “launch a session and see what it does”.
 */
const _SUBAGENT_READERS = ["read_file", "list_dir", "glob", "grep"];
const _MINDDY_AND_CONTROL = [
  ...MINDDY_TOOLS,
  "create_pr",
  "validate_changes",
  "ask_user",
  "update_plan",
  "run_background",
  "spawn_agent",
  "agent_status",
  "list_agents",
];
describe("agentToolsFor — pull-request anchor", () => {
  const served = names({
    anchor: "pr",
    webSearch: true,
    model: "openai/gpt-5.6-luna",
  });

  it("offers editing, delivery, background, delegation and project tools", () => {
    for (const tool of [
      "validate_changes",
      "create_pr",
      "run_background",
      "update_plan",
      "report_verdict",
      "web_search",
      "update_issue",
      "write_issue_plan",
      "create_issue",
      "read_scratchpad",
      "add_scratchpad_tasks",
      "update_scratchpad_task",
      "set_scratchpad",
    ]) {
      expect(served).toContain(tool);
    }
  });

  it("offers both anchored and project-level pull-request tools", () => {
    for (const tool of [
      "comment_pr_line",
      "comment_pr",
      "reply_pr_thread",
      "comment_pull_request_line",
      "comment_pull_request",
      "reply_pull_request_thread",
      "review_pull_request",
    ]) {
      expect(served).toContain(tool);
    }
    expect(new Set(served).size).toBe(served.length);
  });

  it("describes both issue-targeting cases", () => {
    const readIssue = agentToolsFor({ anchor: "pr", webSearch: false }).find(
      (t) => t.function.name === "read_issue",
    );
    const d = readIssue?.function.description ?? "";
    expect(d).toContain("this pull request implements");
    // Many PRs do not have a ticket (MIN-143): promising a defect that
    // does not exist would burn a round at the first `read_issue` without argument.
    expect(d).toContain("MANY PULL REQUESTS HAVE NO TICKET");
    expect(d).toMatch(/never requires a ticket/);
  });

  it("matches every other anchor and execution context", () => {
    const variants = [
      names({
        anchor: "issue",
        webSearch: true,
        interactive: true,
        local: false,
      }),
      names({
        anchor: "notebook",
        webSearch: true,
        interactive: false,
        local: false,
      }),
      names({ anchor: "pr", webSearch: true, interactive: true, local: true }),
    ];
    for (const variant of variants)
      expect([...variant].sort()).toEqual([...served].sort());
  });
});
