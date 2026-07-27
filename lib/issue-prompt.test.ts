import { describe, expect, it } from "vitest";
import {
  buildIssuePlanPrompt,
  buildIssuePrompt,
  buildIssueVerifyPrompt,
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

  it("plan existant : demande de le VÉRIFIER point par point, pas d'en écrire un", () => {
    const prompt = buildIssuePlanPrompt({
      ...input,
      issue: { ...issue, plan: "## Approche\n\n- [x] a\n- [ ] b\n- [ ] c" } as Issue,
    });
    expect(prompt).toContain("Review the implementation plan");
    expect(prompt).toContain("task by task");
    expect(prompt).toContain("(1/3 tasks done)");
    expect(prompt).not.toContain("Write the implementation plan");
    // Le plan lui-même n'est jamais inliné : l'agent le lit via le MCP.
    expect(prompt).not.toContain("- [x] a");
    expect(prompt).toContain("minddy_get_issue");
    expect(prompt).toContain("minddy_update_issues");
    expect(prompt).toContain("ask me to paste the current plan");
  });

  it("plan sans tâche (prose seule) : reste une demande d'écriture", () => {
    const prompt = buildIssuePlanPrompt({
      ...input,
      issue: { ...issue, plan: "Quelques notes en vrac." } as Issue,
    });
    expect(prompt).toContain("Write the implementation plan");
  });
});

describe("buildIssueVerifyPrompt", () => {
  const planned = {
    ...input,
    issue: { ...issue, plan: "## Approche\n\n- [x] a\n- [x] b\n- [ ] c" } as Issue,
  };

  it("demande de confronter le code au plan ET aux commentaires, puis de corriger", () => {
    const prompt = buildIssueVerifyPrompt(planned);
    expect(prompt).toContain("Verify the implementation of this minddy issue");
    expect(prompt).toContain("<identifier>MIN-42</identifier>");
    expect(prompt).toContain("(2/3 tasks done)");
    expect(prompt).toContain("its comments");
    expect(prompt).toContain("minddy_get_issue");
    expect(prompt).toContain("minddy_update_plan_task");
    expect(prompt).toContain("minddy_add_comment");
    // Le plan n'est jamais inliné : l'agent le lit via le MCP.
    expect(prompt).not.toContain("- [x] a");
  });

  it("exige des bugs PROUVÉS : ce qui est soupçonné se signale, pas se « corrige »", () => {
    const prompt = buildIssueVerifyPrompt(planned);
    expect(prompt).toContain("Fix each bug you can actually prove");
    expect(prompt).toContain('report it instead of "fixing" it');
    expect(prompt).toContain("Don't refactor what works");
  });

  it("sans MCP, réclame le plan et les commentaires plutôt que de les deviner", () => {
    const prompt = buildIssueVerifyPrompt(planned);
    expect(prompt).toContain("ask me to paste the plan and the comments");
  });

  it("ticket sans plan : le ticket et ses commentaires SONT la spécification", () => {
    const prompt = buildIssueVerifyPrompt(input);
    expect(prompt).toContain("This issue has no implementation plan");
    expect(prompt).toContain("its comments are the whole specification");
    // Rien à recaler : pas d'état de tâche à corriger sans plan.
    expect(prompt).not.toContain("minddy_update_plan_task");
    expect(prompt).toContain("ask me for its comments");
  });
});
