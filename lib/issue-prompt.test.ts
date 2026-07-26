import { describe, expect, it } from "vitest";
import { buildIssuePlanPrompt, buildIssuePrompt } from "@/lib/issue-prompt";
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
  attachment_count: 0,
} as unknown as Issue;

const input = {
  issue,
  projectId: "proj-1",
  projectKey: "MIN",
  categories: ["UI"],
  relations: [{ type: "blocks" as const, identifier: "MIN-7", title: "Palette v2" }],
  attachmentCount: 2,
};

describe("buildIssuePrompt", () => {
  it("décrit le ticket et renvoie l'agent vers le MCP pour écrire le plan absent", () => {
    const prompt = buildIssuePrompt(input);
    expect(prompt).toContain("Work on this minddy issue.");
    expect(prompt).toContain("<identifier>MIN-42</identifier>");
    expect(prompt).toContain("<category>UI</category>");
    expect(prompt).toContain('<relation type="blocks">');
    expect(prompt).toContain('<attachments count="2" />');
    expect(prompt).toContain("This issue has no implementation plan yet.");
    expect(prompt).toContain("minddy_update_issues");
  });

  it("signale un plan existant et son avancée, sans jamais l'inliner", () => {
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
  it("demande le plan et rien d'autre, avec les paramètres MCP du ticket", () => {
    const prompt = buildIssuePlanPrompt(input);
    expect(prompt).toContain("Write the implementation plan for this minddy issue.");
    expect(prompt).toContain("Do NOT implement it.");
    expect(prompt).toContain("<identifier>MIN-42</identifier>");
    expect(prompt).toContain('project_id "proj-1"');
    expect(prompt).toContain('issue "MIN-42"');
    expect(prompt).toContain("minddy_update_issues");
    expect(prompt).toContain("Stop once the plan is written");
  });

  it("sans MCP, renvoie vers un fichier local plutôt que vers la réponse du modèle", () => {
    const prompt = buildIssuePlanPrompt(input);
    expect(prompt).toContain("write the plan to a local markdown file");
    expect(prompt).toContain("MIN-42-plan.md");
    expect(prompt).toContain("point me to it");
  });
});
