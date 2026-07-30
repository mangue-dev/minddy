import { describe, expect, it } from "vitest";
import {
  buildAgentContextMessage,
  buildAgentSystemPrompt,
  buildInheritedBranchMessage,
  buildInheritedPrMessage,
  buildNotebookContextMessage,
  buildSubagentSystemPrompt,
  toPrLineThreads,
} from "./prompt";

/**
 * Message d'amorce d'une run FROIDE qui hérite d'une PR (MIN-68). C'est la seule
 * mémoire qu'a la run neuve du travail déjà poussé sur la branche : si un morceau
 * saute, l'agent recommence le ticket à zéro par-dessus une PR en revue.
 */

const repo = {
  fullName: "acme/app",
  defaultBranch: "main",
  workBranch: "minddy/agent/min-42-abcd1234",
};

describe("buildInheritedPrMessage", () => {
  it("porte la PR, la branche et l'ordre de ne pas repartir de zéro", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: { number: 12, title: "MIN-42: add search", state: "open", comments: [] },
    });
    expect(msg).toContain("#12");
    expect(msg).toContain("MIN-42: add search");
    expect(msg).toContain(repo.workBranch);
    expect(msg).toMatch(/do NOT start the ticket over/i);
    // Le diff n'est jamais inliné : l'agent lit la branche lui-même, et le fait
    // avec une commande qui survit au clone shallow (pas de three-dot).
    expect(msg).toContain("git diff main");
    expect(msg).not.toContain("main...");
  });

  it("injecte le résumé de la run précédente", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: {
        number: 12,
        state: "open",
        comments: [],
        previousSummary: "Ajout du champ de recherche et de son index.",
      },
    });
    expect(msg).toContain("Ajout du champ de recherche et de son index.");
  });

  it("injecte la description de la PR (ce que la PR annonce déjà)", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: {
        number: 12,
        state: "open",
        comments: [],
        body: "Ajoute /api/search et son index trigram.",
      },
    });
    expect(msg).toContain("Ajoute /api/search et son index trigram.");
  });

  it("plafonne la description et le résumé (contexte hérité borné)", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: {
        number: 12,
        state: "open",
        comments: [],
        body: "b".repeat(9000),
        previousSummary: "s".repeat(9000),
      },
    });
    // Chacun est tronqué à 4000 : aucun des deux ne passe en entier.
    expect(msg).not.toContain("b".repeat(4100));
    expect(msg).not.toContain("s".repeat(4100));
    expect(msg.split("[truncated]").length - 1).toBe(2);
  });

  it("injecte les commentaires de review avec leur auteur", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: {
        number: 12,
        state: "open",
        comments: [
          { author: "alice", body: "Le debounce manque." },
          { author: "bob", body: "Renomme `q` en `query`." },
        ],
      },
    });
    expect(msg).toContain("@alice");
    expect(msg).toContain("Le debounce manque.");
    expect(msg).toContain("@bob");
  });

  it("ne garde que les 10 commentaires les plus RÉCENTS (la demande du jour)", () => {
    const comments = Array.from({ length: 14 }, (_, i) => ({
      author: "alice",
      body: `comment-${i}`,
    }));
    const msg = buildInheritedPrMessage({ repo, pr: { number: 12, state: "open", comments } });
    expect(msg).not.toContain("comment-3");
    expect(msg).toContain("comment-4");
    expect(msg).toContain("comment-13");
  });

  it("annonce une PR REFUSÉE comme telle, et sa réouverture au push", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: { number: 12, state: "closed", comments: [] },
    });
    expect(msg).toMatch(/REJECTED/);
    expect(msg).toMatch(/reopen/i);
  });

  it("ne parle pas de refus quand la PR est ouverte", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: { number: 12, state: "open", comments: [] },
    });
    expect(msg).not.toMatch(/REJECTED/);
  });

  it("tronque un commentaire fleuve au cap par commentaire (2000)", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: { number: 12, state: "open", comments: [{ author: "alice", body: "x".repeat(9000) }] },
    });
    expect(msg).toContain("[truncated]");
    // Le cap est à 2000 : 2100 « x » d'affilée ne peuvent pas survivre.
    expect(msg).toContain("x".repeat(2000));
    expect(msg).not.toContain("x".repeat(2100));
  });

  /**
   * Les commentaires de LIGNE sont la raison d'être de la review ancrée au code :
   * sans leur ancre ni leur extrait de diff, l'agent lit « et le cas nul ? » sans
   * savoir de quel code on parle — et corrige au hasard.
   */
  describe("commentaires de ligne", () => {
    const thread = {
      path: "lib/search.ts",
      line: 42,
      side: "RIGHT" as const,
      diffHunk: "@@ -40,3 +40,3 @@\n const q = input.trim();\n-return search(q);\n+return search(q, opts);",
      comments: [{ author: "alice", body: "Et le cas nul ?" }],
    };

    it("porte l'ancre chemin:ligne, l'extrait de diff et le fil", () => {
      const msg = buildInheritedPrMessage({
        repo,
        pr: { number: 12, state: "open", comments: [], lineThreads: [thread] },
      });
      expect(msg).toContain("lib/search.ts:42");
      expect(msg).toContain("+return search(q, opts);");
      expect(msg).toContain("@alice: Et le cas nul ?");
      // Un commentaire de ligne se répond en code, pas en prose.
      expect(msg).toMatch(/CHANGING THE CODE/i);
    });

    it("empile les réponses d'un même fil sous une seule ancre", () => {
      const msg = buildInheritedPrMessage({
        repo,
        pr: {
          number: 12,
          state: "open",
          comments: [],
          lineThreads: [
            {
              ...thread,
              comments: [
                { author: "alice", body: "Et le cas nul ?" },
                { author: "bob", body: "Bien vu, à corriger." },
              ],
            },
          ],
        },
      });
      expect(msg.split("lib/search.ts:42").length - 1).toBe(1);
      expect(msg).toContain("@bob: Bien vu, à corriger.");
    });

    it("signale une ligne supprimée (side LEFT) — elle vit dans l'ancien fichier", () => {
      const msg = buildInheritedPrMessage({
        repo,
        pr: { number: 12, state: "open", comments: [], lineThreads: [{ ...thread, side: "LEFT" }] },
      });
      expect(msg).toContain("lib/search.ts:42 (removed line)");
    });

    it("marque un fil périmé au lieu d'inventer une ancre", () => {
      const msg = buildInheritedPrMessage({
        repo,
        pr: { number: 12, state: "open", comments: [], lineThreads: [{ ...thread, line: null }] },
      });
      expect(msg).toMatch(/OUTDATED/);
      expect(msg).not.toContain("lib/search.ts:42");
      // Le hunk reste : c'est tout ce qui dit encore de quel code on parlait.
      expect(msg).toContain("+return search(q, opts);");
    });

    it("tronque un hunk fleuve PAR LE HAUT (la ligne commentée est à la fin)", () => {
      const long = ["@@ -1,40 +1,40 @@", ...Array.from({ length: 30 }, (_, i) => ` ctx-${i}`)].join(
        "\n",
      );
      const msg = buildInheritedPrMessage({
        repo,
        pr: {
          number: 12,
          state: "open",
          comments: [],
          lineThreads: [{ ...thread, diffHunk: long }],
        },
      });
      expect(msg).toContain("[hunk truncated]");
      expect(msg).toContain("ctx-29"); // la fin — le code visé — survit
      expect(msg).not.toContain("ctx-0\n"); // le début est coupé
    });

    it("respecte le plafond de 10 fils, en gardant les plus RÉCENTS", () => {
      const threads = Array.from({ length: 14 }, (_, i) => ({
        ...thread,
        path: `file-${i}.ts`,
      }));
      const msg = buildInheritedPrMessage({
        repo,
        pr: { number: 12, state: "open", comments: [], lineThreads: threads },
      });
      expect(msg).not.toContain("file-3.ts");
      expect(msg).toContain("file-4.ts");
      expect(msg).toContain("file-13.ts");
    });

    it("n'ajoute aucune section quand la PR n'a pas de commentaire de ligne", () => {
      const msg = buildInheritedPrMessage({
        repo,
        pr: { number: 12, state: "open", comments: [] },
      });
      expect(msg).not.toMatch(/Line comments/i);
    });
  });

  /**
   * Le maillon entre « GitHub a des commentaires de ligne » et « l'agent les
   * lit » : `execute.ts` passe la réponse BRUTE de l'API à `toPrLineThreads`, dont
   * la sortie alimente l'amorce. On part donc d'objets GitHub tels quels.
   */
  describe("toPrLineThreads — de la réponse GitHub à l'amorce de l'agent", () => {
    /** Un commentaire de review au format exact de l'API (relevé sur une vraie PR). */
    const raw = (over: Partial<Parameters<typeof toPrLineThreads>[0][number]> = {}) => ({
      id: 1,
      body: "Et le cas nul ?",
      path: "lib/search.ts",
      line: 42,
      original_line: 42,
      side: "RIGHT" as const,
      in_reply_to_id: null,
      diff_hunk: "@@ -40,3 +40,3 @@\n-return search(q);\n+return search(q, opts);",
      user: { login: "alice", avatar_url: null },
      created_at: "2026-07-17T10:00:00Z",
      html_url: "https://github.com/o/r/pull/12#discussion_r1",
      ...over,
    });

    it("porte un commentaire GitHub brut jusqu'au message que reçoit l'agent", () => {
      const msg = buildInheritedPrMessage({
        repo,
        pr: { number: 12, state: "open", comments: [], lineThreads: toPrLineThreads([raw()]) },
      });
      expect(msg).toContain("lib/search.ts:42");
      expect(msg).toContain("@alice: Et le cas nul ?");
      expect(msg).toContain("+return search(q, opts);");
    });

    it("regroupe les réponses GitHub en UN fil sous une seule ancre", () => {
      const threads = toPrLineThreads([
        raw({ id: 10, body: "Et le cas nul ?" }),
        raw({ id: 11, body: "Bien vu.", in_reply_to_id: 10, created_at: "2026-07-17T10:05:00Z" }),
      ]);
      expect(threads).toHaveLength(1);
      expect(threads[0].comments.map((c) => c.body)).toEqual(["Et le cas nul ?", "Bien vu."]);

      const msg = buildInheritedPrMessage({
        repo,
        pr: { number: 12, state: "open", comments: [], lineThreads: threads },
      });
      expect(msg.split("lib/search.ts:42").length - 1).toBe(1);
      expect(msg).toContain("@alice: Bien vu.");
    });

    it("propage `line: null` en fil PÉRIMÉ jusqu'au message", () => {
      const msg = buildInheritedPrMessage({
        repo,
        pr: {
          number: 12,
          state: "open",
          comments: [],
          lineThreads: toPrLineThreads([raw({ line: null })]),
        },
      });
      expect(msg).toMatch(/OUTDATED/);
      // Le hunk survit : sans lui l'agent ne saurait plus de quel code on parle.
      expect(msg).toContain("+return search(q, opts);");
    });

    it("propage le side LEFT (ligne supprimée) jusqu'au message", () => {
      const msg = buildInheritedPrMessage({
        repo,
        pr: {
          number: 12,
          state: "open",
          comments: [],
          lineThreads: toPrLineThreads([raw({ side: "LEFT" })]),
        },
      });
      expect(msg).toContain("lib/search.ts:42 (removed line)");
    });

    it("rend [] sur une PR sans commentaire de ligne (pas de section vide)", () => {
      expect(toPrLineThreads([])).toEqual([]);
    });
  });
});

/**
 * Message de CONTEXTE d'amorce : le ticket est un snapshot (l'état vivant se relit
 * via read_issue) et ses pièces jointes sont annoncées avec leur id — sans quoi
 * l'agent ignorerait leur existence tant que l'utilisateur n'en parle pas.
 */
describe("buildAgentContextMessage", () => {
  const base = {
    issue: { identifier: "MIN-42", title: "Add search", description: null, plan: null },
    repo,
  };

  it("annonce les pièces jointes avec id, type et taille", () => {
    const msg = buildAgentContextMessage({
      ...base,
      attachments: [
        { id: "att-1", name: "spec.md", mimeType: "text/markdown", sizeBytes: 2048 },
        { id: "att-2", name: "mock.png", mimeType: "image/png", sizeBytes: 3 * 1024 * 1024 },
      ],
    });
    expect(msg).toContain("spec.md (text/markdown, 2 KB) — id: att-1");
    expect(msg).toContain("mock.png (image/png, 3.0 MB) — id: att-2");
    expect(msg).toContain("read_attachment");
  });

  it("sans pièce jointe, pas de section ; le snapshot renvoie vers read_issue", () => {
    const msg = buildAgentContextMessage(base);
    expect(msg).not.toContain("Attachments on the ticket");
    expect(msg).toContain("read_issue");
    expect(msg).toMatch(/snapshot/i);
  });

  it("injecte le plan du ticket tel quel quand il existe", () => {
    const msg = buildAgentContextMessage({
      ...base,
      issue: { ...base.issue, plan: "- [ ] créer la route\n- [x] écrire le test" },
    });
    expect(msg).toContain("- [ ] créer la route");
    expect(msg).toContain("- [x] écrire le test");
  });
});

/**
 * Variante SANS PR : depuis que l'héritage est indexé sur la branche (la création
 * de PR est une décision), une run froide peut reprendre une branche qui porte du
 * travail jamais mis en PR. Ce message est sa seule mémoire de ce passé.
 */
describe("buildInheritedBranchMessage", () => {
  it("porte la branche, l'absence de PR et l'ordre de ne pas repartir de zéro", () => {
    const msg = buildInheritedBranchMessage({ repo });
    expect(msg).toContain(repo.workBranch);
    expect(msg).toMatch(/No pull request exists yet/i);
    expect(msg).toMatch(/do NOT start the ticket over/i);
    // Même contrainte de clone shallow que le message PR.
    expect(msg).toContain("git diff main");
    expect(msg).not.toContain("main...");
  });

  it("injecte le résumé de la session précédente, plafonné", () => {
    const msg = buildInheritedBranchMessage({
      repo,
      previousSummary: "Ajout du champ de recherche.",
    });
    expect(msg).toContain("Ajout du champ de recherche.");

    const capped = buildInheritedBranchMessage({ repo, previousSummary: "s".repeat(9000) });
    expect(capped).not.toContain("s".repeat(4100));
    expect(capped).toContain("[truncated]");
  });
});

/**
 * MIN-107 : le modèle avait appris à se défendre du harness (10 % des
 * `run_command` de l'histoire du produit pipaient vers `head`/`tail`). Maintenant
 * que la queue survit et que la sortie complète est déposée dans la sandbox, le
 * prompt doit le dire — et l'interdire.
 */
describe("buildAgentSystemPrompt — sorties longues de run_command", () => {
  for (const anchor of ["issue", "notebook"] as const) {
    it(`dit où retrouver la sortie complète (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({ anchor });
      expect(prompt).toContain("full_output_path");
      expect(prompt).toMatch(/never pipe to `head`\/`tail`/i);
      expect(prompt).toMatch(/truncated in the MIDDLE/);
    });
  }
});

/**
 * MIN-108 : les interdits git sont désormais EXÉCUTÉS par le harness
 * (command-guard.ts). Le prompt doit l'annoncer comme une contrainte — « never
 * run » se négocie, « the harness refuses » non — et rester d'accord avec le
 * garde-fou : chaque commande citée ici est réellement refusée là-bas.
 */
describe("buildAgentSystemPrompt — garde-fou git", () => {
  for (const anchor of ["issue", "notebook"] as const) {
    it(`annonce le refus plutôt que l'interdiction (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({ anchor });
      expect(prompt).toContain("The harness owns git.");
      expect(prompt).toMatch(/`run_command` REFUSES/);
      for (const cmd of ["git commit", "git push", "git reset", "git restore", "git checkout -- <file>"]) {
        expect(prompt).toContain(cmd);
      }
      // Ce qui reste libre doit être dit aussi, sinon le modèle s'auto-censure
      // sur `git diff` et cesse de relire son propre travail.
      expect(prompt).toMatch(/status\/diff\/log\/show\/branch/);
      expect(prompt).toContain("`git add`");
      expect(prompt).not.toMatch(/Never run `git commit`/);
    });
  }
});

/**
 * MIN-114 : l'agent peut enfin lancer un serveur et voir tourner son travail. Le
 * prompt doit porter la BOUCLE complète (lancer → attendre → curl → lire →
 * arrêter) : un `run_background` qui démarre un serveur que personne ne sonde ni
 * n'arrête coûte une microVM et ne vérifie rien.
 */
describe("buildAgentSystemPrompt — jobs de fond", () => {
  for (const anchor of ["issue", "notebook"] as const) {
    it(`décrit la boucle lancer → sonder → curl → arrêter (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({ anchor });
      expect(prompt).toContain("`run_background`");
      for (const action of ["`start`", "`check`", "`stop`"]) {
        expect(prompt).toContain(action);
      }
      expect(prompt).toContain("curl");
      // Ce que ça n'est pas : pas de stdin, pas une commande qui se termine seule.
      expect(prompt).toMatch(/NO stdin/);
      expect(prompt).toMatch(/killed when the turn ends/i);
      // Et l'ordre de ne pas laisser tourner un job dont on n'a plus besoin.
      expect(prompt).toMatch(/stop it yourself/i);
    });

    it(`fait de l'exécution réelle une étape de la vérification (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({ anchor });
      expect(prompt).toMatch(/only shows at RUNTIME/);
      expect(prompt).toMatch(/start the dev server with `run_background`/);
    });
  }
});

/**
 * MIN-109 : trois frottements mesurés sur `agent_run_events`. Le prompt porte les
 * deux qui se disent (le troisième, `apply_edits`, est un drapeau côté harness) —
 * le modèle préfixait un `cd` dans 13 % des commandes, souvent vers le répertoire
 * courant PAR DÉFAUT, et cassait `grep` sur du JSX en croyant chercher du texte.
 */
describe("buildAgentSystemPrompt — workdir, grep littéral, batch partiel", () => {
  for (const anchor of ["issue", "notebook"] as const) {
    it(`détourne du \`cd\` vers \`workdir\` (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({ anchor });
      expect(prompt).toMatch(/AVOID `cd <dir> && <cmd>`/);
      expect(prompt).toContain("`workdir`");
      // Dire aussi OÙ l'on est déjà : la moitié des `cd` visaient la racine.
      expect(prompt).toMatch(/already run at the repository ROOT/i);
      expect(prompt).toContain("`timeout_ms`");
    });

    it(`dit comment chercher une chaîne littérale (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({ anchor });
      expect(prompt).toContain("`fixed_strings`");
      expect(prompt).toContain("onUpdateIssue={");
    });

    it(`annonce qu'un batch d'\`apply_edits\` peut réussir en PARTIE (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({ anchor });
      expect(prompt).toMatch(/succeed PARTLY/);
      expect(prompt).toMatch(/retry only the changes that failed/i);
    });
  }
});

/**
 * MIN-115 : les modèles `gpt-*` reçoivent `apply_patch` À LA PLACE d'`edit_file` /
 * `apply_edits` / `write_file` (cf. `agentToolsFor`). Le prompt doit décrire le jeu
 * RÉELLEMENT servi : décrire un tool absent, c'est un round brûlé sur un
 * « Unknown tool », et le décrire deux fois, c'est un modèle qui hésite.
 */
describe("buildAgentSystemPrompt — interface d'édition selon le modèle", () => {
  for (const anchor of ["issue", "notebook"] as const) {
    it(`décrit le format de patch et RIEN d'autre (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({ anchor, applyPatch: true });
      expect(prompt).toContain("`apply_patch`");
      expect(prompt).toContain("*** Begin Patch");
      expect(prompt).toContain("*** Update File:");
      expect(prompt).toContain("*** Move to:");
      expect(prompt).toContain("@@");
      for (const absent of ["`edit_file`", "`apply_edits`", "`write_file`", "old_string"]) {
        expect(prompt).not.toContain(absent);
      }
      // Et la reprise après échec parle de hunks, pas d'`old_string`.
      expect(prompt).toMatch(/rebuild that hunk/);
    });

    it(`garde l'édition par chaîne pour tous les autres modèles (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({ anchor });
      expect(prompt).toContain("`edit_file`");
      expect(prompt).toContain("`apply_edits`");
      expect(prompt).toContain("`write_file`");
      expect(prompt).not.toContain("apply_patch");
      expect(prompt).not.toContain("*** Begin Patch");
    });

    it(`garde \`move_file\` / \`delete_file\` dans les deux branches (ancrage ${anchor})`, () => {
      for (const applyPatch of [true, false]) {
        const prompt = buildAgentSystemPrompt({ anchor, applyPatch });
        expect(prompt).toContain("`move_file`");
        expect(prompt).toContain("`delete_file`");
      }
    });
  }
});

describe("buildAgentSystemPrompt — erreurs de typage rendues par le harness", () => {
  for (const anchor of ["issue", "notebook"] as const) {
    it(`annonce le type-check de fin de tour et sa portée (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({ anchor });
      // La formulation exacte que le harness injecte (diagnostics.ts) : le modèle
      // doit reconnaître le bloc quand il arrive.
      expect(prompt).toContain("Type errors detected after your changes");
      expect(prompt).toMatch(/fix them before replying/i);
      // Et la porte de sortie : un dépôt déjà cassé ne devient pas son sujet.
      expect(prompt).toMatch(/already broken before you touched anything/i);
    });
  }
});

/**
 * L'auto-relecture est EXÉCUTÉE par le harness (self-review.ts), plus demandée en
 * prose. Ce test verrouille l'accord entre les deux : le prompt a longtemps promis
 * une relecture que rien ne lançait, et c'est exactement cet écart — une consigne
 * prise pour un mécanisme — qui laissait passer les erreurs de jointure.
 */
describe("buildAgentSystemPrompt — auto-relecture rendue par le harness", () => {
  for (const anchor of ["issue", "notebook"] as const) {
    it(`annonce le diff de fin de tour, et dissuade de le relancer (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({ anchor });
      expect(prompt).toMatch(/the harness runs it, you don't/i);
      expect(prompt).toMatch(/do NOT run `git diff` yourself/i);
      // La classe d'erreur visée, nommée : c'est elle qui justifie l'injection.
      expect(prompt).toMatch(/no single file shows/i);
      expect(prompt).toContain("i18n placeholders");
    });
  }
});

/**
 * MIN-111 : l'agent VOIT les maquettes — mais seulement sur un run dont le modèle
 * accepte les images. La promesse est conditionnée à la capacité réelle : dire à un
 * modèle texte qu'il peut regarder une maquette lui ferait annoncer « je vois la
 * maquette » sur un résultat qui ne porte que des métadonnées.
 */
describe("buildAgentSystemPrompt — maquettes visibles", () => {
  it("annonce que read_attachment rend l'image, sur un run multimodal", () => {
    const prompt = buildAgentSystemPrompt({ anchor: "issue", images: true });
    expect(prompt).toMatch(/AS AN IMAGE you can actually look at/);
    expect(prompt).toMatch(/mockups a ticket carries BEFORE implementing/);
  });

  it("n'en dit RIEN sur un run non multimodal (défaut)", () => {
    for (const prompt of [
      buildAgentSystemPrompt({ anchor: "issue" }),
      buildAgentSystemPrompt({ anchor: "issue", images: false }),
    ]) {
      expect(prompt).not.toMatch(/AS AN IMAGE/);
      expect(prompt).toContain("`read_attachment`"); // le tool reste décrit
      expect(prompt).toMatch(/binaries via a signed URL/);
    }
  });

  // MIN-125 : le carnet aussi atteint les tickets, donc leurs pièces jointes —
  // la promesse d'image y suit exactement la même règle.
  it("vaut aussi pour l'ancrage carnet, qui atteint les tickets du projet", () => {
    expect(buildAgentSystemPrompt({ anchor: "notebook", images: true })).toMatch(
      /AS AN IMAGE you can actually look at/,
    );
    expect(buildAgentSystemPrompt({ anchor: "notebook" })).not.toMatch(/AS AN IMAGE/);
  });
});

describe("buildAgentContextMessage — pièces jointes image", () => {
  const ticket = {
    issue: { identifier: "MIN-42", title: "Add search", description: null, plan: null },
    repo,
    attachments: [
      { id: "att-1", name: "spec.md", mimeType: "text/markdown", sizeBytes: 2048 },
      { id: "att-2", name: "mock.png", mimeType: "image/png", sizeBytes: 120 * 1024 },
    ],
  };

  it("marque les images comme ouvrables quand le run les voit", () => {
    const msg = buildAgentContextMessage({ ...ticket, images: true });
    expect(msg).toMatch(/mock\.png .*— an image: read_attachment shows it to you/);
    // Le fichier texte, lui, n'est pas annoncé comme une image.
    expect(msg).toMatch(/spec\.md \(text\/markdown, 2 KB\) — id: att-1\n/);
  });

  it("laisse la liste inchangée sur un run non multimodal", () => {
    const msg = buildAgentContextMessage(ticket);
    expect(msg).toContain("mock.png (image/png, 120 KB) — id: att-2");
    expect(msg).not.toContain("shows it to you");
  });
});

/**
 * MIN-125 : les tools minddy ne dépendent plus de l'ancrage. L'inventaire du
 * prompt doit donc les citer TOUS DEUX CÔTÉS — sinon un run de carnet reçoit
 * `update_issue` sans savoir qu'il l'a, et un run de ticket ignore le carnet.
 */
describe("buildAgentSystemPrompt — tools minddy aux deux ancrages", () => {
  const anchors = ["issue", "notebook"] as const;

  it("cite les dix tools quel que soit l'ancrage", () => {
    for (const anchor of anchors) {
      const prompt = buildAgentSystemPrompt({ anchor });
      for (const tool of [
        "search_issues",
        "read_issue",
        "read_attachment",
        "update_issue",
        "write_issue_plan",
        "create_issue",
        "read_scratchpad",
        "add_scratchpad_tasks",
        "update_scratchpad_task",
        "set_scratchpad",
      ]) {
        expect(prompt, `${tool} absent de l'ancrage ${anchor}`).toContain(`\`${tool}\``);
      }
    }
  });

  it("porte la règle dure de non-changement de statut des deux côtés", () => {
    for (const anchor of anchors) {
      const prompt = buildAgentSystemPrompt({ anchor });
      expect(prompt).toContain("**You never change a ticket's status**");
      expect(prompt).toMatch(/refuses `status` and `priority`/);
    }
  });

  it("dit comment viser un autre ticket, selon l'ancrage", () => {
    expect(buildAgentSystemPrompt({ anchor: "issue" })).toMatch(
      /Omit `issue` and they act on THIS session's ticket/,
    );
    expect(buildAgentSystemPrompt({ anchor: "notebook" })).toMatch(
      /they have no default target here, so always pass it/,
    );
  });

  it("assouplit la règle du carnet sans l'ouvrir en grand", () => {
    for (const anchor of anchors) {
      const prompt = buildAgentSystemPrompt({ anchor });
      // Ajouter/supprimer devient possible, mais sur demande explicite seulement.
      expect(prompt).toMatch(/only when they explicitly ask for it/);
      expect(prompt).not.toContain("you never add, remove or rewrite notes in it");
    }
  });

  it("ne contient PAS le statut d'atterrissage (il varie par utilisateur)", () => {
    // Le prompt système est le préfixe partagé par tous les runs d'un même
    // ancrage : y glisser un réglage de compte ruinerait le prompt caching.
    for (const anchor of anchors) {
      const prompt = buildAgentSystemPrompt({ anchor });
      expect(prompt).not.toMatch(/land in '(triage|backlog|todo)'/);
    }
  });
});

/**
 * Le statut d'atterrissage vit dans le message de CONTEXTE, qui est de toute
 * façon propre au run (dépôt, branche, ticket).
 */
describe("statut d'atterrissage annoncé dans le contexte", () => {
  const ticket = {
    issue: { identifier: "MIN-42", title: "Add search", description: null, plan: null },
    repo,
  };

  it("l'annonce sur un run de ticket", () => {
    const msg = buildAgentContextMessage({ ...ticket, numoDefaultStatus: "backlog" });
    expect(msg).toContain("land in 'backlog'");
    expect(msg).toContain("create_issue");
  });

  it("l'annonce sur un run de carnet", () => {
    const msg = buildNotebookContextMessage({ repo, numoDefaultStatus: "todo" });
    expect(msg).toContain("land in 'todo'");
  });

  it("ne dit rien quand le statut n'est pas connu", () => {
    expect(buildAgentContextMessage(ticket)).not.toContain("land in");
    expect(buildNotebookContextMessage({ repo })).not.toContain("land in");
  });
});

/**
 * Délégation (MIN-112). Deux règles du fichier sont testées ici plutôt que relues :
 * le prompt ne décrit JAMAIS ce que le run n'a pas (sinon le modèle appelle un tool
 * absent et brûle un round), et le prompt d'un sous-agent est une persona à part —
 * pas celui du parent amputé, qui lui ferait chercher un ticket inexistant.
 */
const FAVORITES = [
  {
    id: "deepseek/cheap",
    label: "Cheap One",
    use_case: "Exploration, greps, reading a lot of files.",
    thinking_effort: "low" as const,
  },
  { id: "anthropic/strong", label: "Strong One", use_case: "Code you will not re-read." },
];

describe("buildAgentSystemPrompt — section Delegation", () => {
  for (const anchor of ["issue", "notebook"] as const) {
    it(`n'existe PAS quand les tools ne sont pas servis (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({ anchor });
      expect(prompt).not.toContain("spawn_agent");
      expect(prompt).not.toContain("Delegating to sub-agents");
      expect(prompt).not.toContain("Favorites for sub-agents");
    });

    it(`dit le contrat de wakeup et le gel des éditions (ancrage ${anchor})`, () => {
      const prompt = buildAgentSystemPrompt({
        anchor,
        subagents: { favorites: FAVORITES, models: true },
      });
      expect(prompt).toContain("Delegating to sub-agents");
      expect(prompt).toContain("`spawn_agent`");
      expect(prompt).toMatch(/You never wait/);
      expect(prompt).toMatch(/woken up/);
      // Les deux contraintes structurelles : un seul écrivain, et le parent en est un.
      expect(prompt).toMatch(/One writer at a time/);
      expect(prompt).toMatch(/SO ARE YOUR OWN EDITING TOOLS/);
      // Quand NE PAS déléguer compte autant que quand le faire.
      expect(prompt).toMatch(/Do NOT delegate/);
      expect(prompt).toMatch(/cannot delegate further/);
    });
  }

  it("sert les favoris avec leur use-case et le thinking_effort conseillé", () => {
    const prompt = buildAgentSystemPrompt({
      anchor: "issue",
      subagents: { favorites: FAVORITES, models: true },
    });
    expect(prompt).toContain("Favorites for sub-agents");
    expect(prompt).toContain("Cheap One");
    expect(prompt).toContain("`deepseek/cheap`");
    expect(prompt).toContain("Exploration, greps, reading a lot of files.");
    expect(prompt).toContain("suggested thinking_effort: `low`");
    // Un favori sans conseil ne s'invente pas de niveau.
    expect(prompt).toContain("Strong One");
  });

  it("tait les favoris quand le run ne peut pas changer de modèle, et le DIT", () => {
    const prompt = buildAgentSystemPrompt({
      anchor: "issue",
      subagents: { favorites: FAVORITES, models: false },
    });
    expect(prompt).toContain("Delegating to sub-agents");
    expect(prompt).not.toContain("Favorites for sub-agents");
    expect(prompt).not.toContain("Cheap One");
    expect(prompt).toMatch(/always runs on your own model/);
  });

  it("sert la bibliothèque de templates avec leurs variables", () => {
    const prompt = buildAgentSystemPrompt({
      anchor: "issue",
      subagents: { favorites: [], models: true },
    });
    expect(prompt).toContain("Prompt templates");
    expect(prompt).toContain("{{task}}");
    for (const id of ["explore", "implement", "test", "docs"]) {
      expect(prompt).toContain(`\`${id}\``);
    }
  });
});

describe("buildSubagentSystemPrompt", () => {
  it("dit ce qu'un sous-agent n'a pas — et surtout qu'il n'a pas de tour suivant", () => {
    for (const mode of ["explore", "implement"] as const) {
      const prompt = buildSubagentSystemPrompt({ mode });
      expect(prompt).toMatch(/You are a SUB-AGENT/);
      expect(prompt).toMatch(/No ticket, no notebook, no pull request/);
      expect(prompt).toMatch(/No delegation/);
      expect(prompt).toMatch(/No next turn/);
      expect(prompt).toMatch(/No conversation/);
      // Le garde-fou git de command-guard.ts s'applique aussi à lui — mais on ne
      // l'annonce qu'à celui qui a un shell : dire à un `explore` que `run_command`
      // refuse `git push` lui ferait croire qu'il a `run_command`.
      if (mode === "implement") {
        expect(prompt).toContain("git commit");
        expect(prompt).toMatch(/REFUSES/);
      } else {
        expect(prompt).toMatch(/No shell/);
      }
      // Le rapport est l'UNIQUE livrable, avec ses ancres.
      expect(prompt).toContain("## Your report");
      expect(prompt).toContain("`path:line`");
      // Aucun tool du parent n'est jamais décrit.
      for (const tool of ["spawn_agent", "create_pr", "ask_user", "update_plan", "read_issue", "read_scratchpad", "run_background"]) {
        expect(prompt).not.toContain(tool);
      }
    }
  });

  it("un explore est READ-ONLY : aucun tool d'édition décrit", () => {
    const prompt = buildSubagentSystemPrompt({ mode: "explore", webSearch: true });
    for (const tool of ["edit_file", "apply_edits", "write_file", "apply_patch", "web_search"]) {
      expect(prompt).not.toContain(tool);
    }
    expect(prompt).toMatch(/READ-ONLY/);
    expect(prompt).toContain("read_file");
    // `run_command` n'est cité que pour dire qu'il ne l'a PAS : un explore qui
    // tenterait un `npm test` brûlerait un round pour lire « unknown tool ».
    expect(prompt).toMatch(/You have no `run_command`/);
  });

  it("un implement reçoit l'interface d'édition de SON modèle, et la sandbox partagée", () => {
    const strings = buildSubagentSystemPrompt({ mode: "implement" });
    expect(strings).toContain("edit_file");
    expect(strings).not.toContain("apply_patch");
    expect(strings).toMatch(/sandbox is SHARED/);

    const patch = buildSubagentSystemPrompt({ mode: "implement", applyPatch: true });
    expect(patch).toContain("apply_patch");
    for (const tool of ["edit_file", "apply_edits", "write_file"]) {
      expect(patch).not.toContain(tool);
    }
  });

  it("ne promet `web_search` que quand il est servi", () => {
    expect(buildSubagentSystemPrompt({ mode: "implement", webSearch: true })).toContain(
      "web_search",
    );
    expect(buildSubagentSystemPrompt({ mode: "implement", webSearch: false })).not.toContain(
      "web_search",
    );
  });
});
