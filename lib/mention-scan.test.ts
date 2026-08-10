import { describe, expect, it } from "vitest";
import {
  contentMentionScanner,
  mentionScanner,
  type MentionIssue,
  type MentionObjective,
  type MentionPage,
  type MentionSegment,
} from "./mention-scan";
import type { Member } from "./types";

const member = (full_name: string, user_id = full_name.toLowerCase()) =>
  ({ user_id, full_name, email: null, avatar_seed: user_id }) as unknown as Member;

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

/** Une lecture compacte du découpage : le texte tel quel, une mention en
    « @Nom » (ou « @numo »). */
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
                : `@${s.mention.member.full_name}`,
  );

describe("mentionScanner", () => {
  it("laisse un texte sans mention d'un seul tenant", () => {
    const scan = mentionScanner([member("Jean")]);
    expect(shape(scan("rien à signaler"))).toEqual(["rien à signaler"]);
  });

  it("découpe une mention de membre au milieu du texte", () => {
    const scan = mentionScanner([member("Jean")]);
    expect(shape(scan("dis à @Jean de relire"))).toEqual([
      "dis à ",
      "@Jean",
      " de relire",
    ]);
  });

  it("préfère le nom le plus long", () => {
    const scan = mentionScanner([member("Jean"), member("Jean Dupont")]);
    expect(shape(scan("@Jean Dupont arrive"))).toEqual(["@Jean Dupont", " arrive"]);
  });

  it("exige la casse exacte pour un membre", () => {
    const scan = mentionScanner([member("Jean")]);
    expect(shape(scan("@jean"))).toEqual(["@jean"]);
  });

  it("accepte « numo » dans n'importe quelle casse", () => {
    const scan = mentionScanner([member("Jean")]);
    expect(shape(scan("@Numo et @NUMO"))).toEqual(["@numo", " et ", "@numo"]);
  });

  it("cite Numo même sans aucun membre", () => {
    const scan = mentionScanner([]);
    expect(shape(scan("@numo regarde"))).toEqual(["@numo", " regarde"]);
  });

  it("ne fait pas une pilule de chaque « @ » quand il n'y a pas de membre", () => {
    const scan = mentionScanner([]);
    expect(shape(scan("écris à @quelquun"))).toEqual(["écris à @quelquun"]);
  });

  it("ne cite pas Numo dans une adresse e-mail", () => {
    const scan = mentionScanner([]);
    expect(shape(scan("clement@numo.dev"))).toEqual(["clement@numo.dev"]);
  });

  it("cite Numo en début de texte et après une parenthèse", () => {
    const scan = mentionScanner([]);
    expect(shape(scan("@numo (@numo aussi)"))).toEqual([
      "@numo",
      " (",
      "@numo",
      " aussi)",
    ]);
  });

  it("enchaîne deux mentions collées par un espace", () => {
    const scan = mentionScanner([member("Jean"), member("Marie")]);
    expect(shape(scan("@Jean @Marie"))).toEqual(["@Jean", " ", "@Marie"]);
  });
});

describe("contentMentionScanner", () => {
  it("cite un ticket par son identifiant", () => {
    const scan = contentMentionScanner({ issues: [issue("MIN-42")] });
    expect(shape(scan("bloqué par @MIN-42 depuis hier"))).toEqual([
      "bloqué par ",
      "@MIN-42",
      " depuis hier",
    ]);
  });

  it("laisse en texte un identifiant bien formé mais inconnu", () => {
    const scan = contentMentionScanner({ issues: [issue("MIN-42")] });
    expect(shape(scan("voir @MIN-99"))).toEqual(["voir @MIN-99"]);
  });

  it("ne cite pas un ticket sans arobase", () => {
    const scan = contentMentionScanner({ issues: [issue("MIN-42")] });
    expect(shape(scan("voir MIN-42"))).toEqual(["voir MIN-42"]);
  });

  it("ne prend pas « @MIN-42 » dans « @MIN-42x »", () => {
    const scan = contentMentionScanner({ issues: [issue("MIN-42")] });
    expect(shape(scan("@MIN-42x"))).toEqual(["@MIN-42x"]);
  });

  it("cite un objectif par son nom", () => {
    const scan = contentMentionScanner({ objectives: [objective("Refonte SEO")] });
    expect(shape(scan("dans @Refonte SEO"))).toEqual(["dans ", "@Refonte SEO"]);
  });

  it("mêle personne, ticket et objectif dans un même texte", () => {
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

  it("donne la personne, pas l'objectif, quand les deux portent le même nom", () => {
    const scan = contentMentionScanner({
      members: [member("Atlas")],
      objectives: [objective("Atlas")],
    });
    const [first] = scan("@Atlas");
    expect(first.mention?.type).toBe("member");
  });

  it("cite encore Numo dans une description", () => {
    const scan = contentMentionScanner({ issues: [issue("MIN-42")] });
    expect(shape(scan("@numo regarde @MIN-42"))).toEqual([
      "@numo",
      " regarde ",
      "@MIN-42",
    ]);
  });

  // MIN-273 — une page du wiki se cite comme un objectif : par son TITRE.
  it("cite une page du wiki par son titre", () => {
    const scan = contentMentionScanner({ pages: [page("Guide de démarrage", "📘")] });
    const segments = scan("tout est dans @Guide de démarrage");
    expect(shape(segments)).toEqual(["tout est dans ", "@Guide de démarrage"]);
    // L'émoji voyage avec la page : c'est sa figure sur la pilule.
    expect(segments[1].mention).toMatchObject({
      type: "page",
      page: { icon: "📘" },
    });
  });

  it("préfère le plus long titre de page quand l'un contient l'autre", () => {
    const scan = contentMentionScanner({
      pages: [page("Guide"), page("Guide de démarrage")],
    });
    expect(shape(scan("@Guide de démarrage"))).toEqual(["@Guide de démarrage"]);
  });

  it("donne l'objectif, pas la page, quand les deux portent le même nom", () => {
    const scan = contentMentionScanner({
      objectives: [objective("Atlas")],
      pages: [page("Atlas")],
    });
    const [first] = scan("@Atlas");
    expect(first.mention?.type).toBe("objective");
  });

  it("ne fait pas une pilule de chaque « @ » sans aucune source", () => {
    const scan = contentMentionScanner({});
    expect(shape(scan("écris à @quelquun"))).toEqual(["écris à @quelquun"]);
  });
});
