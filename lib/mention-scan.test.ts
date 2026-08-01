import { describe, expect, it } from "vitest";
import { mentionScanner, type MentionSegment } from "./mention-scan";
import type { Member } from "./types";

const member = (full_name: string, user_id = full_name.toLowerCase()) =>
  ({ user_id, full_name, email: null, avatar_seed: user_id }) as unknown as Member;

/** Une lecture compacte du découpage : le texte tel quel, une mention en
    « @Nom » (ou « @numo »). */
const shape = (segments: MentionSegment[]) =>
  segments.map((s) =>
    s.mention === undefined
      ? s.text
      : s.mention.type === "numo"
        ? "@numo"
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
