import { describe, expect, it } from "vitest";

import { LEGACY_TOOL_NAMES, buildOpencodeAnchor } from "./opencode-anchor";

/**
 * MIN-286 — the minddy anchor used in opencode in `instructions`.
 *
 * What is tested here is three questions, and the first is the only one which
 * breaks a run silently:
 *
 * 1. **The anchor does not name ANY tools that the engine is not serving.** A prompt that
 * says `run_command` to opencode causes a non-existent tool to be called, round after
 * round, without any test or event saying so — the model just looks stupid. This is the flaw that the `PromptToolNames` table exists to make
 * impossible, and this test is what holds it.
 * 2. **The product doctrine is ENTIRE there.** The hard rules (status, plan,
 * PR anchors, verification, only one message per round) come from fragments
 * shared: if one disappears from this anchor, it has disappeared from the product for
 * switched projects, and the thread won't say it either.
 * 3. **Measured opencode deviations are said there**: `task` blocks, not
 * batch editing, one question ends the round.
 */

const variants = [
  { label: "ticket", args: { anchor: "issue" as const, interactive: true } },
  { label: "carnet", args: { anchor: "notebook" as const, interactive: true } },
  { label: "routine", args: { anchor: "notebook" as const, interactive: false } },
  { label: "relecture", args: { anchor: "pr" as const, interactive: true } },
];

const FULL = {
  locale: "fr",
  webSearch: true,
  webSearchMax: 5,
  chain: true,
  images: true,
  subagents: {
    models: true,
    maxMultiplier: 10,
    favorites: [
      {
        id: "anthropic/claude-haiku-4.5",
        label: "Haiku 4.5",
        use_case: "cheap exploration",
        multiplier: 3,
      } as never,
    ],
  },
};

describe("buildOpencodeAnchor — aucun nom de tool de la boucle maison", () => {
  for (const { label, args } of variants) {
    it(`ne cite aucun tool inexistant chez opencode (${label})`, () => {
      const text = buildOpencodeAnchor({ ...FULL, ...args });
      for (const name of LEGACY_TOOL_NAMES) {
        expect(text, `« ${name} » ne doit pas être servi à opencode`).not.toContain(`\`${name}\``);
      }
    });
  }

  it("nomme bien les tools d'opencode à la place", () => {
    const text = buildOpencodeAnchor({ ...FULL, anchor: "issue", interactive: true });
    for (const name of ["read", "bash", "grep", "glob", "edit", "task", "question"]) {
      expect(text).toContain(`\`${name}\``);
    }
  });
});

describe("buildOpencodeAnchor — la doctrine du produit, entière", () => {
  const text = buildOpencodeAnchor({ ...FULL, anchor: "issue", interactive: true });

  it("porte les règles dures mot pour mot", () => {
    for (const rule of [
      "**You never change a ticket's status**",
      "**A plan that already exists is never rewritten whole.**",
      "**A plan is only as good as what it does NOT forget.**",
      "**Anchored remarks are rationed**",
      "**The harness owns git",
      "**a check you did not run is a check nobody ran**",
      "**Behaviour you add or change comes WITH ITS TEST, in the same turn.**",
      "**If `glob` cannot find a file or directory the user explicitly named, do not conclude it is absent:**",
      "**Do not announce what you are about to inspect or run:**",
      "**The user sees exactly ONE message per turn: your last one**",
      "Never print secrets or the git remote URL.",
    ]) {
      expect(text, rule).toContain(rule);
    }
  });

  it("garde les tools de domaine et la porte de livraison", () => {
    for (const tool of [
      "search_issues",
      "read_issue",
      "write_issue_plan",
      "update_plan",
      "read_scratchpad",
      "list_pull_requests",
      "create_pr",
      "web_search",
      "report_verdict",
    ]) {
      expect(text, tool).toContain(`\`${tool}\``);
    }
    expect(text).toContain("The harness owns git, and your shell enforces it.");
  });

  it("dit la langue de réponse et le ticket comme ancrage", () => {
    expect(text).toContain("Write your replies to the user in French");
    expect(text).toContain("## The ticket");
  });
});

describe("buildOpencodeAnchor — les écarts mesurés d'opencode", () => {
  const text = buildOpencodeAnchor({ ...FULL, anchor: "issue", interactive: true });

  it("dit que la délégation BLOQUE, contre la doctrine de la boucle maison", () => {
    expect(text).toContain("BLOCKS until the child is done");
    // The house loop phrase would be a misinterpretation here: at opencode the
    // tool does not render before reporting.
    expect(text).not.toContain("You never wait, and you never poll");
  });

  /**
 * MIN-286 batch 3 — `run_background` is stored in tool local, so it is de
 * US: the opencode prompt says nothing about it, and this is where it must be described. A tool served that the anchor does not present is a tool that the
 * model never uses — the doctrine “run the code for real”
 * would then go back to a `&` without safeguards.
 */
  it("décrit `run_background` et la boucle lancer → sonder → curl → arrêter", () => {
    expect(text).toContain("`run_background`");
    for (const action of ["`start`", "`check`", "`stop`"]) expect(text).toContain(action);
    // And it `curl` with the OPENCODE shell, not with the home loop one.
    expect(text).toMatch(/`curl` it with `bash`/);
    expect(text).toMatch(/killed when the turn ends/i);
    // Runtime checking relies on this rather than the `&` fallback.
    expect(text).toMatch(/start the dev server with `run_background`/);
    expect(text).not.toContain("npm run dev > /tmp/dev.log");
  });

  it("dit qu'il n'y a pas d'édition par lot", () => {
    expect(text).toContain("There is no batch-edit tool");
  });

  it("dit qu'une question termine le tour", () => {
    expect(text).toContain("ENDS your turn");
  });

  it("ne promet pas de sortie complète sauvegardée — `bash` n'en garde pas", () => {
    expect(text).not.toContain("full_output_path");
    expect(text).toContain("redirect it yourself");
  });

  it("plafonne la recherche web du tour, filles comprises", () => {
    expect(text).toContain("You get 5 searches for this turn, shared with your sub-agents");
  });
});

describe("buildOpencodeAnchor — une routine et une relecture ne promettent rien de faux", () => {
  it("une routine n'a pas de question à poser", () => {
    const text = buildOpencodeAnchor({ ...FULL, anchor: "notebook", interactive: false });
    expect(text).toContain("## This session is a ROUTINE");
    expect(text).toContain("`question` is not in your tool set");
    expect(text).not.toContain("ENDS your turn");
  });

  it("une relecture garde sa persona en lecture seule", () => {
    const text = buildOpencodeAnchor({ ...FULL, anchor: "pr", interactive: true });
    expect(text).toContain("review a pull request");
    // It does not launch anything in the background: the tool is neither served nor announced.
    expect(text).not.toContain("run_background");
    expect(text).toContain("You cannot change the code, and that is structural.");
    // Neither ticket anchoring, nor git, nor delegation: these are the gestures that it does not have.
    expect(text).not.toContain("## Git and pull requests");
    expect(text).not.toContain("## Delegating to sub-agents");
  });
});

/**
 * MIN-358 — WHAT THE ANCHOR SAYS ABOUT THE REPOSITORY, AND THAT DEPENDS ON WHOSE IT IS.
 *
 * Three sentences in the git block become false when the trick plays in the
 * someone's checkout, and each costs human labor if the model the
 * believes: "the harness commits everything you changed" (it only commits
 * the agent paths), `git status` read as a diff (it carries the WIP of
 * the user), and a six-month history window (the repository is complete).
 */
describe("buildOpencodeAnchor — le mode dépôt courant", () => {
  const clone = buildOpencodeAnchor({ ...FULL, anchor: "issue", interactive: true });
  const current = buildOpencodeAnchor({
    ...FULL,
    anchor: "issue",
    interactive: true,
    currentRepo: true,
  });

  it("dit que le dépôt appartient à quelqu'un, et ce qu'on n'y fait pas", () => {
    expect(current).toContain("the user's own working copy");
    expect(current).toContain("never switch branch, never stash");
    expect(clone).not.toContain("the user's own working copy");
  });

  /**
 * MIN-364 (§1 of the audit of 2026-08-15) — THE DEFECT WHICH WAS NOT A
 * ARBITRATION: no one committed.
 *
 * The harness no longer commits in current deposit mode (D2bis-B), and the anchor
 * however promised “the harness delivers YOUR work by committing” two
 * proposals after a “never commit”. The model finished its turns on
 * “it’s delivered” and nothing was.
 */
  it("dit que RIEN n'est commité pour le modèle, et que la livraison est sa phrase", () => {
    expect(current).toContain("Nothing is committed for you here");
    expect(current).not.toContain("delivers YOUR work by committing");
    // The cloud commits for real: its sentence does not move.
    expect(clone).toContain("it commits and pushes whatever you changed");
  });

  it("rend le commit au modèle SUR DEMANDE, sans lui rendre le `git add -A`", () => {
    expect(current).toContain("You commit only when they ask you to");
    expect(current).toContain("never `git add -A`");
    expect(current).toContain("`create_pr` owns the remote");
  });

  it("retire `git status` du rôle de diff, et nomme le cas des deux mains", () => {
    expect(current).toContain("`git status` is NOT your diff here");
    expect(current).toContain("Use the built-in file editing tools for repository writes");
    expect(current).toContain("not claimed in your diff");
    expect(current).toContain("goes out with your pull request");
  });

  /**
 * MIN-364 (D7) — QUESTION NO LONGER KILLS THE TURN ON A MACHINE.
 *
 * "that ends your turn" pushes the model to finish everything before asking, and
 * makes him read his own turn as lost the moment he asks. Both
 * behavior are false when the tool blocks and returns the response in its
 * result.
 */
  it("dit que la question SUSPEND le tour, là où le cloud dit qu'elle le termine", () => {
    expect(current).toContain("SUSPENDS your turn — it does not end it");
    expect(current).toContain("comes back to you as the tool's own result");
    // “SUSPENDS” contains “ENDS”: it is the entire sentence which distinguishes the
    // two, never the verb alone.
    expect(current).not.toContain("It is not a blocking prompt");
    expect(current).not.toContain("the session goes to sleep");
    expect(clone).toContain("`question` ENDS your turn");
    expect(clone).not.toContain("SUSPENDS your turn");
  });

  /**
 * MIN-364 (decision D5) — THE DISC IS OPEN, AND HOLDING IS A RULE OF
 * PROMPT, NOT A WALL.
 *
 * This is an assumed choice: the front wall only caught in any case the honest
 * tools (twenty of the thirty measured commands reach an external
 * folder without publishing anything other than `bash`). What would NOT be assumed is describing it elsewhere as a guarantee — hence the test:
 * the rule must be written as a request, and writing elsewhere must go through a REAL question.
 */
  it("ouvre le disque et demande de DEMANDER avant d'écrire ailleurs", () => {
    expect(current).toContain("the whole disk is within reach");
    expect(current).toContain("ASK before you WRITE anywhere outside this folder");
    expect(current).toContain("`question`");
    // The head rule can no longer say “stay in the repository”: a rule
    // false in a prompt weakens twenty others.
    expect(current).not.toContain("Stay within this repository");
    expect(current).toContain("Reading elsewhere on the disk is fine");
    // The cloud keeps its perimeter: the clone is disposable and complete.
    expect(clone).toContain("Stay within this repository");
    expect(clone).not.toContain("the whole disk is within reach");
  });

  it("corrige l'historique et la fraîcheur de la base", () => {
    expect(current).toContain("History is complete");
    expect(current).toContain("only as fresh as their last `git fetch`");
    expect(clone).toContain("You have history, for the last 6 months");
  });

  /**
 * SHELL'S GUARD IS NO LONGER THE SAME ON BOTH SIDES (MIN-364), and that's
 * the only thing D6 changes. This test ANCHORES the list served on each side
 * to the one that `command-guard` actually executes: the local round had, before
 * this batch, the git block of the CLOUD — therefore the list which refuses `git commit` — because
 * that the anchor was read on a `repoMode` that the machine replaces.
 */
  it("annonce EXACTEMENT ce que `command-guard` refuse de chaque côté", () => {
    expect(clone).toContain("`git commit`, `git push`, `git reset`");
    // In current deposit `git commit` is no longer in the refusal list…
    expect(current).toContain("REFUSES what would destroy work that is not yours");
    expect(current).toContain("plus `git push`, which belongs to `create_pr`");
    expect(current).not.toContain("`git commit`, `git push`, `git reset`");
    // …and both sides always refuse what destroys.
    for (const text of [clone, current]) {
      expect(text).toContain("`git reset`");
      expect(text).toContain("`git clean -f`");
      expect(text).toContain("`--amend`");
    }
  });
});
