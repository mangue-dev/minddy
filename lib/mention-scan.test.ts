import { describe, expect, it } from "vitest";
import {
  contentMentionScanner,
  mentionScanner,
  type MentionIssue,
  type MentionObjective,
  type MentionPage,
  type MentionProject,
  type MentionSegment,
} from "./mention-scan";
import type { Member } from "./types";

const member = (full_name: string, user_id = full_name.toLowerCase()) =>
  ({
    user_id,
    full_name,
    email: null,
    avatar_seed: user_id,
  }) as unknown as Member;

const issue = (identifier: string): MentionIssue => ({
  id: `id-${identifier}`,
  project_id: "p1",
  identifier,
  title: `Titre de ${identifier}`,
});

const objective = (name: string): MentionObjective => ({
  id: `id-${name}`,
  project_id: "p1",
  name,
  color: "#3b82f6",
});

const page = (title: string, icon: string | null = null): MentionPage => ({
  id: `id-${title}`,
  project_id: "p1",
  title,
  icon,
});

const project = (name: string): MentionProject => ({
  id: `id-${name}`,
  name,
  key: "MIN",
  avatarSeed: `seed-${name}`,
  iconUrl: "https://example.com/icon.png",
});

/** A compact reading of the division: the text as is, a mention in
 “@Nom” (or “@numo”). */
const shape = (segments: MentionSegment[]) =>
  segments.map((s) =>
    s.mention === undefined
      ? s.text
      : s.mention.type === "numo"
        ? "@numo"
        : s.mention.type === "forge"
          ? `@${s.mention.login}`
          : s.mention.type === "issue"
            ? `@${s.mention.issue.identifier}`
            : s.mention.type === "objective"
              ? `@${s.mention.objective.name}`
              : s.mention.type === "page"
                ? `@${s.mention.page.title}`
                : s.mention.type === "project"
                  ? `@${s.mention.project.name}`
                  : `@${s.mention.member.full_name}`,
  );

describe("mentionScanner", () => {
  it("keeps text without mentions in one segment", () => {
    const scan = mentionScanner([member("Jean")]);
    expect(shape(scan("rien à signaler"))).toEqual(["rien à signaler"]);
  });

  it("splits a member mention in the middle of text", () => {
    const scan = mentionScanner([member("Jean")]);
    expect(shape(scan("dis à @Jean de relire"))).toEqual([
      "dis à ",
      "@Jean",
      " de relire",
    ]);
  });

  it("prefers the longest name", () => {
    const scan = mentionScanner([member("Jean"), member("Jean Dupont")]);
    expect(shape(scan("@Jean Dupont arrive"))).toEqual([
      "@Jean Dupont",
      " arrive",
    ]);
  });

  it("does not match a member name inside a longer mention token", () => {
    const scan = mentionScanner([member("Jean")]);
    expect(shape(scan("@Jeanne"))).toEqual(["@Jeanne"]);
  });

  it("requires exact casing for a member", () => {
    const scan = mentionScanner([member("Jean")]);
    expect(shape(scan("@jean"))).toEqual(["@jean"]);
  });

  it("accepts Numo in any casing", () => {
    const scan = mentionScanner([member("Jean")]);
    expect(shape(scan("@Numo et @NUMO"))).toEqual(["@numo", " et ", "@numo"]);
  });

  it("mentions Numo without any members", () => {
    const scan = mentionScanner([]);
    expect(shape(scan("@numo regarde"))).toEqual(["@numo", " regarde"]);
  });

  it("does not turn every at sign into a chip when no members exist", () => {
    const scan = mentionScanner([]);
    expect(shape(scan("écris à @quelquun"))).toEqual(["écris à @quelquun"]);
  });

  it("does not mention Numo inside an email address", () => {
    const scan = mentionScanner([]);
    expect(shape(scan("clement@numo.dev"))).toEqual(["clement@numo.dev"]);
  });

  it("mentions Numo at the start and after an opening parenthesis", () => {
    const scan = mentionScanner([]);
    expect(shape(scan("@numo (@numo aussi)"))).toEqual([
      "@numo",
      " (",
      "@numo",
      " aussi)",
    ]);
  });

  it("recognizes two mentions separated by a space", () => {
    const scan = mentionScanner([member("Jean"), member("Marie")]);
    expect(shape(scan("@Jean @Marie"))).toEqual(["@Jean", " ", "@Marie"]);
  });
});

describe("contentMentionScanner", () => {
  it("mentions an issue by identifier", () => {
    const scan = contentMentionScanner({ issues: [issue("MIN-42")] });
    expect(shape(scan("bloqué par @MIN-42 depuis hier"))).toEqual([
      "bloqué par ",
      "@MIN-42",
      " depuis hier",
    ]);
  });

  it("leaves a well-formed unknown identifier as text", () => {
    const scan = contentMentionScanner({ issues: [issue("MIN-42")] });
    expect(shape(scan("voir @MIN-99"))).toEqual(["voir @MIN-99"]);
  });

  it("does not mention an issue without an at sign", () => {
    const scan = contentMentionScanner({ issues: [issue("MIN-42")] });
    expect(shape(scan("voir MIN-42"))).toEqual(["voir MIN-42"]);
  });

  it("does not match an issue prefix inside a longer token", () => {
    const scan = contentMentionScanner({ issues: [issue("MIN-42")] });
    expect(shape(scan("@MIN-42x"))).toEqual(["@MIN-42x"]);
  });

  it("mentions an objective by name", () => {
    const scan = contentMentionScanner({
      objectives: [objective("Refonte SEO")],
    });
    expect(shape(scan("dans @Refonte SEO"))).toEqual(["dans ", "@Refonte SEO"]);
  });

  it("mixes member, issue, and objective mentions in one text", () => {
    const scan = contentMentionScanner({
      members: [member("Jean")],
      issues: [issue("MIN-42")],
      objectives: [objective("Refonte SEO")],
    });
    expect(shape(scan("@Jean voit @MIN-42 pour @Refonte SEO"))).toEqual([
      "@Jean",
      " voit ",
      "@MIN-42",
      " pour ",
      "@Refonte SEO",
    ]);
  });

  it("prefers a member when an objective has the same name", () => {
    const scan = contentMentionScanner({
      members: [member("Atlas")],
      objectives: [objective("Atlas")],
    });
    const [first] = scan("@Atlas");
    expect(first.mention?.type).toBe("member");
  });

  it("still mentions Numo in a description", () => {
    const scan = contentMentionScanner({ issues: [issue("MIN-42")] });
    expect(shape(scan("@numo regarde @MIN-42"))).toEqual([
      "@numo",
      " regarde ",
      "@MIN-42",
    ]);
  });

  // MIN-273 — a wiki page is cited as an objective: by its TITLE.
  it("mentions a wiki page by title", () => {
    const scan = contentMentionScanner({
      pages: [page("Guide de démarrage", "📘")],
    });
    const segments = scan("tout est dans @Guide de démarrage");
    expect(shape(segments)).toEqual(["tout est dans ", "@Guide de démarrage"]);
    // The emoji travels with the page: it is its face on the pill.
    expect(segments[1].mention).toMatchObject({
      type: "page",
      page: { icon: "📘" },
    });
  });

  it("prefers the longest page title when one contains another", () => {
    const scan = contentMentionScanner({
      pages: [page("Guide"), page("Guide de démarrage")],
    });
    expect(shape(scan("@Guide de démarrage"))).toEqual(["@Guide de démarrage"]);
  });

  it("prefers an objective when a page has the same name", () => {
    const scan = contentMentionScanner({
      objectives: [objective("Atlas")],
      pages: [page("Atlas")],
    });
    const [first] = scan("@Atlas");
    expect(first.mention?.type).toBe("objective");
  });

  it("mentions a project by name and preserves its visual metadata", () => {
    const scan = contentMentionScanner({
      projects: [project("Minddy Website")],
    });
    const segments = scan("ship this in @Minddy Website");
    expect(shape(segments)).toEqual(["ship this in ", "@Minddy Website"]);
    expect(segments[1].mention).toMatchObject({
      type: "project",
      project: {
        id: "id-Minddy Website",
        avatarSeed: "seed-Minddy Website",
        iconUrl: "https://example.com/icon.png",
      },
    });
  });

  it("does not turn every at sign into a chip without sources", () => {
    const scan = contentMentionScanner({});
    expect(shape(scan("écris à @quelquun"))).toEqual(["écris à @quelquun"]);
  });
});
