import { describe, expect, it } from "vitest";
import {
  appendScratchpadTasks,
  cleanDictatedTaskLine,
  containsMarkdownTaskLine,
  mergeScratchpad,
  removeSettledTasks,
  scratchpadPreview,
  taskLinesMarkdown,
  taskSubtree,
  taskSubtreeLines,
  scratchpadSectionSubtree,
  splitScratchpadSections,
  tasksCheckedOff,
} from "@/lib/scratchpad";
import { parsePlan, planProgress, setTaskState } from "@/lib/plan";

describe("splitScratchpadSections", () => {
  it("returns nothing for blank content", () => {
    expect(splitScratchpadSections("")).toEqual([]);
    expect(splitScratchpadSections("\n  \n")).toEqual([]);
  });

  it("keeps a note with no headings as a single untitled section", () => {
    const sections = splitScratchpadSections("- [ ] a\n- [x] b");
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBeNull();
    expect(sections[0].startLine).toBe(0);
  });

  it("splits on headings and preserves the preamble + titles", () => {
    const note = "intro\n## First\n- [ ] a\n## Second\n- [ ] b";
    const sections = splitScratchpadSections(note);
    expect(sections.map((s) => s.title)).toEqual([null, "First", "Second"]);
    expect(sections.map((s) => s.startLine)).toEqual([0, 1, 3]);
    expect(sections[1].markdown).toBe("## First\n- [ ] a");
  });

  it("addresses a section task at its absolute line in the whole note", () => {
    const note = "intro\n## First\n- [ ] a\n## Second\n- [ ] b";
    const second = splitScratchpadSections(note)[2];
    const relLine = parsePlan(second.markdown).tasks[0].line; // 1 within the section
    const absLine = second.startLine + relLine; // → 4 in the full note
    expect(setTaskState(note, absLine, "completed")).toContain("- [x] b");
    // the other task must be untouched
    expect(setTaskState(note, absLine, "completed")).toContain("- [ ] a");
  });

  it("does not treat a '#' inside a code fence as a heading", () => {
    const note = "## Real\n```\n# not a heading\n```\n- [ ] x";
    const sections = splitScratchpadSections(note);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Real");
  });
});

describe("scratchpadSectionSubtree", () => {
  const note = [
    "intro",
    "# Pull requests", // heading 0
    "- [ ] a",
    "## Review", // heading 1
    "- [ ] b",
    "### Détail", // heading 2
    "- [ ] c",
    "## Diff", // heading 3
    "- [ ] d",
    "# Carnet", // heading 4
    "- [ ] e",
  ].join("\n");

  it("carries the sub-sections of a section along with it", () => {
    const section = scratchpadSectionSubtree(note, 0);
    expect(section?.title).toBe("Pull requests");
    expect(section?.startLine).toBe(1);
    expect(section?.markdown).toBe(
      "# Pull requests\n- [ ] a\n## Review\n- [ ] b\n### Détail\n- [ ] c\n## Diff\n- [ ] d"
    );
  });

  it("stops at the next heading of the same or a shallower level", () => {
    expect(scratchpadSectionSubtree(note, 1)?.markdown).toBe(
      "## Review\n- [ ] b\n### Détail\n- [ ] c"
    );
    expect(scratchpadSectionSubtree(note, 2)?.markdown).toBe(
      "### Détail\n- [ ] c"
    );
    expect(scratchpadSectionSubtree(note, 3)?.markdown).toBe("## Diff\n- [ ] d");
  });

  it("runs the last section to the end of the note", () => {
    expect(scratchpadSectionSubtree(note, 4)?.markdown).toBe(
      "# Carnet\n- [ ] e"
    );
  });

  it("counts headings as the note reads them, code fences excluded", () => {
    const fenced = "# Real\n```\n# not a heading\n```\n## Sub\n- [ ] x";
    expect(scratchpadSectionSubtree(fenced, 0)?.markdown).toBe(fenced);
    expect(scratchpadSectionSubtree(fenced, 1)?.title).toBe("Sub");
    expect(scratchpadSectionSubtree(fenced, 2)).toBeNull();
  });

  it("has nothing to give when the note has no heading at that index", () => {
    expect(scratchpadSectionSubtree("", 0)).toBeNull();
    expect(scratchpadSectionSubtree("- [ ] a\n- [ ] b", 0)).toBeNull();
    expect(scratchpadSectionSubtree(note, 5)).toBeNull();
  });
});

describe("scratchpadPreview", () => {
  it("returns nothing for a blank or task-less note", () => {
    expect(scratchpadPreview("")).toEqual([]);
    expect(scratchpadPreview("# Titre\n\nJuste de la prose.")).toEqual([]);
  });

  it("keeps what's left to do, grouped by section, in document order", () => {
    const note = [
      "# Page d'accueil",
      "",
      "- [x] Retirer les project cards",
      "- [ ] Greeting adapté à l'heure",
      "- [~] Carte « En attente de moi »",
      "",
      "# Objectifs",
      "",
      "- [ ] Pièces jointes à la création",
    ].join("\n");

    const preview = scratchpadPreview(note);
    expect(preview.map((s) => s.title)).toEqual(["Page d'accueil", "Objectifs"]);
    expect(preview[0].tasks.map((t) => t.text)).toEqual([
      "Greeting adapté à l'heure",
      "Carte « En attente de moi »",
    ]);
    expect(preview[1].tasks.map((t) => t.text)).toEqual([
      "Pièces jointes à la création",
    ]);
  });

  it("drops a section whose tasks are all done or cancelled", () => {
    const note = "## Fini\n- [x] a\n- [-] b\n## Reste\n- [ ] c";
    expect(scratchpadPreview(note).map((s) => s.title)).toEqual(["Reste"]);
  });

  it("ne montre pas les questions ouvertes comme du travail", () => {
    const note = "## Questions\n- [ ] Faut-il garder la grille ?\n## Travail\n- [ ] Coder";
    const preview = scratchpadPreview(note);
    expect(preview.map((s) => s.title)).toEqual(["Travail"]);
  });

  it("compte comme la pastille du header, sous-titres de Questions compris", () => {
    // `### Détail` nesting UNDER `## Questions`: deeper title does not close
    // not the section, its boxes remain questions. Pared for herself,
    // this subsection would have counted them as work to be done.
    const note = [
      "## Questions",
      "- [ ] Garder la grille ?",
      "### Détail",
      "- [ ] Et la carte globale ?",
      "## Travail",
      "- [ ] Coder",
    ].join("\n");

    expect(planProgress(note)).toEqual({ done: 0, total: 1 });
    const preview = scratchpadPreview(note);
    expect(preview.map((s) => s.title)).toEqual(["Travail"]);
    expect(preview.flatMap((s) => s.tasks)).toHaveLength(1);
  });

  it("garde les tâches d'avant le premier titre, sans titre", () => {
    const preview = scratchpadPreview("- [ ] a\n## Après\n- [ ] b");
    expect(preview.map((s) => s.title)).toEqual([null, "Après"]);
    expect(preview[0].tasks.map((t) => t.text)).toEqual(["a"]);
  });
});

describe("appendScratchpadTasks", () => {
  it("appends at the end of the document with the right marker", () => {
    const out = appendScratchpadTasks("- [ ] a", [
      { text: "b", state: "pending" },
      { text: "c", state: "in_progress" },
    ]);
    expect(out).toBe("- [ ] a\n- [ ] b\n- [~] c\n");
  });

  it("seeds an empty note", () => {
    expect(appendScratchpadTasks("", [{ text: "first", state: "pending" }])).toBe(
      "- [ ] first\n"
    );
  });

  it("inserts at the end of a named section, before the next heading", () => {
    const note = "## A\n- [ ] a1\n\n## B\n- [ ] b1";
    const out = appendScratchpadTasks(note, [{ text: "a2", state: "pending" }], "A");
    expect(out).toBe("## A\n- [ ] a1\n- [ ] a2\n\n## B\n- [ ] b1");
  });

  it("appends to the last section when it is the target", () => {
    const note = "## A\n- [ ] a1\n## B\n- [ ] b1";
    const out = appendScratchpadTasks(note, [{ text: "b2", state: "completed" }], "B");
    expect(out).toBe("## A\n- [ ] a1\n## B\n- [ ] b1\n- [x] b2");
  });

  it("flattens multi-line task text to one line", () => {
    const out = appendScratchpadTasks("", [
      { text: "line one\nline two", state: "pending" },
    ]);
    expect(out).toBe("- [ ] line one line two\n");
  });

  it("returns null when the section is not found", () => {
    expect(
      appendScratchpadTasks("## A\n- [ ] a", [{ text: "x", state: "pending" }], "Z")
    ).toBeNull();
  });

  it("nests a task under the one before it with `depth`", () => {
    const out = appendScratchpadTasks("- [ ] a", [
      { text: "b", state: "pending", depth: 0 },
      { text: "b1", state: "pending", depth: 1 },
      { text: "b1a", state: "in_progress", depth: 2 },
    ]);
    expect(out).toBe("- [ ] a\n- [ ] b\n  - [ ] b1\n    - [~] b1a\n");
  });

  it("nests under what is ALREADY in the note", () => {
    // A first task at depth 1 is not renormalized: it goes under the
    // last line of the notebook, what the agent requests by writing `depth: 1`.
    expect(
      appendScratchpadTasks("- [ ] a", [{ text: "a1", state: "pending", depth: 1 }])
    ).toBe("- [ ] a\n  - [ ] a1\n");
  });
});

describe("taskSubtree / taskSubtreeLines", () => {
  const note = "- [ ] p\n  - [~] c1\n    - [ ] g\n  - [x] c2\n- [ ] sib";
  const tasks = () => parsePlan(note).tasks;

  it("emporte toute la descendance d'un parent, sans le voisin", () => {
    expect(taskSubtree(tasks(), 0).map((t) => t.text)).toEqual([
      "p",
      "c1",
      "g",
      "c2",
    ]);
  });

  it("ne remonte jamais : un enfant part sans son parent", () => {
    expect(taskSubtree(tasks(), 1).map((t) => t.text)).toEqual(["c1", "g"]);
  });

  it("une feuille est son propre sous-arbre", () => {
    expect(taskSubtree(tasks(), 2).map((t) => t.text)).toEqual(["g"]);
  });

  it("rien pour un index qui ne désigne aucune tâche", () => {
    expect(taskSubtree(tasks(), 42)).toEqual([]);
  });

  it("ramène la racine au premier niveau quand elle sort du carnet", () => {
    expect(taskLinesMarkdown(taskSubtreeLines(tasks(), 1))).toBe(
      "- [~] c1\n  - [ ] g"
    );
  });

  it("sort les tâches dans leur état d'APRÈS le geste", () => {
    const started = taskSubtreeLines(tasks(), 0, (state) =>
      state === "pending" ? "in_progress" : state
    );
    expect(taskLinesMarkdown(started)).toBe(
      "- [~] p\n  - [~] c1\n    - [~] g\n  - [x] c2"
    );
  });
});

describe("cleanDictatedTaskLine", () => {
  it("leaves a plain dictated sentence untouched", () => {
    expect(cleanDictatedTaskLine("Réparer le tri du board par priorité.")).toBe(
      "Réparer le tri du board par priorité."
    );
  });

  it("strips a checkbox marker, a bullet or both", () => {
    expect(cleanDictatedTaskLine("- [ ] revoir les filtres")).toBe("revoir les filtres");
    expect(cleanDictatedTaskLine("* revoir les filtres")).toBe("revoir les filtres");
    expect(cleanDictatedTaskLine("[x] revoir les filtres")).toBe("revoir les filtres");
  });

  it("strips a heading level but keeps a hashtag word", () => {
    expect(cleanDictatedTaskLine("## Revoir les filtres")).toBe("Revoir les filtres");
    expect(cleanDictatedTaskLine("#urgent à revoir")).toBe("#urgent à revoir");
  });

  it("flattens newlines and collapses whitespace", () => {
    expect(cleanDictatedTaskLine("ligne une\n  ligne deux")).toBe("ligne une ligne deux");
  });

  it("caps the length without leaving a trailing space", () => {
    expect(cleanDictatedTaskLine("abcd efgh", 5)).toBe("abcd");
  });

  it("returns an empty string for a marker-only line", () => {
    expect(cleanDictatedTaskLine("- [ ] ")).toBe("");
  });
});

describe("containsMarkdownTaskLine", () => {
  it("recognises the four markers, whatever the bullet", () => {
    expect(containsMarkdownTaskLine("- [ ] à faire")).toBe(true);
    expect(containsMarkdownTaskLine("* [~] en cours")).toBe(true);
    expect(containsMarkdownTaskLine("+ [x] fait")).toBe(true);
    expect(containsMarkdownTaskLine("  - [-] annulé")).toBe(true);
    expect(containsMarkdownTaskLine("- [X] fait")).toBe(true);
  });

  it("finds a task line anywhere in a pasted block", () => {
    expect(
      containsMarkdownTaskLine("# Feedback\n\n- [ ] filtrer la sidebar\n- [ ] badge public")
    ).toBe(true);
  });

  it("accepts a marker alone at the end of a line", () => {
    expect(containsMarkdownTaskLine("- [ ]")).toBe(true);
  });

  it("says no to prose, bullets and headings", () => {
    expect(containsMarkdownTaskLine("Une note libre, sans case.")).toBe(false);
    expect(containsMarkdownTaskLine("- une simple puce\n- une autre")).toBe(false);
    expect(containsMarkdownTaskLine("## Une section\n\nDu texte.")).toBe(false);
  });

  it("says no to a bracket that is not a checkbox marker", () => {
    expect(containsMarkdownTaskLine("- [lien](https://minddy.app)")).toBe(false);
    expect(containsMarkdownTaskLine("- [ok] pas une case")).toBe(false);
  });

  it("says no to a marker that is not on its own line", () => {
    expect(containsMarkdownTaskLine("voir - [ ] plus haut")).toBe(false);
  });
});

describe("removeSettledTasks", () => {
  it("drops completed AND cancelled task lines, keeping the live ones", () => {
    const note = "## Section\n- [ ] a\n- [x] b\n- [~] c\n- [-] d\n- [x] e";
    const { content, removed } = removeSettledTasks(note);
    expect(removed).toBe(3);
    expect(content).toBe("## Section\n- [ ] a\n- [~] c");
  });

  it("returns the content unchanged when nothing is settled", () => {
    const note = "- [ ] a\n- [~] b";
    const result = removeSettledTasks(note);
    expect(result.removed).toBe(0);
    expect(result.content).toBe(note);
  });

  it("drops a section title when all of its tasks were completed", () => {
    const note = "## Done\n- [x] a\n- [x] b\n\n## Live\n- [ ] c";
    const { content, removed } = removeSettledTasks(note);
    expect(removed).toBe(2);
    expect(content).toBe("## Live\n- [ ] c");
  });

  it("also removes the emptied section's '---' separator and blanks", () => {
    const note = "## à faire\n- [x] Configurer stripe\n\n---\n\n# Carnet\n- [ ] c";
    const { content } = removeSettledTasks(note);
    expect(content).toBe("# Carnet\n- [ ] c");
  });

  it("keeps the title when the section still has prose", () => {
    const note = "## Notes\nkeep this line\n- [x] a";
    const { content } = removeSettledTasks(note);
    expect(content).toBe("## Notes\nkeep this line");
  });

  it("drops a section made only of completed and cancelled tasks", () => {
    const note = "## Section\n- [x] a\n- [-] b\n\n## Live\n- [~] c";
    const { content, removed } = removeSettledTasks(note);
    expect(removed).toBe(2);
    expect(content).toBe("## Live\n- [~] c");
  });

  it("keeps a section whose only survivor is an in-progress task", () => {
    const note = "## Section\n- [-] a\n- [~] b";
    const { content, removed } = removeSettledTasks(note);
    expect(removed).toBe(1);
    expect(content).toBe("## Section\n- [~] b");
  });

  it("keeps a parent whose subsection survives, but drops the empty subsection", () => {
    const note = "# Parent\n## A\n- [x] a\n## B\n- [ ] b";
    const { content } = removeSettledTasks(note);
    expect(content).toBe("# Parent\n## B\n- [ ] b");
  });

  it("empties the note when every section is fully completed", () => {
    const note = "# A\n- [x] a\n## B\n- [x] b";
    const { content, removed } = removeSettledTasks(note);
    expect(removed).toBe(2);
    expect(content).toBe("");
  });
});

describe("removeSettledTasks — la hiérarchie", () => {
  it("garde une tâche cochée qui porte encore du travail", () => {
    // Removing it would leave “child” indented under nothing.
    const note = "- [x] parent\n  - [ ] child";
    expect(removeSettledTasks(note)).toEqual({ content: note, removed: 0 });
  });

  it("emporte le sous-arbre quand il est réglé de bout en bout", () => {
    const note = "- [x] parent\n  - [x] child\n    - [-] grand\n- [ ] sib";
    const { content, removed } = removeSettledTasks(note);
    expect(content).toBe("- [ ] sib");
    expect(removed).toBe(3);
  });

  it("retire une sous-tâche réglée sous un parent qui reste", () => {
    const { content, removed } = removeSettledTasks(
      "- [ ] parent\n  - [x] child\n  - [ ] autre"
    );
    expect(content).toBe("- [ ] parent\n  - [ ] autre");
    expect(removed).toBe(1);
  });

  it("garde une sous-tâche cochée qui porte elle-même du travail", () => {
    const note = "- [ ] parent\n  - [x] child\n    - [~] grand";
    expect(removeSettledTasks(note)).toEqual({ content: note, removed: 0 });
  });
});

describe("mergeScratchpad", () => {
  const base = "# A\n- [ ] a1\n- [ ] a2\n\n# B\n- [ ] b1";

  it("returns the value when nobody diverged", () => {
    expect(mergeScratchpad(base, base, base)).toBe(base);
  });

  it("takes your version when only you changed", () => {
    const ours = base.replace("- [ ] a1", "- [x] a1");
    expect(mergeScratchpad(base, ours, base)).toBe(ours);
  });

  it("takes their version when only the other side changed", () => {
    const theirs = base + "\n- [ ] b2";
    expect(mergeScratchpad(base, base, theirs)).toBe(theirs);
  });

  it("keeps BOTH sides' edits when they touch different lines", () => {
    const ours = base.replace("- [ ] a1", "- [x] a1"); // you tick a1
    const theirs = base.replace("- [ ] b1", "- [x] b1"); // agent ticks b1
    const merged = mergeScratchpad(base, ours, theirs);
    expect(merged).toContain("- [x] a1");
    expect(merged).toContain("- [x] b1");
    expect(merged).toContain("- [ ] a2");
  });

  it("merges an append from one side with an edit from the other", () => {
    const ours = base.replace("- [ ] a2", "- [x] a2"); // you tick a2
    const theirs = base + "\n- [ ] b2"; // agent adds b2
    const merged = mergeScratchpad(base, ours, theirs);
    expect(merged).toContain("- [x] a2");
    expect(merged).toContain("- [ ] b2");
  });

  it("prefers your version when the SAME line was changed on both sides", () => {
    const ours = base.replace("- [ ] a1", "- [x] a1 (mine)");
    const theirs = base.replace("- [ ] a1", "- [~] a1 (agent)");
    const merged = mergeScratchpad(base, ours, theirs);
    expect(merged).toContain("a1 (mine)");
    expect(merged).not.toContain("a1 (agent)");
  });
});

describe("tasksCheckedOff", () => {
  it("reports a task the user just ticked", () => {
    expect(tasksCheckedOff("- [ ] écrire la migration", "- [x] écrire la migration")).toEqual([
      "écrire la migration",
    ]);
  });

  it("reports a task ticked straight from in progress", () => {
    expect(tasksCheckedOff("- [~] relire", "- [x] relire")).toEqual(["relire"]);
  });

  it("ignores a task that arrives already checked", () => {
    // Pasted list, or agent who writes '- [x]' via MCP: no one checked.
    expect(tasksCheckedOff("- [ ] a", "- [ ] a\n- [x] importée")).toEqual([]);
  });

  it("ignores plain typing around the tasks", () => {
    const before = "# Carnet\n\n- [x] déjà faite\n- [ ] en cours";
    expect(tasksCheckedOff(before, `${before}\n\nune note libre`)).toEqual([]);
  });

  it("does not re-report a task that stays checked", () => {
    expect(tasksCheckedOff("- [x] faite", "- [x] faite\n- [ ] neuve")).toEqual([]);
  });

  it("does not report deleting a checked task, nor re-adding it", () => {
    // The normal life cycle of the notebook: we check off, we clean, we start again.
    expect(tasksCheckedOff("- [x] faite\n- [ ] b", "- [ ] b")).toEqual([]);
    expect(tasksCheckedOff("- [ ] b", "- [ ] b\n- [x] faite")).toEqual([]);
  });

  it("reports an unchecked-then-rechecked task again", () => {
    expect(tasksCheckedOff("- [x] a", "- [ ] a")).toEqual([]);
    expect(tasksCheckedOff("- [ ] a", "- [x] a")).toEqual(["a"]);
  });

  it("survives a task moving to another section", () => {
    const before = "# A\n\n- [ ] bouger\n\n# B\n";
    const after = "# A\n\n# B\n\n- [x] bouger";
    expect(tasksCheckedOff(before, after)).toEqual(["bouger"]);
  });

  it("reports each of several ticks in one save", () => {
    expect(tasksCheckedOff("- [ ] a\n- [ ] b\n- [ ] c", "- [x] a\n- [ ] b\n- [x] c")).toEqual([
      "a",
      "c",
    ]);
  });

  it("counts a checkbox once per occurrence when the label repeats", () => {
    expect(tasksCheckedOff("- [ ] relire\n- [ ] relire", "- [x] relire\n- [ ] relire")).toEqual([
      "relire",
    ]);
  });

  it("ignores checkboxes inside a fenced code block", () => {
    const before = "```md\n- [ ] exemple\n```";
    const after = "```md\n- [x] exemple\n```";
    expect(tasksCheckedOff(before, after)).toEqual([]);
  });

  it("handles an empty or missing note", () => {
    expect(tasksCheckedOff("", "- [x] première")).toEqual([]);
    expect(tasksCheckedOff(null, undefined)).toEqual([]);
  });
});
