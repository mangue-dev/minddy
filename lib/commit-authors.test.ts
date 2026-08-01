import { describe, expect, it } from "vitest";
import {
  commitAuthors,
  mergeCommitAuthors,
  parseCoAuthorTrailers,
} from "@/lib/commit-authors";

/** Le trailer tel que les agents l'écrivent réellement dans ce dépôt. */
const MESSAGE = [
  "feat: une chose",
  "",
  "Le corps du message.",
  "",
  "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>",
].join("\n");

describe("parseCoAuthorTrailers", () => {
  it("lit le trailer quelle que soit sa casse", () => {
    expect(parseCoAuthorTrailers(MESSAGE)).toEqual([
      {
        login: null,
        name: "Claude Opus 5 (1M context)",
        avatar_url: null,
        email: "noreply@anthropic.com",
      },
    ]);
    expect(parseCoAuthorTrailers("co-authored-by: a <a@b.c>")).toHaveLength(1);
  });

  it("en lit plusieurs, dans l'ordre du message", () => {
    const names = parseCoAuthorTrailers(
      ["titre", "", "Co-authored-by: Un <un@x.test>", "Co-authored-by: Deux <deux@x.test>"].join("\n"),
    ).map((a) => a.name);
    expect(names).toEqual(["Un", "Deux"]);
  });

  it("ignore ce qui n'est pas un trailer : pas d'email, pas de nom, autre mot-clé", () => {
    expect(parseCoAuthorTrailers("Co-authored-by: sans email")).toEqual([]);
    expect(parseCoAuthorTrailers("Co-authored-by: <vide@x.test>")).toEqual([]);
    expect(parseCoAuthorTrailers("Signed-off-by: Un <un@x.test>")).toEqual([]);
    expect(parseCoAuthorTrailers("")).toEqual([]);
  });
});

describe("commitAuthors", () => {
  const commit = {
    message: MESSAGE,
    author: { login: "mangue-dev", avatar_url: "https://avatars/mangue-dev" },
    authorName: "mangué",
    authorEmail: "81526886+mangue-dev@users.noreply.github.com",
  };

  it("rend la réponse de la forge telle quelle — elle seule porte les comptes", () => {
    const fromForge = [
      { login: "mangue-dev", name: "mangué", avatar_url: "https://avatars/mangue-dev" },
      { login: "claude", name: "Claude Opus 5", avatar_url: "https://avatars/claude" },
    ];
    expect(commitAuthors(commit, fromForge)).toBe(fromForge);
  });

  it("reconstruit depuis les trailers quand la forge n'a rien résolu (GitLab)", () => {
    expect(commitAuthors(commit)).toEqual([
      { login: "mangue-dev", name: "mangué", avatar_url: "https://avatars/mangue-dev" },
      { login: null, name: "Claude Opus 5 (1M context)", avatar_url: null },
    ]);
  });

  it("ne compte pas deux fois l'auteur re-déclaré en trailer", () => {
    const selfSigned = {
      ...commit,
      message: [
        "titre",
        "",
        `Co-authored-by: mangué <${commit.authorEmail}>`,
        "Co-authored-by: Claude <noreply@anthropic.com>",
      ].join("\n"),
    };
    expect(commitAuthors(selfSigned).map((a) => a.name)).toEqual(["mangué", "Claude"]);
  });

  it("dédoublonne aussi sur le NOM quand les emails ne se recoupent pas", () => {
    const noEmail = {
      ...commit,
      authorEmail: null,
      message: ["titre", "", "Co-authored-by: mangué <autre@x.test>"].join("\n"),
    };
    expect(commitAuthors(noEmail)).toHaveLength(1);
  });

  it("rend l'auteur seul sans trailer, et vide quand le commit n'a aucun auteur", () => {
    expect(commitAuthors({ ...commit, message: "titre nu" })).toHaveLength(1);
    expect(
      commitAuthors({ message: "titre", author: null, authorName: null, authorEmail: null }),
    ).toEqual([]);
  });
});

describe("mergeCommitAuthors", () => {
  const dev = { login: "mangue-dev", name: "mangué", avatar_url: null };
  const claude = { login: "claude", name: "Claude", avatar_url: null };

  it("réunit les auteurs d'une poussée, dans l'ordre de première apparition", () => {
    expect(mergeCommitAuthors([[dev], [dev, claude], [claude]])).toEqual([dev, claude]);
  });

  it("distingue deux inconnus de même compte absent mais de noms différents", () => {
    const autre = { login: null, name: "Quelqu'un d'autre", avatar_url: null };
    const anonyme = { login: null, name: "Claude", avatar_url: null };
    expect(mergeCommitAuthors([[autre], [anonyme]])).toHaveLength(2);
  });
});
