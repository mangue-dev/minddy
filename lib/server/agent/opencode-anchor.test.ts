import { describe, expect, it } from "vitest";

import { LEGACY_TOOL_NAMES, buildOpencodeAnchor } from "./opencode-anchor";

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

  /**
   * MIN-286 lot 3 — `run_background` est reposé en tool local, donc il est de
   * NOUS : le prompt d'opencode n'en dit rien, et c'est ici qu'il doit se
   * décrire. Un tool servi que l'ancrage ne présente pas est un tool que le
   * modèle n'utilise jamais — la doctrine « fais tourner le code pour de vrai »
   * repasserait alors par un `&` sans garde-fou.
   */
  it("décrit `run_background` et la boucle lancer → sonder → curl → arrêter", () => {
    expect(text).toContain("`run_background`");
    for (const action of ["`start`", "`check`", "`stop`"]) expect(text).toContain(action);
    // Et il `curl` avec le shell d'OPENCODE, pas avec celui de la boucle maison.
    expect(text).toMatch(/`curl` it with `bash`/);
    expect(text).toMatch(/killed when the turn ends/i);
    // La vérification à l'exécution s'appuie dessus plutôt que sur le repli `&`.
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
    // Elle ne lance rien en fond : le tool n'est ni servi ni annoncé.
    expect(text).not.toContain("run_background");
    expect(text).toContain("You cannot change the code, and that is structural.");
    // Ni ancrage de ticket, ni git, ni délégation : ce sont les gestes qu'elle n'a pas.
    expect(text).not.toContain("## Git and pull requests");
    expect(text).not.toContain("## Delegating to sub-agents");
  });
});

/**
 * MIN-358 — CE QUE L'ANCRAGE DIT DU DÉPÔT, ET QUI DÉPEND DE À QUI IL EST.
 *
 * Trois phrases du bloc git deviennent fausses quand le tour joue dans le
 * checkout de quelqu'un, et chacune coûte du travail humain si le modèle la
 * croit : « le harness committe tout ce que tu as changé » (il ne committe que
 * les chemins de l'agent), `git status` lu comme un diff (il porte le WIP de
 * l'utilisateur), et une fenêtre d'historique de six mois (le dépôt est complet).
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
   * MIN-364 (§1 de l'audit du 2026-08-15) — LE DÉFAUT QUI N'ÉTAIT PAS UN
   * ARBITRAGE : personne ne commitait.
   *
   * Le harness ne commite plus en mode dépôt courant (D2bis-B), et l'ancrage
   * promettait pourtant « the harness delivers YOUR work by committing » deux
   * propositions après un « never commit ». Le modèle finissait ses tours sur
   * « c'est livré » et rien ne l'était.
   */
  it("dit que RIEN n'est commité pour le modèle, et que la livraison est sa phrase", () => {
    expect(current).toContain("Nothing is committed for you here");
    expect(current).not.toContain("delivers YOUR work by committing");
    // Le cloud, lui, commite pour de vrai : sa phrase ne bouge pas.
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
   * MIN-364 (D7) — LA QUESTION NE TUE PLUS LE TOUR SUR UNE MACHINE.
   *
   * « ça termine ton tour » pousse le modèle à tout finir avant de demander, et
   * lui fait lire son propre tour comme perdu au moment où il demande. Les deux
   * conduites sont fausses quand le tool bloque et rend la réponse dans son
   * résultat.
   */
  it("dit que la question SUSPEND le tour, là où le cloud dit qu'elle le termine", () => {
    expect(current).toContain("SUSPENDS your turn — it does not end it");
    expect(current).toContain("comes back to you as the tool's own result");
    // « SUSPENDS » contient « ENDS » : c'est la phrase entière qui distingue les
    // deux, jamais le verbe seul.
    expect(current).not.toContain("It is not a blocking prompt");
    expect(current).not.toContain("the session goes to sleep");
    expect(clone).toContain("`question` ENDS your turn");
    expect(clone).not.toContain("SUSPENDS your turn");
  });

  /**
   * MIN-364 (décision D5) — LE DISQUE EST OUVERT, ET LA RETENUE EST UNE RÈGLE DE
   * PROMPT, PAS UN MUR.
   *
   * C'est un choix assumé : le mur d'avant n'attrapait de toute façon que les
   * tools honnêtes (vingt des trente commandes mesurées atteignent un dossier
   * extérieur sans publier autre chose que `bash`). Ce qui ne serait PAS
   * assumable, c'est de le décrire ailleurs comme une garantie — d'où le test :
   * la règle doit être écrite comme une demande, et l'écriture ailleurs doit
   * passer par une VRAIE question.
   */
  it("ouvre le disque et demande de DEMANDER avant d'écrire ailleurs", () => {
    expect(current).toContain("the whole disk is within reach");
    expect(current).toContain("ASK before you WRITE anywhere outside this folder");
    expect(current).toContain("`question`");
    // La règle de tête ne peut plus dire « reste dans le dépôt » : une règle
    // fausse dans un prompt en affaiblit vingt autres.
    expect(current).not.toContain("Stay within this repository");
    expect(current).toContain("Reading elsewhere on the disk is fine");
    // Le cloud, lui, garde son périmètre : le clone est jetable et complet.
    expect(clone).toContain("Stay within this repository");
    expect(clone).not.toContain("the whole disk is within reach");
  });

  it("corrige l'historique et la fraîcheur de la base", () => {
    expect(current).toContain("History is complete");
    expect(current).toContain("only as fresh as their last `git fetch`");
    expect(clone).toContain("You have history, for the last 6 months");
  });

  /**
   * LE GARDE-FOU DE SHELL N'EST PLUS LE MÊME DES DEUX CÔTÉS (MIN-364), et c'est
   * la seule chose que D6 change. Ce test ANCRE la liste servie de chaque côté
   * sur celle que `command-guard` exécute réellement : le tour local avait, avant
   * ce lot, le bloc git du CLOUD — donc la liste qui refuse `git commit` — parce
   * que l'ancrage se lisait sur un `repoMode` que la machine remplace.
   */
  it("annonce EXACTEMENT ce que `command-guard` refuse de chaque côté", () => {
    expect(clone).toContain("`git commit`, `git push`, `git reset`");
    // En dépôt courant `git commit` n'est plus dans la liste des refus…
    expect(current).toContain("REFUSES what would destroy work that is not yours");
    expect(current).toContain("plus `git push`, which belongs to `create_pr`");
    expect(current).not.toContain("`git commit`, `git push`, `git reset`");
    // …et les deux côtés refusent toujours ce qui détruit.
    for (const text of [clone, current]) {
      expect(text).toContain("`git reset`");
      expect(text).toContain("`git clean -f`");
      expect(text).toContain("`--amend`");
    }
  });
});
