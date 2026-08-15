import { describe, expect, it } from "vitest";

import {
  decidePermission,
  editTargets,
  KNOWN_PERMISSIONS,
  REVIEWED_OPENCODE_VERSION,
  UNKNOWN_PERMISSION_REASON,
  type PermissionAsk,
  type SubagentContext,
} from "./opencode-permissions";
import { OPENCODE_VERSION } from "./opencode-version";
import { FORBIDDEN_COMMAND_REASON } from "../command-guard";
import { layoutForRoot } from "../harness-layout";

/**
 * MIN-286 lot 2 — le verdict du harness sur une demande de permission d'opencode.
 *
 * Logique PURE, donc testée comme [prune.test.ts](../prune.test.ts) : on appelle,
 * on assert, rien à monter. Ce qu'elle protège n'a pas changé de nature — le
 * travail non commité (`command-guard`) et le dépôt (`repo-path`) —, seul
 * l'endroit où la question est posée a changé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MIN-354 — LE DÉPÔT EST DEVENU UN ARGUMENT, ET CE FICHIER EN CHANGE DE SENS
 *
 * Il était écrit contre `REPO_DIR`, donc contre `/vercel/sandbox/repo`, donc
 * contre le seul monde où ces assertions étaient triviales : les chemins testés
 * et la racine comparée venaient de la même constante, et ne pouvaient pas ne
 * pas s'accorder.
 *
 * Il est réécrit contre une racine de POSTE DE TRAVAIL. C'est là que le verdict
 * a un travail à faire : `metadata.filepath` est ABSOLU (mesure n°2), et un
 * `absoluteInRepo` figé sur `/vercel` refusait *chaque* écriture réelle d'un Mac
 * — pas trop peu, TOUT. Le dernier cas du bloc « les écritures » garde
 * exactement ça : l'ancien chemin de la microVM est désormais **hors** du dépôt,
 * et doit être refusé comme n'importe quel autre.
 */

/** La racine d'un run local — délibérément pas `/vercel` (cf. en-tête). */
const LAYOUT = layoutForRoot("/Users/dev/Library/Application Support/minddy/runs/r-42", "/Users/dev/Library/Application Support/minddy/oc");
const REPO = LAYOUT.repoDir;

const ask = (over: Partial<PermissionAsk>): PermissionAsk => ({
  id: "per_1",
  sessionId: "ses_1",
  permission: "bash",
  callId: "call_1",
  ...over,
});

/** Le verdict, sur le dépôt de CE run. */
const decide = (a: PermissionAsk, subagents?: SubagentContext) =>
  decidePermission(a, REPO, subagents);

describe("les commandes", () => {
  it("laisse passer ce qui ne détruit rien", () => {
    for (const command of ["echo hi", "npm test", "git status", "git add -A"]) {
      expect(decide(ask({ command }))).toEqual({ reply: "once" });
    }
  });

  it("refuse ce que `command-guard` refuse, en disant pourquoi au modèle", () => {
    const verdict = decide(ask({ command: "git reset --hard" }));
    expect(verdict.reply).toBe("reject");
    // Le message VOYAGE : opencode le recopie dans l'erreur du tool, et c'est là
    // que le modèle le lit. Un refus muet le laisserait deviner.
    expect(verdict.message).toContain("throws away uncommitted work");
    // Et le refus reste mesurable en base, comme du temps de la boucle maison.
    expect(verdict.reason).toBe(FORBIDDEN_COMMAND_REASON);
  });

  it("refuse une demande dont il ne sait pas lire la commande", () => {
    expect(decide(ask({ command: "  " })).reply).toBe("reject");
  });
});

describe("les écritures", () => {
  it("laisse passer un fichier du dépôt, relatif ou absolu", () => {
    expect(decide(ask({ permission: "edit", filepath: "lib/a.ts" }))).toEqual({
      reply: "once",
    });
    expect(
      decide(ask({ permission: "edit", filepath: `${REPO}/lib/a.ts` })),
    ).toEqual({ reply: "once" });
  });

  it("refuse ce qui sort du dépôt — y compris en chemin ABSOLU", () => {
    // Le piège du branchement : `resolveWithin` recolle un absolu sous le dépôt
    // (`/etc/passwd` → `<dépôt>/etc/passwd`), donc ne refuse rien. Or opencode
    // rend justement `metadata.filepath` en absolu.
    expect(decide(ask({ permission: "edit", filepath: "/etc/passwd" })).reply).toBe(
      "reject",
    );
    expect(decide(ask({ permission: "edit", filepath: "../../etc/passwd" })).reply).toBe(
      "reject",
    );
  });

  it("refuse `.git/`, qu'opencode écrit sans rien demander", () => {
    // Mesuré : `write` sur `<dépôt>/.git/config` a été exécuté et a écrasé le
    // fichier. C'est la raison d'être du `ask` sur `edit`.
    const verdict = decide(ask({ permission: "edit", filepath: `${REPO}/.git/config` }));
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain(".git");
  });

  it("refuse une demande sans chemin", () => {
    expect(decide(ask({ permission: "edit" })).reply).toBe("reject");
  });

  /**
   * LE VERDICT SUIT LE RUN, ET RIEN D'AUTRE (MIN-354).
   *
   * `/vercel/sandbox/repo` était LE dépôt ; il n'est plus qu'un chemin comme un
   * autre dès que le run vit ailleurs, et il doit être refusé comme tel. C'est
   * le sens exact de l'assertion : la garde ne connaît aucun chemin béni, elle
   * ne connaît que celui de son run.
   */
  it("refuse l'ancien chemin de la microVM quand le run vit ailleurs", () => {
    expect(
      decide(ask({ permission: "edit", filepath: "/vercel/sandbox/repo/lib/a.ts" })).reply,
    ).toBe("reject");
  });

  /**
   * ET IL NE SORT PAS DE SA RACINE PAR LE HAUT. Le harness, les sorties de tools
   * et le `.tsbuildinfo` sont FRÈRES du dépôt sous la racine du run : un
   * `../harness/job.json` viserait le job du tour — donc l'historique de la
   * conversation et l'URL de push, token compris.
   */
  it("refuse d'écrire dans le harness du run, qui est le frère du dépôt", () => {
    expect(
      decide(ask({ permission: "edit", filepath: `${LAYOUT.harnessDir}/job.json` })).reply,
    ).toBe("reject");
    expect(decide(ask({ permission: "edit", filepath: "../harness/job.json" })).reply).toBe(
      "reject",
    );
  });
});

/**
 * `apply_patch` — UNE demande pour N fichiers (mesuré sur opencode-ai@1.18.16 :
 * `ask({permission: "edit", metadata: {filepath: chemins.join(", "), files}})`).
 * Le `filepath` recollé n'est pas un chemin : lu comme tel, il faisait passer
 * `a.ts, .git` pour un unique segment de répertoire, et le garde-fou du dépôt ne
 * voyait plus le `.git/` qui suivait.
 */
describe("les écritures d'un patch multi-fichiers", () => {
  const patch = (files: { path: string; status: "added" | "modified" | "deleted" }[]) =>
    ask({
      permission: "edit",
      filepath: files.map((f) => f.path).join(", "),
      files,
    });

  it("laisse passer quand TOUS les fichiers sont dans le dépôt", () => {
    expect(
      decide(
        patch([
          { path: `${REPO}/lib/a.ts`, status: "modified" },
          { path: `${REPO}/lib/b.ts`, status: "added" },
        ]),
      ),
    ).toEqual({ reply: "once" });
  });

  it("refuse dès qu'UN fichier sort du dépôt, fût-il le dernier", () => {
    const verdict = decide(
      patch([
        { path: `${REPO}/lib/a.ts`, status: "modified" },
        { path: "/etc/passwd", status: "modified" },
      ]),
    );
    expect(verdict.reply).toBe("reject");
  });

  it("refuse un `.git/` caché derrière un premier fichier légitime", () => {
    const verdict = decide(
      patch([
        { path: `${REPO}/lib/a.ts`, status: "modified" },
        { path: `${REPO}/.git/config`, status: "modified" },
      ]),
    );
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain(".git");
  });

  it("ne lit JAMAIS le filepath recollé comme un chemin", () => {
    // Sans `files`, c'est cette chaîne-là qui servait de chemin unique.
    const joined = ask({
      permission: "edit",
      filepath: `${REPO}/lib/a.ts, ${REPO}/.git/config`,
      files: [
        { path: `${REPO}/lib/a.ts`, status: "modified" },
        { path: `${REPO}/.git/config`, status: "modified" },
      ],
    });
    expect(decide(joined).reply).toBe("reject");
  });
});

describe("editTargets", () => {
  it("rend la liste de `files` quand elle est là, avec la nature du geste", () => {
    expect(
      editTargets(
        ask({
          permission: "edit",
          filepath: "a.ts, b.ts",
          files: [
            { path: "a.ts", status: "added" },
            { path: "b.ts", status: "deleted" },
          ],
        }),
      ),
    ).toEqual([
      { path: "a.ts", status: "added" },
      { path: "b.ts", status: "deleted" },
    ]);
  });

  it("retombe sur le `filepath` seul des tools mono-fichier", () => {
    expect(editTargets(ask({ permission: "edit", filepath: "lib/a.ts" }))).toEqual([
      { path: "lib/a.ts", status: "modified" },
    ]);
  });

  it("ne rend rien quand il n'y a rien à lire", () => {
    expect(editTargets(ask({ permission: "edit" }))).toEqual([]);
    expect(editTargets(ask({ permission: "edit", filepath: "   " }))).toEqual([]);
  });
});

/**
 * La délégation (tâche 12). Mesuré sur le binaire le 2026-08-12 : la demande de
 * permission d'un `task` porte `patterns: ["explore-cheap"]` et
 * `metadata: {description, subagent_type}` — **et elle arrive avant** qu'opencode
 * ne résolve l'agent. C'est ce qui rend ces deux refus possibles.
 */
describe("la délégation", () => {
  const context = (over: Partial<SubagentContext> = {}): SubagentContext => ({
    names: new Set(["explore", "general", "explore-anthropic-claude-haiku-4-5"]),
    running: 0,
    maxParallel: 2,
    ...over,
  });

  const task = (subagentType: string) =>
    ask({ permission: "task", subagentType });

  it("laisse déléguer sur un sous-agent offert", () => {
    expect(decide(task("explore"), context())).toEqual({ reply: "once" });
    expect(
      decide(task("explore-anthropic-claude-haiku-4-5"), context()),
    ).toEqual({ reply: "once" });
  });

  it("tient le plafond de simultané, et le DIT au modèle", () => {
    // Le sandbox est partagé : deux filles qui écrivent en même temps se
    // marchent dessus. Même refus, aux mots près, que le registre maison.
    const verdict = decide(task("general"), context({ running: 2, maxParallel: 2 }));
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain("2/2");
    expect(verdict.reason).toBe("subagent_limit");
  });

  /**
   * MIN-286 — LE CAS QUE LE PLAFOND A À BORNER, ET LE SEUL.
   *
   * Chez opencode, le `task` de premier plan BLOQUE le parent : le simultané ne
   * peut venir que d'un round qui appelle `task` PLUSIEURS FOIS. Or ces demandes
   * sont toutes arbitrées avant qu'aucune fille n'existe — le flux ne rattache une
   * fille qu'après coup (`opencode-delegation.test.ts` ancre `runningAtAsk === 0`).
   * Compté sur les seules vivantes, le plafond valait donc zéro aux trois, et ne
   * bornait rien. C'est le crédit ouvert par les autorisations qui le tient.
   */
  it("compte les délégations AUTORISÉES dont la fille n'est pas encore née", () => {
    const verdict = decide(
      task("general"),
      context({ running: 0, pending: 2, maxParallel: 2 }),
    );
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain("2/2");
    expect(verdict.reason).toBe("subagent_limit");
  });

  it("additionne les vivantes et les promises", () => {
    expect(
      decide(task("general"), context({ running: 1, pending: 1, maxParallel: 2 })).reply,
    ).toBe("reject");
    expect(
      decide(task("general"), context({ running: 1, pending: 0, maxParallel: 2 })).reply,
    ).toBe("once");
  });

  it("rend l'offre au modèle qui demande un sous-agent qui n'existe pas", () => {
    // Opencode répondrait « Unknown agent type: X » sans dire ce qui est offert.
    const verdict = decide(task("general-openai-gpt-5"), context());
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain("general-openai-gpt-5");
    expect(verdict.message).toContain("explore-anthropic-claude-haiku-4-5");
    expect(verdict.reason).toBe("unknown_subagent");
  });

  it("ne refuse rien quand personne ne lui a donné l'offre du tour", () => {
    // Un garde-fou qui ne sait pas ce qui est offert ne doit pas inventer un
    // refus : la config a déjà tranché ce qui existe.
    expect(decide(task("explore"))).toEqual({ reply: "once" });
  });
});

describe("le reste", () => {
  it("refuse le disque hors dépôt", () => {
    expect(
      decide(ask({ permission: "external_directory", filepath: "/etc/x" })).reply,
    ).toBe("reject");
  });

  it("laisse passer ce qui n'est pas gardé (la config l'a déjà tranché)", () => {
    expect(decide(ask({ permission: "webfetch", url: "https://example.com" }))).toEqual({
      reply: "once",
    });
  });
});

/**
 * MIN-360 — CE QUE LE CHEMIN LOCAL CHANGE, ET LUI SEUL.
 *
 * Trois verdicts basculent quand le tour joue sur la machine de quelqu'un, et la
 * moitié de ce bloc sert à garder l'autre moitié : **rien ne bascule en microVM**.
 * Le clone y est jetable, la boucle locale n'y porte que nos deux serveurs, et
 * faire payer un aller-retour de permission à chaque lecture de 100 % des runs
 * cloud pour un risque qui n'existe pas serait le mauvais échange.
 */
describe("le chemin local (MIN-360)", () => {
  const local = (a: PermissionAsk) => decidePermission(a, REPO, undefined, { local: true });

  describe("les lectures", () => {
    it("refuse la famille dotenv — c'est le vrai `.env` de l'utilisateur", () => {
      for (const path of [`${REPO}/.env`, `${REPO}/.env.local`, `${REPO}/apps/web/.env`]) {
        const verdict = local(ask({ permission: "read", filepath: path }));
        expect(verdict.reply, path).toBe("reject");
        expect(verdict.reason).toBe("secret_file_read");
      }
    });

    it("renvoie vers le `.env.example`, qui reste lisible", () => {
      const verdict = local(ask({ permission: "read", filepath: `${REPO}/.env` }));
      expect(verdict.message).toMatch(/\.env\.example/);
      expect(local(ask({ permission: "read", filepath: `${REPO}/.env.example` }))).toEqual({
        reply: "once",
      });
    });

    it("laisse passer tout le reste", () => {
      for (const path of [`${REPO}/lib/x.ts`, `${REPO}/README.md`, `${REPO}/lib/env.ts`]) {
        expect(local(ask({ permission: "read", filepath: path })), path).toEqual({ reply: "once" });
      }
    });

    it("refuse une lecture dont il ne sait pas lire le chemin", () => {
      expect(local(ask({ permission: "read" })).reply).toBe("reject");
    });
  });

  /**
   * MIN-364 (décision D8) — LE FETCH SE JUGE SUR LE PORT.
   *
   * Le refus portait sur tout l'espace privé, et son dommage collatéral était la
   * capacité qu'on veut : `curl localhost:3000` pour aller voir rendre la page
   * qu'on vient d'écrire. Ce qui reste refusé est ce qui n'est PAS une page — le
   * proxy LLM (il porte la clé du modèle), le pont de tools (il n'authentifie
   * rien : le joindre, c'est appeler `create_pr` à la place de l'agent) et le
   * serveur opencode du tour (son API répond à qui la joint).
   */
  describe("les fetchs", () => {
    const HARNESS = [4096, 4097, 51234];
    const localFetch = (url?: string) =>
      decidePermission(ask({ permission: "webfetch", url }), REPO, undefined, {
        local: true,
        harnessPorts: HARNESS,
      });

    it("refuse les trois services du harness, sur la boucle locale", () => {
      for (const url of [
        "http://127.0.0.1:4096/v1/chat/completions", // le proxy LLM, donc la clé
        "http://localhost:4097/tool", // le pont, qui n'authentifie rien
        "http://[::1]:51234/session", // le serveur opencode du tour
      ]) {
        const verdict = localFetch(url);
        expect(verdict.reply, url).toBe("reject");
        expect(verdict.reason).toBe("private_fetch");
      }
    });

    it("laisse passer le serveur de dév de l'utilisateur — l'écart de parité n°1", () => {
      for (const url of [
        "http://localhost:3000",
        "http://127.0.0.1:3000/api/health",
        "http://[::1]:8080/",
        "http://192.168.1.42:5173/",
      ]) {
        expect(localFetch(url), url).toEqual({ reply: "once" });
      }
    });

    it("laisse passer une URL publique", () => {
      expect(localFetch("https://example.com/docs")).toEqual({ reply: "once" });
    });

    it("refuse un fetch dont il ne sait pas lire l'URL", () => {
      expect(localFetch().reply).toBe("reject");
    });

    /**
     * SANS LISTE DE PORTS, TOUTE LA BOUCLE LOCALE RESTE REFUSÉE — le comportement
     * d'avant D8. Une ignorance ne s'interprète pas en autorisation, et le
     * superviseur est le seul à connaître ces trois ports : s'il oublie de les
     * passer, c'est le refus large qui doit rester.
     */
    it("refuse tout le privé quand les ports du harness sont inconnus", () => {
      for (const url of ["http://localhost:3000", "http://192.168.1.1/admin", "http://nas.local/x"]) {
        expect(local(ask({ permission: "webfetch", url })).reply, url).toBe("reject");
      }
    });
  });

  describe("la permission inconnue", () => {
    it("passe en microVM, refuse sur une machine", () => {
      // `lsp`, et tout ce qu'une montée de version ajoutera sans que personne ne
      // l'ait lu. (`skill`, `doom_loop` et `plan_enter` ont depuis été LUS et
      // tranchés, cf. `KNOWN_PERMISSIONS` : ils ne sont plus des inconnus.)
      for (const permission of ["lsp", "mcp_call", "quelque_chose_de_1_19"]) {
        expect(decide(ask({ permission })), permission).toEqual({ reply: "once" });
        const verdict = local(ask({ permission }));
        expect(verdict.reply, permission).toBe("reject");
        expect(verdict.reason).toBe("unknown_permission");
        // Le refus NOMME la permission : c'est ce qui le rend réparable, et ce
        // qui fait qu'une montée de version se voit dans `agent_run_events`.
        expect(verdict.message).toContain(permission);
      }
    });
  });

  /**
   * MIN-364 (décision D5) — LE PÉRIMÈTRE D'ÉCRITURE S'OUVRE ICI, ET NULLE PART
   * AILLEURS.
   *
   * `external_directory: "deny"` a longtemps été décrit comme la frontière ; il
   * n'en était pas une (un `deny` de config court-circuite avant publication).
   * Ce qui refusait vraiment, c'est `absoluteInRepo` dans le `case "edit"` —
   * donc c'est lui qui devait changer.
   */
  describe("le périmètre d'écriture", () => {
    it("laisse écrire hors du dossier attaché — un monorepo, un dépôt voisin", () => {
      for (const path of [
        "/Users/dev/Projets/voisin/lib/x.ts",
        "/Users/dev/.config/opencode/skill/x.md",
        "../voisin/lib/x.ts",
      ]) {
        expect(local(ask({ permission: "edit", filepath: path })), path).toEqual({
          reply: "once",
        });
      }
    });

    it("publie la sortie de dossier au lieu de la refuser", () => {
      expect(local(ask({ permission: "external_directory", filepath: "/Users/dev/Projets" }))).toEqual({
        reply: "once",
      });
      // …et la microVM, elle, garde son refus : elle n'a qu'un dépôt.
      expect(decide(ask({ permission: "external_directory", filepath: "/etc" })).reply).toBe(
        "reject",
      );
    });

    /**
     * LE SEUL RESTE DE PÉRIMÈTRE, et il ne dépend d'aucune décision (§9 de
     * l'audit) : un hook écrit dans un `.git/` s'exécute au prochain geste git
     * d'un humain, et un `.git/config` porte des identifiants. Où qu'il soit sur
     * le disque, pas seulement dans le dépôt du tour.
     */
    it("refuse `.git/` PARTOUT, y compris dans un dépôt voisin", () => {
      for (const path of [
        `${REPO}/.git/hooks/pre-commit`,
        "/Users/dev/Projets/voisin/.git/config",
        "/Users/dev/Projets/voisin/.GIT/hooks/pre-push",
      ]) {
        const verdict = local(ask({ permission: "edit", filepath: path }));
        expect(verdict.reply, path).toBe("reject");
        expect(verdict.message).toContain(".git");
      }
    });
  });

  it("ne change RIEN aux verdicts qui existaient déjà", () => {
    expect(local(ask({ command: "npm test" }))).toEqual({ reply: "once" });
    expect(local(ask({ command: "git push" })).reply).toBe("reject");
    expect(local(ask({ permission: "edit", filepath: `${REPO}/lib/x.ts` }))).toEqual({
      reply: "once",
    });
    // …et la microVM garde SA frontière : c'est le clone jetable, il n'y a
    // qu'un dépôt, et rien n'y justifie d'ouvrir le disque.
    expect(decide(ask({ permission: "edit", filepath: "/etc/passwd" })).reply).toBe("reject");
  });
});

/**
 * MIN-364 (lot 7, §5.5 de l'audit du 15/08) — LE CLIQUET DE VERSION.
 *
 * `default: reject` est la bonne POSTURE sur la machine de quelqu'un. Laissé
 * seul, il fait de chaque montée d'opencode un RETRAIT de capacité que personne
 * ne décide : `lsp`, `plan_enter`/`plan_exit`, `skill`, `doom_loop` étaient tous
 * refusés « par construction », et le seraient restés indéfiniment. Combiné à
 * `OPENCODE_DISABLE_LSP_DOWNLOAD`, ça voulait dire qu'on n'aurait JAMAIS les
 * diagnostics LSP recollés à l'édition — le mécanisme que la porte de livraison
 * cite elle-même comme la bonne forme.
 *
 * Ce qui manquait n'était pas le refus, c'était le geste qui le lève. Ces tests
 * SONT ce geste : la relecture devient une étape de la montée de version.
 */
describe("les permissions lues, et la montée de version qui les périme", () => {
  it("TOMBE dès qu'opencode monte de version, tant que la liste n'a pas été relue", () => {
    expect(
      REVIEWED_OPENCODE_VERSION,
      `opencode est passé en ${OPENCODE_VERSION} et les permissions n'ont pas été relues. ` +
        "Relever le ruleset par défaut du binaire (`strings <bin> | grep doom_loop`) et les ids " +
        "de tools (`GET /experimental/tool`), caser toute permission de plus dans " +
        "`decidePermission`, l'ajouter à `KNOWN_PERMISSIONS`, PUIS avancer " +
        "`REVIEWED_OPENCODE_VERSION`.",
    ).toBe(OPENCODE_VERSION);
  });

  it("traite VRAIMENT chaque permission qu'elle déclare connaître", () => {
    // La liste ne doit pas pouvoir grossir sans que le `switch` grossisse avec :
    // un nom déclaré mais non casé retomberait dans le `default`, c'est-à-dire
    // refusé « parce qu'inconnu » tout en étant annoncé connu.
    for (const permission of KNOWN_PERMISSIONS) {
      const verdict = decidePermission(ask({ permission }), REPO, undefined, { local: true });
      expect(verdict.reason, permission).not.toBe(UNKNOWN_PERMISSION_REASON);
    }
  });

  it("garde le refus par défaut sur ce qui n'y est PAS", () => {
    for (const permission of ["lsp", "mcp_call", "quelque_chose_de_1_19"]) {
      expect(KNOWN_PERMISSIONS.has(permission)).toBe(false);
      const verdict = decidePermission(ask({ permission }), REPO, undefined, { local: true });
      expect(verdict.reply, permission).toBe("reject");
      expect(verdict.reason).toBe(UNKNOWN_PERMISSION_REASON);
      // Et il NOMME la permission : c'est ce qui le rend réparable, et ce qui
      // fait qu'une montée de version se voit dans `agent_run_events`.
      expect(verdict.message).toContain(permission);
    }
  });

  /**
   * `doom_loop` est publié quand le modèle rejoue exactement le même appel de
   * tool, plusieurs fois d'affilée. Le refus est le bon verdict — personne n'est
   * devant l'écran pour arbitrer, et une boucle coûte un round à chaque tour —
   * mais il doit DIRE ce qui se passe : « permission inconnue » n'aide pas à en
   * sortir.
   */
  it("coupe une boucle en disant que c'en est une", () => {
    const verdict = decidePermission(ask({ permission: "doom_loop" }), REPO, undefined, {
      local: true,
    });
    expect(verdict.reply).toBe("reject");
    expect(verdict.reason).toBe("doom_loop");
    expect(verdict.message).toMatch(/same tool with the same input/i);
  });
});
