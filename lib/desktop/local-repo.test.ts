import { describe, expect, it } from "vitest";

import {
  localRepoFolderName,
  localRepoVerdict,
  parseGitConfigRemotes,
  parseGitDirPointer,
  parseLocalRepoStore,
  remoteMatchesRepo,
  remoteRepoPath,
  serializeLocalRepoStore,
  withLocalRepo,
  withoutLocalRepo,
} from "./local-repo";

const CONFIG = `[core]
	repositoryformatversion = 0
	bare = false
[remote "origin"]
	url = git@github.com:mangue-dev/minddy.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
	remote = origin
`;

describe("parseGitConfigRemotes", () => {
  it("lit l'url d'un remote", () => {
    expect(parseGitConfigRemotes(CONFIG)).toEqual([
      { name: "origin", url: "git@github.com:mangue-dev/minddy.git" },
    ]);
  });

  it("lit plusieurs remotes et ne confond pas les sections", () => {
    const text = `[remote "origin"]
	url = https://github.com/a/b.git
[branch "main"]
	url = pas-un-remote
[remote "upstream"]
	url = https://github.com/c/d.git
`;
    expect(parseGitConfigRemotes(text)).toEqual([
      { name: "origin", url: "https://github.com/a/b.git" },
      { name: "upstream", url: "https://github.com/c/d.git" },
    ]);
  });

  it("ignores comments, blank lines, and neighboring keys", () => {
    const text = `# un commentaire
[remote "origin"]
; autre commentaire
	pushurl = https://ailleurs/x/y.git
	url   =    https://github.com/a/b.git
`;
    expect(parseGitConfigRemotes(text)).toEqual([
      { name: "origin", url: "https://github.com/a/b.git" },
    ]);
  });

  it("returns an empty list for a config without a remote", () => {
    expect(parseGitConfigRemotes("[core]\n\tbare = false\n")).toEqual([]);
  });
});

describe("remoteRepoPath", () => {
  it("recognizes GitHub's SCP form", () => {
    expect(remoteRepoPath("git@github.com:mangue-dev/minddy.git")).toBe(
      "mangue-dev/minddy",
    );
  });

  it("recognizes https, with and without .git", () => {
    expect(remoteRepoPath("https://github.com/mangue-dev/minddy.git")).toBe(
      "mangue-dev/minddy",
    );
    expect(remoteRepoPath("https://github.com/mangue-dev/minddy")).toBe(
      "mangue-dev/minddy",
    );
  });

  it("recognizes ssh:// and credentials in the URL", () => {
    expect(remoteRepoPath("ssh://git@github.com/a/b.git")).toBe("a/b");
    expect(remoteRepoPath("https://jeton@gitlab.example.com/a/b.git")).toBe("a/b");
  });

  it("garde les sous-groupes GitLab en entier", () => {
    expect(remoteRepoPath("git@gitlab.com:groupe/sous/projet.git")).toBe(
      "groupe/sous/projet",
    );
  });

  it("refuse ce qui n'est pas une URL de dépôt", () => {
    expect(remoteRepoPath("")).toBeNull();
    expect(remoteRepoPath("pas une url")).toBeNull();
    // A path without `/` does not designate a `owner/repo`.
    expect(remoteRepoPath("https://github.com/seul")).toBeNull();
  });
});

describe("remoteMatchesRepo", () => {
  const expected = { fullName: "mangue-dev/minddy" };

  it("accepts the same repository regardless of URL form", () => {
    expect(remoteMatchesRepo("git@github.com:mangue-dev/minddy.git", expected)).toBe(true);
    expect(remoteMatchesRepo("https://github.com/mangue-dev/minddy", expected)).toBe(true);
  });

  it("ignore la casse", () => {
    expect(remoteMatchesRepo("git@github.com:Mangue-Dev/Minddy.git", expected)).toBe(true);
  });

  it("accepts another HOST for the same repository (mirror, self-hosted forge)", () => {
    // Decision documented in the module: we compare `owner/repo`, not the host.
    expect(
      remoteMatchesRepo("git@github.entreprise.local:mangue-dev/minddy.git", expected),
    ).toBe(true);
  });

  it("rejects another repository", () => {
    expect(remoteMatchesRepo("git@github.com:mangue-dev/autre.git", expected)).toBe(false);
    expect(remoteMatchesRepo("git@github.com:autre/minddy.git", expected)).toBe(false);
  });

  it("rejects when the expected repository is empty", () => {
    expect(remoteMatchesRepo("git@github.com:a/b.git", { fullName: "  " })).toBe(false);
  });
});

describe("localRepoVerdict", () => {
  const expected = { fullName: "mangue-dev/minddy" };

  it("accepts a repository with a matching remote", () => {
    expect(localRepoVerdict({ isDirectory: true, gitConfig: CONFIG }, expected)).toEqual({
      ok: true,
    });
  });

  it("suffit qu'UN remote corresponde", () => {
    const text = `[remote "fork"]
	url = git@github.com:moi/minddy.git
[remote "upstream"]
	url = git@github.com:mangue-dev/minddy.git
`;
    expect(localRepoVerdict({ isDirectory: true, gitConfig: text }, expected)).toEqual({
      ok: true,
    });
  });

  it("dit `missing` quand le dossier n'existe plus", () => {
    expect(localRepoVerdict({ isDirectory: false, gitConfig: null }, expected)).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("dit `notGit` sur un dossier sans .git lisible", () => {
    expect(localRepoVerdict({ isDirectory: true, gitConfig: null }, expected)).toEqual({
      ok: false,
      reason: "notGit",
    });
  });

  it("dit `noRemote` sur un dépôt local jamais poussé", () => {
    expect(
      localRepoVerdict({ isDirectory: true, gitConfig: "[core]\n\tbare = false\n" }, expected),
    ).toEqual({ ok: false, reason: "noRemote" });
  });

  it("dit `wrongRepo` sur le dépôt d'un autre projet", () => {
    const text = `[remote "origin"]\n\turl = git@github.com:mangue-dev/autre.git\n`;
    expect(localRepoVerdict({ isDirectory: true, gitConfig: text }, expected)).toEqual({
      ok: false,
      reason: "wrongRepo",
    });
  });

  describe("without a linked repository (expected = null)", () => {
    it("accepts a repository with NO remote — the local-only project case", () => {
      expect(
        localRepoVerdict({ isDirectory: true, gitConfig: "[core]\n\tbare = false\n" }, null),
      ).toEqual({ ok: true });
    });

    it("accepts any remote — there is no identity to compare against", () => {
      const text = `[remote "origin"]\n\turl = git@github.com:mangue-dev/autre.git\n`;
      expect(localRepoVerdict({ isDirectory: true, gitConfig: text }, null)).toEqual({
        ok: true,
      });
    });

    it("still refuses a missing folder", () => {
      expect(localRepoVerdict({ isDirectory: false, gitConfig: null }, null)).toEqual({
        ok: false,
        reason: "missing",
      });
    });

    it("still refuses a folder without .git", () => {
      expect(localRepoVerdict({ isDirectory: true, gitConfig: null }, null)).toEqual({
        ok: false,
        reason: "notGit",
      });
    });
  });
});

describe("parseGitDirPointer", () => {
  it("lit le pointeur d'un worktree", () => {
    expect(parseGitDirPointer("gitdir: /Users/x/dépôt/.git/worktrees/feature\n")).toBe(
      "/Users/x/dépôt/.git/worktrees/feature",
    );
  });

  it("accepte un chemin relatif (sous-module)", () => {
    expect(parseGitDirPointer("gitdir: ../.git/modules/lib\n")).toBe("../.git/modules/lib");
  });

  it("returns null for anything else", () => {
    expect(parseGitDirPointer("")).toBeNull();
    expect(parseGitDirPointer("ref: refs/heads/main\n")).toBeNull();
  });
});

describe("parseLocalRepoStore", () => {
  it("relit ce qu'on a écrit", () => {
    const store = { "p-1": "/Users/x/dépôt" };
    expect(parseLocalRepoStore(JSON.parse(serializeLocalRepoStore(store)))).toEqual(store);
  });

  it("falls back to empty for every unexpected form", () => {
    expect(parseLocalRepoStore(null)).toEqual({});
    expect(parseLocalRepoStore("{}")).toEqual({});
    expect(parseLocalRepoStore({})).toEqual({});
    expect(parseLocalRepoStore({ projects: "non" })).toEqual({});
  });

  it("discards entries that are not absolute paths", () => {
    expect(
      parseLocalRepoStore({
        projects: {
          "p-1": "/absolu",
          "p-2": "relatif/dépôt",
          "p-3": 42,
          "p-4": null,
          "": "/absolu",
        },
      }),
    ).toEqual({ "p-1": "/absolu" });
  });
});

describe("withLocalRepo / withoutLocalRepo", () => {
  it("ajoute, remplace et retire sans muter l'entrée", () => {
    const store = { "p-1": "/a" };
    expect(withLocalRepo(store, "p-2", "/b")).toEqual({ "p-1": "/a", "p-2": "/b" });
    expect(withLocalRepo(store, "p-1", "/c")).toEqual({ "p-1": "/c" });
    expect(withoutLocalRepo(store, "p-1")).toEqual({});
    expect(store).toEqual({ "p-1": "/a" });
  });
});

describe("localRepoFolderName", () => {
  it("rend le dernier segment", () => {
    expect(localRepoFolderName("/Users/x/Projets/minddy")).toBe("minddy");
    expect(localRepoFolderName("/Users/x/Projets/minddy/")).toBe("minddy");
  });
});
