import { describe, expect, it } from "vitest";
import type { PullRequestFile } from "@/lib/agent-api";
import {
  buildFileTree,
  fileStatusOf,
  type FileTreeDir,
  type FileTreeNode,
} from "@/lib/pr-file-tree";

function file(filename: string, extra: Partial<PullRequestFile> = {}): PullRequestFile {
  return {
    filename,
    status: "modified",
    additions: 1,
    deletions: 1,
    ...extra,
  };
}

/** The node of this path, searched in depth — avoids indexing by hand. */
function at(nodes: FileTreeNode[], path: string): FileTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.kind === "dir") {
      const found = at(node.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

function dirs(nodes: FileTreeNode[]): FileTreeDir[] {
  return nodes.filter((n): n is FileTreeDir => n.kind === "dir");
}

describe("buildFileTree", () => {
  it("places a single-segment path as a root leaf", () => {
    const tree = buildFileTree([file("README.md")]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: "file", label: "README.md", path: "README.md" });
  });

  it("collapses a chain of single-child folders onto one line", () => {
    const tree = buildFileTree([file("app/(app)/lab/diff/page.tsx")]);
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root).toMatchObject({
      kind: "dir",
      label: "app/(app)/lab/diff",
      path: "app/(app)/lab/diff",
    });
    expect(dirs([root])[0].children).toHaveLength(1);
    expect(dirs([root])[0].children[0]).toMatchObject({
      kind: "file",
      path: "app/(app)/lab/diff/page.tsx",
    });
  });

  it("stops collapsing at the first folder with two children", () => {
    const tree = buildFileTree([
      file("app/lab/diff/page.tsx"),
      file("app/lab/tree/page.tsx"),
    ]);
    expect(tree).toHaveLength(1);
    // `app/lab` se replie (enfant unique), pas ce qu'il y a dessous.
    expect(tree[0]).toMatchObject({ kind: "dir", label: "app/lab", path: "app/lab" });
    expect(dirs(tree)[0].children.map((c) => c.label)).toEqual(["diff", "tree"]);
  });

  it("ne replie PAS un dossier dont l'unique enfant est un fichier", () => {
    const tree = buildFileTree([file("lib/only.ts"), file("README.md")]);
    expect(tree.map((n) => n.label)).toEqual(["lib", "README.md"]);
    expect(dirs(tree)[0].children.map((c) => c.label)).toEqual(["only.ts"]);
  });

  it("shows the rename on the line when the NAME changes", () => {
    const tree = buildFileTree([
      file("lib/pr-file-tree.ts", { status: "renamed", previous_filename: "lib/tree.ts" }),
    ]);
    const leaf = at(tree, "lib/pr-file-tree.ts");
    expect(leaf).toMatchObject({
      kind: "file",
      label: "tree.ts → pr-file-tree.ts",
      status: "renamed",
    });
  });

  it("laisse le nom seul quand le fichier n'a fait que déménager", () => {
    // The tree already places the file under its new folder: repeat
    // chemin d'origine n'apprendrait rien de plus.
    const tree = buildFileTree([
      file("utils/dates.ts", { status: "renamed", previous_filename: "lib/dates.ts" }),
    ]);
    expect(at(tree, "utils/dates.ts")).toMatchObject({
      label: "dates.ts",
      status: "renamed",
    });
  });

  it("porte le statut d'un fichier supprimé sur sa feuille", () => {
    const tree = buildFileTree([
      file("lib/old.ts", { status: "removed", additions: 0, deletions: 42 }),
    ]);
    expect(at(tree, "lib/old.ts")).toMatchObject({
      kind: "file",
      status: "removed",
      additions: 0,
      deletions: 42,
    });
  });

  it("keeps two same-named files in different folders distinct", () => {
    const tree = buildFileTree([file("lib/index.ts"), file("app/index.ts")]);
    expect(tree.map((n) => n.path)).toEqual(["app", "lib"]);
    expect(at(tree, "app/index.ts")).toBeDefined();
    expect(at(tree, "lib/index.ts")).toBeDefined();
  });

  it("aggregates counts on folders, including collapsed ones", () => {
    const tree = buildFileTree([
      file("src/deep/a.ts", { additions: 3, deletions: 1 }),
      file("src/deep/b.ts", { additions: 4, deletions: 2 }),
      file("src/c.ts", { additions: 10, deletions: 0 }),
    ]);
    // `src` a deux enfants : il ne se replie pas.
    expect(at(tree, "src")).toMatchObject({ additions: 17, deletions: 3 });
    expect(at(tree, "src/deep")).toMatchObject({ additions: 7, deletions: 3 });
  });

  it("also aggregates on a collapsed folder — the total is for the entire chain", () => {
    const tree = buildFileTree([
      file("a/b/c/one.ts", { additions: 5, deletions: 2 }),
      file("a/b/c/two.ts", { additions: 1, deletions: 1 }),
    ]);
    expect(tree[0]).toMatchObject({
      label: "a/b/c",
      path: "a/b/c",
      additions: 6,
      deletions: 3,
    });
  });

  it("sorts folders before files, each group by name", () => {
    const tree = buildFileTree([
      file("zebra.md"),
      file("alpha.md"),
      file("ui/button.tsx"),
      file("api/route.ts"),
    ]);
    expect(tree.map((n) => n.label)).toEqual(["api", "ui", "alpha.md", "zebra.md"]);
  });

  it("ignores an empty path instead of inventing an unnamed folder", () => {
    expect(buildFileTree([file("")])).toEqual([]);
    const tree = buildFileTree([file("/lib//dup.ts")]);
    expect(tree[0]).toMatchObject({ kind: "dir", label: "lib", path: "lib" });
  });

  it("returns an empty tree for a PR without files", () => {
    expect(buildFileTree([])).toEqual([]);
  });
});

describe("fileStatusOf", () => {
  it("normalizes statuses the forge invents beyond the four we render", () => {
    expect(fileStatusOf(file("a.ts", { status: "changed" }))).toBe("modified");
    expect(fileStatusOf(file("a.ts", { status: "copied" }))).toBe("modified");
    expect(fileStatusOf(file("a.ts", { status: "added" }))).toBe("added");
    expect(fileStatusOf(file("a.ts", { status: "removed" }))).toBe("removed");
  });

  it("lit `previous_filename` comme second témoin du renommage", () => {
    // GitLab serves `changed` with an old name: it's a rename.
    expect(fileStatusOf(file("b.ts", { status: "changed", previous_filename: "a.ts" }))).toBe(
      "renamed",
    );
  });
});
