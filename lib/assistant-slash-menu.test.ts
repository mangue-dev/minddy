import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SquarePen } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("mangue-ui", () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
}));

const command = {
  kind: "command",
  id: "create-issue",
  label: "create issue",
  description: "Create a complete issue",
  keywords: ["ticket"],
} as const;

describe("Numo slash options", () => {
  const skills = [{
    kind: "skill",
    id: ".agents/skills/release/SKILL.md",
    label: "release",
    description: "Publish signed artifacts",
  }] as const;

  it("searches commands and skills by label, description, and command aliases", () => {
    expect(filterSlashOptions([command, ...skills], "ticket")).toEqual([command]);
    expect(filterSlashOptions([command, ...skills], "signed")).toEqual(skills);
    expect(filterSlashOptions([command, ...skills], "release")).toEqual(skills);
  });

  it("recognizes slash commands and Codex-style dollar skill triggers", () => {
    expect(composerMenuTrigger("/release")).toEqual({
      prefix: "/",
      query: "release",
    });
    expect(composerMenuTrigger("$release")).toEqual({
      prefix: "$",
      query: "release",
    });
    expect(composerMenuTrigger("use $release")).toBeNull();
    expect(composerMenuTrigger("$release\nnow")).toBeNull();
  });

  it("finds slash and dollar skill queries immediately before the caret", () => {
    expect(findActiveComposerMenuQuery("Use /release")).toEqual({
      start: 4,
      end: 12,
      prefix: "/",
      query: "release",
    });
    expect(findActiveComposerMenuQuery("Before $release after"))
      .toEqual({
        start: 7,
        end: 21,
        prefix: "$",
        query: "release after",
      });
    expect(findActiveComposerMenuQuery("First line\n$release")).toEqual({
      start: 11,
      end: 19,
      prefix: "$",
      query: "release",
    });
  });

  it("ignores path separators, repeated triggers, and completed queries", () => {
    expect(findActiveComposerMenuQuery("docs/release")).toBeNull();
    expect(findActiveComposerMenuQuery("Use /first/second")).toBeNull();
    expect(findActiveComposerMenuQuery("Use $release  next")).toBeNull();
  });

  it("shows trigger prefixes only on commands and styles skill rows in emerald", () => {
    const skillOptions = repositorySkillOptions([
      {
        path: ".agents/skills/release/SKILL.md",
        name: "release",
        description: "Publish signed artifacts",
        source: ".agents/skills",
      },
    ]);
    const commandOption = {
      ...command,
      keywords: [...command.keywords],
      icon: SquarePen,
    };
    const props = {
      activeIndex: 0,
      onPick: () => {},
      onHover: () => {},
    };
    const slashHtml = renderToStaticMarkup(
      createElement(SlashMenu, {
        ...props,
        prefix: "/",
        options: [commandOption, ...skillOptions],
      }),
    );
    const dollarHtml = renderToStaticMarkup(
      createElement(SlashMenu, {
        ...props,
        prefix: "$",
        options: skillOptions,
      }),
    );

    expect(slashHtml).toContain(">/create issue</span>");
    expect(slashHtml).toContain(">release</span>");
    expect(slashHtml).not.toContain(">/release</span>");
    expect(dollarHtml).toContain(">release</span>");
    expect(dollarHtml).not.toContain(">$release</span>");
    expect(dollarHtml).toContain("bg-emerald-500/10");
    expect(dollarHtml).toContain("text-emerald-700");
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
