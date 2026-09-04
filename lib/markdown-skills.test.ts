import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Markdown } from "@/components/markdown";
import type { RepositorySkillSummary } from "@/lib/repository-skills";

vi.mock("mangue-ui", () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
}));

describe("markdown skill tokens", () => {
  it("renders the matched skill when name-length sorting changes the input order", () => {
    const skills: RepositorySkillSummary[] = [
      {
        path: ".agents/skills/deploy/SKILL.md",
        name: "deploy",
        description: "Deploy the application",
        source: ".agents/skills",
      },
      {
        path: ".agents/skills/deploy-production/SKILL.md",
        name: "deploy-production",
        description: "Deploy the production application",
        source: ".agents/skills",
      },
    ];

    const html = renderToStaticMarkup(
      createElement(Markdown, {
        skills,
        children: "Use /deploy-production now",
      }),
    );

    expect(html).toContain(">deploy-production</span>");
    expect(html).not.toContain(">deploy</span>");
  });
});
