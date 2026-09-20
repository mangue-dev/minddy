import { describe, expect, it } from "vitest";
import {
  buildIssueCustomPrompt,
  buildIssuePlanPrompt,
  buildIssuePrompt,
  buildIssueVerifyPrompt,
  buildMultiIssuePrompt,
  promptRelations,
} from "@/lib/issue-prompt";
import type { Issue } from "@/lib/types";

const issue = {
  id: "issue-1",
  project_id: "proj-1",
  number: 42,
  title: "Rendre la palette navigable au clavier",
  description: "Les flèches ne bougent pas la sélection.",
  status: "todo",
  priority: "high",
  effort: "m",
  due_date: null,
  plan: null,
  category_ids: [],
  resource_count: 0,
} as unknown as Issue;

const input = {
  issue,
  projectId: "proj-1",
  projectKey: "MIN",
  categories: ["UI"],
  relations: [{ type: "blocks" as const, identifier: "MIN-7", title: "Palette v2" }],
  resourceCount: 2,
};

describe("buildIssuePrompt", () => {
  it("describes the issue and sends the agent to the MCP to write the missing plan", () => {
    const prompt = buildIssuePrompt(input);
    expect(prompt).toContain("Work on this minddy issue.");
    expect(prompt).toContain("<identifier>MIN-42</identifier>");
    expect(prompt).toContain("<category>UI</category>");
    expect(prompt).toContain('<relation type="blocks">');
    expect(prompt).toContain('<resources count="2" />');
    expect(prompt).toContain("This issue has no implementation plan yet.");
    expect(prompt).toContain("minddy_update_issues");
  });

  it("reports an existing plan and its progress, without ever inlining it", () => {
    const prompt = buildIssuePrompt({
      ...input,
      issue: { ...issue, plan: "- [x] a\n- [ ] b\n- [ ] c" } as Issue,
    });
    expect(prompt).toContain("(1/3 tasks done)");
    expect(prompt).not.toContain("- [x] a");
    expect(prompt).toContain("minddy_update_plan_task");
  });
});

describe("buildIssuePlanPrompt", () => {
  it("asks for the plan and nothing else, with the issue's MCP parameters", () => {
    const prompt = buildIssuePlanPrompt(input);
    expect(prompt).toContain("Write the implementation plan for this minddy issue.");
    expect(prompt).toContain("Do NOT implement it.");
    expect(prompt).toContain("<identifier>MIN-42</identifier>");
    expect(prompt).toContain('project_id "proj-1"');
    expect(prompt).toContain('issue "MIN-42"');
    expect(prompt).toContain("minddy_update_issues");
    expect(prompt).toContain("Stop once the plan is written");
  });

  it("without MCP, points to a local file rather than the model's answer", () => {
    const prompt = buildIssuePlanPrompt(input);
    expect(prompt).toContain("write the plan to a local markdown file");
    expect(prompt).toContain("MIN-42-plan.md");
    expect(prompt).toContain("point me to it");
  });

  it("with an existing plan: asks to REVIEW it point by point, not to write one", () => {
    const prompt = buildIssuePlanPrompt({
      ...input,
      issue: { ...issue, plan: "## Approche\n\n- [x] a\n- [ ] b\n- [ ] c" } as Issue,
    });
    expect(prompt).toContain("Review the implementation plan");
    expect(prompt).toContain("task by task");
    expect(prompt).toContain("(1/3 tasks done)");
    expect(prompt).not.toContain("Write the implementation plan");
    // The plan itself is never inlined: the agent reads it via the MCP.
    expect(prompt).not.toContain("- [x] a");
    expect(prompt).toContain("minddy_get_issue");
    expect(prompt).toContain("minddy_update_issues");
    expect(prompt).toContain("ask me to paste the current plan");
  });

  it("a plan without tasks (prose only) stays a writing request", () => {
    const prompt = buildIssuePlanPrompt({
      ...input,
      issue: { ...issue, plan: "Quelques notes en vrac." } as Issue,
    });
    expect(prompt).toContain("Write the implementation plan");
  });
});

describe("buildIssueCustomPrompt", () => {
  const instructions = "Ne touche qu'au menu contextuel, sans changer les raccourcis.";

  it("keeps the issue context around the user's instruction", () => {
    const prompt = buildIssueCustomPrompt(input, instructions);
    expect(prompt).toContain("Work on this minddy issue");
    expect(prompt).toContain("<identifier>MIN-42</identifier>");
    expect(prompt).toContain("<category>UI</category>");
    expect(prompt).toContain('<relation type="blocks">');
    expect(prompt).toContain('<resources count="2" />');
    expect(prompt).toContain(instructions);
    expect(prompt).toContain('project_id "proj-1"');
    expect(prompt).toContain("minddy_add_comment");
  });

  it("places the instruction IN THE MIDDLE: after the issue, before the MCP steps", () => {
    const prompt = buildIssueCustomPrompt(input, instructions);
    expect(prompt.indexOf("</issue>")).toBeLessThan(prompt.indexOf(instructions));
    expect(prompt.indexOf(instructions)).toBeLessThan(
      prompt.indexOf("minddy_get_issue")
    );
  });

  it("does NOT impose the implementation instruction: the user's is the request", () => {
    const prompt = buildIssueCustomPrompt(input, instructions);
    expect(prompt).toContain("these instructions are the request itself");
    expect(prompt).not.toContain("Before writing any code, produce a real implementation plan");
  });

  it("reports an existing plan without inlining it, and only asks to follow it when there is one", () => {
    const planned = buildIssueCustomPrompt(
      { ...input, issue: { ...issue, plan: "- [x] a\n- [ ] b" } as Issue },
      instructions
    );
    expect(planned).toContain("(1/2 tasks done)");
    expect(planned).not.toContain("- [x] a");
    expect(planned).toContain("minddy_update_plan_task");
    expect(buildIssueCustomPrompt(input, instructions)).not.toContain(
      "minddy_update_plan_task"
    );
  });

  it("reframes the instruction (surrounding spaces) without rewriting it", () => {
    const prompt = buildIssueCustomPrompt(input, `\n  ${instructions}  \n`);
    expect(prompt).toContain(`\n\n${instructions}\n\n`);
  });
});

describe("buildIssueVerifyPrompt", () => {
  const planned = {
    ...input,
    issue: { ...issue, plan: "## Approche\n\n- [x] a\n- [x] b\n- [ ] c" } as Issue,
  };

  it("asks to confront the code with the plan AND the comments, then fix", () => {
    const prompt = buildIssueVerifyPrompt(planned);
    expect(prompt).toContain("Verify the implementation of this minddy issue");
    expect(prompt).toContain("<identifier>MIN-42</identifier>");
    expect(prompt).toContain("(2/3 tasks done)");
    expect(prompt).toContain("its comments");
    expect(prompt).toContain("minddy_get_issue");
    expect(prompt).toContain("minddy_update_plan_task");
    expect(prompt).toContain("minddy_add_comment");
    // The plan is never inlined: the agent reads it via the MCP.
    expect(prompt).not.toContain("- [x] a");
  });

  it("requires PROVEN bugs: what is merely suspected gets reported, not \"fixed\"", () => {
    const prompt = buildIssueVerifyPrompt(planned);
    expect(prompt).toContain("Fix each bug you can actually prove");
    expect(prompt).toContain('report it instead of "fixing" it');
    expect(prompt).toContain("Don't refactor what works");
  });

  it("without MCP, asks for the plan and the comments rather than guessing them", () => {
    const prompt = buildIssueVerifyPrompt(planned);
    expect(prompt).toContain("ask me to paste the plan and the comments");
  });

  it("issue without a plan: the issue and its comments ARE the specification", () => {
    const prompt = buildIssueVerifyPrompt(input);
    expect(prompt).toContain("This issue has no implementation plan");
    expect(prompt).toContain("its comments are the whole specification");
    // Nothing to correct: no task status to correct without a plan.
    expect(prompt).not.toContain("minddy_update_plan_task");
    expect(prompt).toContain("ask me for its comments");
  });
});

describe("buildMultiIssuePrompt", () => {
  const second = {
    ...issue,
    id: "issue-2",
    number: 43,
    title: "Second issue",
    description: "",
    effort: null,
  } as unknown as Issue;

  it("wraps every selected issue in ONE prompt, not one prompt per issue", () => {
    const prompt = buildMultiIssuePrompt([input, { ...input, issue: second }]);
    expect(prompt).toContain("Work on these minddy issues.");
    expect(prompt).toContain("<issues>");
    expect(prompt.match(/<issue>/g)?.length).toBe(2);
    expect(prompt).toContain("<identifier>MIN-42</identifier>");
    expect(prompt).toContain("<identifier>MIN-43</identifier>");
    expect(prompt).not.toContain("Work on this minddy issue.");
  });

  it("announces each issue's plan progress in its block, without inlining any plan", () => {
    const prompt = buildMultiIssuePrompt([
      { ...input, issue: { ...issue, plan: "- [x] a\n- [ ] b" } as Issue },
      { ...input, issue: second },
    ]);
    expect(prompt).toContain("<plan_progress>1/2 tasks done</plan_progress>");
    expect(prompt).not.toContain("- [x] a");
  });

  it("one project for the whole selection: compact MCP parameters", () => {
    const prompt = buildMultiIssuePrompt([input, { ...input, issue: second }]);
    expect(prompt).toContain('project_id "proj-1", issues "MIN-42, MIN-43"');
    expect(prompt).not.toContain("(project_id");
  });

  it("a mixed selection lists each issue with its own project id", () => {
    const prompt = buildMultiIssuePrompt([
      input,
      { ...input, issue: { ...second, project_id: "proj-2" }, projectId: "proj-2" },
    ]);
    expect(prompt).toContain('MIN-42 (project_id "proj-1"), MIN-43 (project_id "proj-2")');
  });

  it("sends the agent through the MCP per issue, and stays usable without it", () => {
    const prompt = buildMultiIssuePrompt([input]);
    expect(prompt).toContain("minddy_get_issue");
    expect(prompt).toContain("minddy_update_plan_task");
    expect(prompt).toContain("minddy_update_issues");
    expect(prompt).toContain("skip the MCP steps");
  });

  it("an empty selection produces no prompt", () => {
    expect(buildMultiIssuePrompt([])).toBe("");
  });
});

describe("promptRelations", () => {
  it("resolves each end to an identifier and a title, objectives included", () => {
    const relations = promptRelations(
      [
        { relation: "blocks" as const, otherId: "issue-1", otherType: "issue" as const },
        { relation: "related" as const, otherId: "obj-1", otherType: "objective" as const },
      ],
      {
        identifierOf: (otherId) => (otherId === "issue-1" ? "MIN-7" : ""),
        titleOf: (otherId) =>
          otherId === "issue-1" ? "Palette v2" : "Objective name",
      }
    );
    expect(relations).toEqual([
      { type: "blocks", objective: false, identifier: "MIN-7", title: "Palette v2" },
      { type: "related", objective: true, identifier: "", title: "Objective name" },
    ]);
  });

  it("tolerates missing ends and an absent relation list", () => {
    expect(promptRelations(undefined, { titleOf: () => "" })).toEqual([]);
    const relations = promptRelations(
      [{ relation: "related" as const, otherId: "gone" }],
      { identifierOf: () => "", titleOf: () => "" }
    );
    expect(relations).toEqual([
      { type: "related", objective: false, identifier: "", title: "" },
    ]);
  });
});
