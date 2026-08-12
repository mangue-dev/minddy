import { describe, expect, it } from "vitest";

import { LEGACY_TOOL_NAMES, buildOpencodeAnchor } from "./opencode-anchor";
import { buildAgentSystemPrompt } from "./prompt";

/**
 * MIN-286 — l'ancrage minddy servi à opencode en `instructions`.
 *
 * Ce qui se teste ici tient en trois questions, et la première est la seule qui
 * casse un run en silence :
 *
 *  1. **L'ancrage ne nomme AUCUN tool que le moteur ne sert pas.** Un prompt qui
 *     dit `run_command` à opencode fait appeler un tool inexistant, round après
 *     round, sans qu'aucun test ni aucun event ne le dise — le modèle a juste
 *     l'air bête. C'est le défaut que la table `PromptToolNames` existe pour
 *     rendre impossible, et ce test est ce qui la tient.
 *  2. **La doctrine du produit y est ENTIÈRE.** Les règles dures (statut, plan,
 *     ancres de PR, vérification, un seul message par tour) viennent des fragments
 *     partagés : si l'une disparaît de cet ancrage, elle a disparu du produit pour
 *     les projets basculés, et le fil ne le dira pas non plus.
 *  3. **Les écarts mesurés d'opencode y sont dits** : `task` bloque, pas
 *     d'édition par lot, une question termine le tour.
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
  const loop = buildAgentSystemPrompt({ ...FULL, anchor: "issue", interactive: true });

  it("porte les règles dures mot pour mot, comme la boucle maison", () => {
    for (const rule of [
      "**You never change a ticket's status**",
      "**A plan that already exists is never rewritten whole.**",
      "**A plan is only as good as what it does NOT forget.**",
      "**Anchored remarks are rationed**",
      "**The harness owns git",
      "**a check you did not run is a check nobody ran**",
      "**Behaviour you add or change comes WITH ITS TEST, in the same turn.**",
      "**The user sees exactly ONE message per turn: your last one**",
      "Never print secrets or the git remote URL.",
    ]) {
      expect(text, rule).toContain(rule);
      // Le même texte des deux côtés : c'est ce qui rend la semaine de bascule
      // lisible — un écart de comportement ne pourra pas venir de là.
      expect(loop, rule).toContain(rule);
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
    expect(text).toContain("The one place the harness checks for you: your FIRST");
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
    // La phrase de la boucle maison serait un contresens ici : chez opencode le
    // tool ne rend pas avant le rapport.
    expect(text).not.toContain("You never wait, and you never poll");
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
    expect(text).toContain("You cannot change the code, and that is structural.");
    // Ni ancrage de ticket, ni git, ni délégation : ce sont les gestes qu'elle n'a pas.
    expect(text).not.toContain("## Git and pull requests");
    expect(text).not.toContain("## Delegating to sub-agents");
  });
});
