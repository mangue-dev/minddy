import { describe, expect, it } from "vitest";
import { forgeMentionScanner, type MentionSegment } from "./mention-scan";

/** Accounts as the Forge serves them. */
const member = (login: string) => ({ login, avatar_url: `https://avatars/${login}.png` });

const shape = (segments: MentionSegment[]) =>
  segments.map((s) =>
    s.mention === undefined
      ? s.text
      : s.mention.type === "numo"
        ? "@numo"
        : s.mention.type === "forge"
          ? `@${s.mention.login}`
          : "@?",
  );

describe("forgeMentionScanner", () => {
  it("reconnaît un login de la forge", () => {
    const scan = forgeMentionScanner([member("mangue-dev")]);
    expect(shape(scan("ping @mangue-dev sur ce point"))).toEqual([
      "ping ",
      "@mangue-dev",
      " sur ce point",
    ]);
  });

  it("le plus long gagne — un login n'est pas mangé par son préfixe", () => {
    const scan = forgeMentionScanner([member("bob"), member("bobby")]);
    expect(shape(scan("@bobby et @bob"))).toEqual(["@bobby", " et ", "@bob"]);
  });

  it("ignore un compte qui n'est pas du dépôt : rien à résoudre", () => {
    const scan = forgeMentionScanner([member("mangue-dev")]);
    expect(shape(scan("@inconnu regarde ça"))).toEqual(["@inconnu regarde ça"]);
  });

  it("@numo reste reconnu, à casse libre — c'est minddy qui le traite", () => {
    const scan = forgeMentionScanner([member("mangue-dev")]);
    expect(shape(scan("@Numo peux-tu relire ?"))).toEqual(["@numo", " peux-tu relire ?"]);
    expect(shape(scan("cc @NUMO"))).toEqual(["cc ", "@numo"]);
  });

  it("une adresse e-mail ne cite personne", () => {
    const scan = forgeMentionScanner([member("mangue-dev")]);
    expect(shape(scan("écris à clement@numo.dev"))).toEqual(["écris à clement@numo.dev"]);
  });

  it("sans aucun compte, seul @numo reste reconnaissable", () => {
    const scan = forgeMentionScanner([]);
    expect(shape(scan("@numo et @personne"))).toEqual(["@numo", " et @personne"]);
    // The scanner's safeguard: an empty list must not transform each
    // « @ » du texte en mention.
    expect(shape(scan("a @ b @ c"))).toEqual(["a @ b @ c"]);
  });

  it("porte l'avatar de la forge, pas une graine minddy", () => {
    const scan = forgeMentionScanner([member("mangue-dev")]);
    const [segment] = scan("@mangue-dev");
    expect(segment.mention).toEqual({
      type: "forge",
      login: "mangue-dev",
      avatarUrl: "https://avatars/mangue-dev.png",
    });
  });
});
