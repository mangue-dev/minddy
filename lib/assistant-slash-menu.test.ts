import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SkillChip } from "@/components/assistant/skill-chip";
import {
  SlashMenu,
  repositorySkillOptions,
} from "@/components/assistant/slash-menu";
import {
  composerMenuTrigger,
  filterSlashOptions,
  findActiveComposerMenuQuery,
} from "./assistant-slash-options";

describe("Numo slash options", () => {
  const skills = [{
    id: ".agents/skills/release/SKILL.md",
    label: "release",
    description: "Publish signed artifacts",
  }, {
    id: ".agents/skills/triage/SKILL.md",
    label: "triage",
    description: "Sort incoming reports",
  }] as const;

  it("searches skills by label and description", () => {
    expect(filterSlashOptions(skills, "signed")).toEqual([skills[0]]);
    expect(filterSlashOptions(skills, "TRIAGE")).toEqual([skills[1]]);
    expect(filterSlashOptions(skills, "")).toEqual(skills);
    expect(filterSlashOptions(skills, "deploy")).toEqual([]);
  });

  it("recognizes slash triggers, and no longer a dollar one (MIN-872)", () => {
    expect(composerMenuTrigger("/release")).toEqual({
      prefix: "/",
      query: "release",
    });
    expect(composerMenuTrigger("$release")).toBeNull();
    expect(composerMenuTrigger("/release\nnow")).toBeNull();
  });

  it("finds slash queries immediately before the caret", () => {
    expect(findActiveComposerMenuQuery("Use /release")).toEqual({
      start: 4,
      end: 12,
      prefix: "/",
      query: "release",
    });
    expect(findActiveComposerMenuQuery("First line\n/release")).toEqual({
      start: 11,
      end: 19,
      prefix: "/",
      query: "release",
    });
    expect(findActiveComposerMenuQuery("Before $release after")).toBeNull();
  });

  it("ignores path separators, repeated triggers, and completed queries", () => {
    expect(findActiveComposerMenuQuery("docs/release")).toBeNull();
    expect(findActiveComposerMenuQuery("Use /first/second")).toBeNull();
    expect(findActiveComposerMenuQuery("Use /release  next")).toBeNull();
    expect(findActiveComposerMenuQuery("Use /release. ")).toBeNull();
    expect(findActiveComposerMenuQuery("Use / ")).toBeNull();
    expect(findActiveComposerMenuQuery("Use /release ")?.query).toBe("release ");
  });

  it("lists skills without a slash prefix and styles their rows in emerald", () => {
    const skillOptions = repositorySkillOptions([
      {
        path: ".agents/skills/release/SKILL.md",
        name: "release",
        description: "Publish signed artifacts",
        source: ".agents/skills",
      },
    ]);
    const props = {
      activeIndex: 0,
      onPick: () => {},
      onHover: () => {},
    };
    const skillHtml = renderToStaticMarkup(
      createElement(SlashMenu, { ...props, options: skillOptions }),
    );

    expect(skillHtml).toContain(">release</span>");
    expect(skillHtml).not.toContain(">/release</span>");
    expect(skillHtml).toContain("bg-emerald-500/10");
    expect(skillHtml).toContain("text-emerald-700");
  });

  it("renders skill badges without a slash prefix", () => {
    const html = renderToStaticMarkup(
      createElement(SkillChip, { name: "release" }),
    );

    expect(html).toContain(">release</span>");
    expect(html).not.toContain(">/release</span>");
  });

  it("exposes clickable composer skill badges as dialog triggers", () => {
    const html = renderToStaticMarkup(
      createElement(SkillChip, { name: "release", onClick: () => {} }),
    );

    expect(html).toContain("<button");
    expect(html).toContain('aria-haspopup="dialog"');
  });
});
