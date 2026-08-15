import { posix as posixPath } from "node:path";

import { checkCommand, FORBIDDEN_COMMAND_REASON } from "../command-guard";
import { assertNotGit, resolveWithin } from "../repo-path";
import { isSecretFile } from "../secret-scan";
import {
  fetchHostname,
  fetchPort,
  isPrivateHostname,
  privateFetchMessage,
  PRIVATE_FETCH_REASON,
} from "./private-address";

/**
 * LES GARDE-FOUS, REJOUÉS SUR LA DEMANDE DE PERMISSION D'OPENCODE (MIN-286, lot 2).
 *
 * Ce que le harness maison faisait DANS le tool (`exec-tool.ts` refusait
 * `git reset --hard` avant de toucher au Sandbox, `repo-host.ts` refusait une
 * écriture hors dépôt), opencode le demande : `permission: {bash: "ask",
 * edit: "ask"}` suspend l'appel et publie `permission.asked` sur le flux. Le
 * superviseur répond — et sa réponse EST le garde-fou.
 *
 * Un module PUR, donc : la décision se teste sans serveur, et
 * [command-guard.ts](../command-guard.ts) comme [repo-path.ts](../repo-path.ts)
 * n'ont pas changé d'une ligne. Ce sont les mêmes fonctions, appelées d'ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ (opencode-ai@1.18.16, faux fournisseur local qui scripte
 * les appels de tool — aucun modèle dépensé)
 *
 * 1. **`bash: "ask"` publie une demande**, et `echo hi` la publie :
 *    `{permission: "bash", patterns: ["echo hi"], metadata: {command: "echo hi"},
 *    always: ["echo *"], tool: {messageID, callID}}`. Sur une commande ordinaire,
 *    le garde-fou voit donc exactement ce que voyait `run_command`.
 *
 *    ⚠ **« pour TOUTE commande » était faux** (MIN-362, MIN-363), et la nuance
 *    n'est pas d'école : mesurée commande par commande dans
 *    [opencode-permissions.probe.test.ts](opencode-permissions.probe.test.ts),
 *    `cd <ailleurs>` publie `external_directory` et **jamais** `bash`, et `cd .`
 *    comme `popd` ne publient **rien du tout**. Ces trois-là ne passent JAMAIS
 *    devant `checkCommand`. Sur trente commandes visant un dossier hors dépôt,
 *    dix publient `external_directory`, vingt ne publient que `bash` — dont
 *    `grep`, `find`, `sed`, `node`, `curl`, que `checkCommand` (qui ne vise que
 *    git) laisse passer. **Ce module est un anti-accident, pas un périmètre** ;
 *    le seul périmètre qui tiendrait est au niveau de l'OS (§2 de
 *    [l'audit local](../../../../docs/audits/agent-local-2026-08-14.md)).
 * 2. **Une écriture publie `permission: "edit"`** avec `metadata.filepath`
 *    **ABSOLU** (et un `diff`), quel que soit le tool — `write`, `edit`,
 *    `apply_patch`. Une écriture HORS du dépôt en publie deux : d'abord
 *    `external_directory` (`metadata.parentDir`), puis `edit`.
 * 3. **`.git/` n'est protégé par personne chez opencode** : `write` sur
 *    `<dépôt>/.git/config` a été **exécuté** et a écrasé le fichier. C'est
 *    précisément ce que `assertNotGit` garde (écrire un hook ou un `config` =
 *    exfiltration du token d'installation), et c'est la raison pour laquelle
 *    `edit` est en `ask` plutôt qu'en `allow` dans la config du tour.
 * 4. **La réponse porte un MESSAGE, et le modèle le lit** :
 *    `POST /permission/:id/reply {reply: "reject", message}` → le tool revient en
 *    `status: "error"` avec « The user rejected permission to use this specific
 *    tool call with the following feedback: <message> ». C'est ce qui fait qu'un
 *    refus reste ce qu'il a toujours été chez nous : une **erreur de tool** que
 *    le modèle lit et corrige, jamais un tour cassé.
 */

/** Une demande de permission, telle que le flux la publie (`permission.asked`). */
export interface PermissionAsk {
  id: string;
  sessionId: string;
  /** L'action demandée : `bash`, `edit`, `external_directory`, `webfetch`… */
  permission: string;
  /** L'appel de tool qui l'a déclenchée — ce qui relie le refus au fil. */
  callId: string;
  /** `metadata.command` sur un `bash`. */
  command?: string;
  /**
   * LE CHEMIN DONT LA DEMANDE PARLE, et il ne voyage pas au même endroit selon
   * le tool (cf. `permissionPath` dans [opencode-events.ts](opencode-events.ts)) :
   * `metadata.filepath` sur une ÉCRITURE, absolu (mesure n°2) ; `patterns[0]` sur
   * une LECTURE, relatif au worktree, parce que `ReadTool` publie un `metadata`
   * VIDE — mesuré sur le binaire, et c'est le genre de détail qui fait refuser
   * 100 % des lectures quand on le suppose au lieu de le regarder.
   */
  filepath?: string;
  /**
   * LES FICHIERS D'UN `apply_patch`, UN PAR UN (`metadata.files`).
   *
   * `write` et `edit` touchent un fichier et publient un `filepath`. `apply_patch`
   * en touche N et n'en publie **qu'une seule demande**, dont le `filepath` est la
   * liste RECOLLÉE : `resources.join(", ")` (mesuré sur le binaire). Prise pour un
   * chemin, cette chaîne donnait une ligne de « fichiers changés » portant trois à
   * cinq noms séparés par des virgules — et, plus grave, un `assertNotGit` qui ne
   * voit qu'un segment `a.ts, .git` : le seul garde-fou du dépôt passait à côté
   * d'un patch qui touche `.git/config` en second.
   *
   * `metadata.files` porte la vraie liste, avec la nature de chaque geste. Vide
   * (ou absent) sur les tools mono-fichier : `filepath` suffit et fait foi.
   */
  files?: { path: string; status: "added" | "modified" | "deleted" }[];
  /**
   * `metadata.subagent_type` sur un `task` : le sous-agent demandé, DEMANDÉ
   * AVANT qu'opencode ne le résolve (mesuré, cf. `decideTask`).
   */
  subagentType?: string;
  /**
   * L'URL d'un `webfetch` (MIN-360). Elle n'était lue par personne, pour une
   * raison qui a cessé d'être vraie : `webfetch: "allow"` ne publiait aucune
   * demande, donc ce verdict ne voyait jamais un seul fetch.
   */
  url?: string;
}

/**
 * Ce que le superviseur sait des sous-agents au moment du verdict — l'offre du
 * tour et ce qui tourne déjà. Absent = pas de délégation à arbitrer.
 */
export interface SubagentContext {
  /** Les `subagent_type` déclarés en config ([opencode-config.ts](opencode-config.ts)). */
  names: ReadonlySet<string>;
  /** Filles vivantes à cet instant. */
  running: number;
  /**
   * DÉLÉGATIONS AUTORISÉES ET PAS ENCORE NÉES — sans elles, le plafond ne borne
   * rien du seul cas qu'il ait à borner.
   *
   * Une fille n'entre dans `running` qu'à sa NAISSANCE, et le flux ne l'annonce
   * qu'après coup (`metadata` du part `task`, mesuré : `opencode-delegation.test.ts`
   * ancre `runningAtAsk === 0`). Un round qui appelle `task` trois fois voyait donc
   * ses trois demandes arbitrées avant qu'aucune fille n'existe, et `running`
   * valait zéro aux trois — le plafond passait toujours. Ce qu'on compte ici est
   * le crédit ouvert entre l'autorisation et la naissance.
   */
  pending?: number;
  /** Plafond de simultané (`app_config`, MIN-112). */
  maxParallel: number;
}

/** Ce que le superviseur doit répondre, et pourquoi. */
export interface PermissionVerdict {
  reply: "once" | "reject";
  /** Le mot au modèle sur un refus — il arrive dans l'erreur de tool (mesure n°4). */
  message?: string;
  /** `tool_result.reason`, pour que le refus reste mesurable en base. */
  reason?: string;
}

const ALLOW: PermissionVerdict = { reply: "once" };

/** `tool_result.reason` d'une permission que ce module ne connaît pas. */
export const UNKNOWN_PERMISSION_REASON = "unknown_permission";

/** `tool_result.reason` d'une boucle coupée (`doom_loop`). */
export const DOOM_LOOP_REASON = "doom_loop";

/** `tool_result.reason` d'une capacité que la config du tour a éteinte. */
export const DISABLED_PERMISSION_REASON = "disabled_permission";

/**
 * LES PERMISSIONS QU'ON A LUES, ET LA VERSION OÙ ON LES A LUES (MIN-364, lot 7).
 *
 * ## Le défaut que ça ferme : un cliquet
 *
 * `default: reject` est la bonne POSTURE sur la machine de quelqu'un — autoriser
 * ce qu'on n'a jamais lu n'est pas un garde-fou. Mais laissé seul, il fait de
 * chaque montée d'opencode un RETRAIT de capacité que personne ne décide : `lsp`,
 * `plan_enter`/`plan_exit`, `skill`, `doom_loop` étaient tous refusés « par
 * construction », et le seraient restés indéfiniment (§5.5 de l'audit du 15/08).
 *
 * Ce qui manquait n'est pas le refus, c'est le geste qui le lève. Le voici :
 * **cette liste est ce que le harness a lu et tranché**, et
 * `REVIEWED_OPENCODE_VERSION` dit à quelle version. Un test tombe dès que
 * `OPENCODE_VERSION` avance ([opencode-permissions.test.ts](opencode-permissions.test.ts)) :
 * la relecture devient une étape de la montée de version, pas un oubli.
 *
 * ## Comment la relire, à la prochaine montée
 *
 * Le binaire porte son propre ruleset par défaut, et c'est lui qui fait foi :
 * `strings opencode | grep 'doom_loop:"ask"'` en donne le bloc complet
 * (`{"*":"allow", doom_loop:"ask", external_directory:{…}, question:"deny",
 * plan_enter:"deny", plan_exit:"deny", read:{…}}` en 1.18.16), et
 * `GET /experimental/tool` sur un serveur nu donne les ids de tools. Toute
 * permission de plus se case ici avec un verdict et une phrase pour le modèle.
 */
export const REVIEWED_OPENCODE_VERSION = "1.18.16";

/**
 * Les noms de permission que `decidePermission` traite explicitement. Tout ce qui
 * n'y est pas tombe dans le `default` — donc refusé en local, en le disant.
 */
export const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set([
  // Ce qui publie vraiment avec notre config (mesuré) …
  "bash",
  "edit",
  "read",
  "webfetch",
  "task",
  "external_directory",
  "question",
  "doom_loop",
  // … et ce que la config sert en `allow` ou en `deny`, donc qui ne publie pas
  // aujourd'hui. Lu et tranché quand même : une ACL qui change de version ne doit
  // pas casser un tour sur une permission dont la conduite est évidente.
  "glob",
  "grep",
  "websearch",
  "todowrite",
  "skill",
  "plan_enter",
  "plan_exit",
]);

/** `tool_result.reason` d'une lecture de fichier de secrets refusée. */
export const SECRET_FILE_READ_REASON = "secret_file_read";

/**
 * CE QUE LE VERDICT DOIT SAVOIR DU MONDE OÙ IL S'APPLIQUE (MIN-360).
 *
 * Un seul champ, et il en vaut trois : sur le chemin local, la machine n'est plus
 * une frontière. Le dépôt est celui de l'utilisateur (avec son vrai `.env`), la
 * boucle locale est la sienne (avec ses serveurs et sa clé de modèle), et une
 * permission qu'on ne connaît pas ne peut plus être « sans enjeu par défaut ».
 */
export interface PermissionScope {
  /** Le tour joue-t-il sur la machine de l'utilisateur (`isLocalJob`) ? */
  local?: boolean;
  /**
   * LES PORTS DU HARNESS SUR LA BOUCLE LOCALE (MIN-364, décision D8) — le proxy
   * LLM, le pont de tools, le serveur opencode du tour.
   *
   * Ce sont les SEULS que `webfetch` refuse encore en local. Le refus d'avant
   * portait sur tout l'espace privé, et son dommage collatéral était exactement
   * la capacité qu'on veut : `curl localhost:3000` pour aller voir la page qu'on
   * vient d'écrire rendre. Les deux se distinguent par le port, et le superviseur
   * est le seul à les connaître — d'où le passage par le scope plutôt qu'une
   * constante.
   *
   * Vide = on ne sait pas quels ports protéger, et on refuse alors toute la
   * boucle locale : une ignorance ne s'interprète pas en autorisation.
   */
  harnessPorts?: readonly number[];
}

/**
 * LE VERDICT LITTÉRAL D'UN `webfetch` — la moitié PURE du garde-fou (MIN-360,
 * puis MIN-364 pour le port).
 *
 * L'autre moitié est la RÉSOLUTION du nom, qui demande un résolveur et vit donc
 * dans [local-guard.ts](local-guard.ts). Les deux sont nécessaires : celle-ci
 * refuse `http://127.0.0.1:<port du harness>`, l'autre refuse le domaine public
 * qui pointe dessus.
 */
export function webfetchLiteralVerdict(
  url: string | undefined,
  harnessPorts: readonly number[] = [],
): PermissionVerdict {
  const hostname = fetchHostname(url);
  if (!hostname) {
    return {
      reply: "reject",
      message: "The harness could not read the URL to fetch, so it refused it.",
      reason: PRIVATE_FETCH_REASON,
    };
  }
  if (isPrivateHostname(hostname) && isHarnessPort(url, harnessPorts)) {
    return { reply: "reject", message: privateFetchMessage(hostname), reason: PRIVATE_FETCH_REASON };
  }
  return ALLOW;
}

/**
 * Ce fetch vise-t-il un service du harness ? Sans liste, TOUT compte : c'est la
 * conduite prudente d'une ignorance, et elle rend le comportement d'avant D8.
 */
export function isHarnessPort(url: string | undefined, harnessPorts: readonly number[]): boolean {
  if (harnessPorts.length === 0) return true;
  return harnessPorts.includes(fetchPort(url));
}

/**
 * LE VERDICT DU HARNESS. Ne lève jamais : un garde-fou qui lève sur une forme
 * inattendue arrêterait le tour au lieu de le protéger, et le seul chemin sûr
 * quand on ne comprend pas la demande est de la refuser en le disant.
 */
export function decidePermission(
  ask: PermissionAsk,
  /**
   * LE DÉPÔT DU RUN (`job.layout.repoDir`), et il est passé plutôt que lu depuis
   * une constante (MIN-354).
   *
   * C'est LE paramètre qui rendait ce verdict inutilisable hors microVM :
   * `metadata.filepath` est ABSOLU (mesure n°2), donc comparé à `/vercel/sandbox/repo`
   * sur une machine où le dépôt vit ailleurs, il sortait TOUJOURS — le harness
   * refusait 100 % des écritures, en croyant garder quelque chose.
   */
  repoDir: string,
  subagents?: SubagentContext,
  scope: PermissionScope = {},
): PermissionVerdict {
  switch (ask.permission) {
    case "task":
      return decideTask(ask, subagents);

    case "bash": {
      const command = (ask.command ?? "").trim();
      // Une demande `bash` sans commande n'existe pas dans la mesure. Si elle
      // apparaissait, on ne saurait pas ce qu'on autorise : on refuse.
      if (!command) {
        return {
          reply: "reject",
          message: "The harness could not read the command to run, so it refused it.",
        };
      }
      // Le scope voyage : `git commit` est refusé en microVM (le harness commite)
      // et rendu au modèle sur la machine de quelqu'un (D6, MIN-364).
      const verdict = checkCommand(command, { local: scope.local === true });
      if (verdict.allowed) return ALLOW;
      return { reply: "reject", message: verdict.reason, reason: FORBIDDEN_COMMAND_REASON };
    }

    case "edit": {
      /**
       * TOUS LES CHEMINS DE LA DEMANDE, et pas seulement le premier : une
       * permission d'`apply_patch` en porte N (cf. `PermissionAsk.files`). Un
       * seul chemin refusé refuse la demande entière — il n'y a pas de « oui
       * pour ces trois fichiers, non pour le quatrième » dans le protocole, et
       * c'est le sens prudent.
       */
      const targets = editTargets(ask);
      if (targets.length === 0) {
        return {
          reply: "reject",
          message: "The harness could not read the path to write, so it refused the edit.",
        };
      }
      try {
        for (const { path } of targets) {
          /**
           * ⚠ C'EST CE `case` QUI FAISAIT LA FRONTIÈRE, pas la ligne de config
           * (MIN-364, décision D5).
           *
           * `absoluteInRepo` LÈVE sur tout chemin hors dépôt : `external_directory`
           * pouvait bien passer en `allow`, l'écriture était refusée ici. Le
           * périmètre s'ouvre donc ici, et nulle part ailleurs.
           *
           * Ce qui reste, et qui ne dépend d'aucune décision de périmètre :
           * **`.git/`**. `assertNotGit` refuse un segment `.git` OÙ QU'IL SOIT dans
           * le chemin, dépôt de l'agent ou dépôt voisin — un hook écrit là s'exécute
           * au prochain geste git d'un humain, et un `config` y porte des
           * identifiants. C'est le seul reste de périmètre du §9 de l'audit.
           */
          const abs = scope.local ? absoluteOnDisk(repoDir, path) : absoluteInRepo(repoDir, path);
          assertNotGit(repoDir, abs, path);
        }
        return ALLOW;
      } catch (err) {
        return { reply: "reject", message: (err as Error).message };
      }
    }

    /**
     * SORTIR DU DOSSIER (MIN-364, décision D5) — et ce `case` a changé de nature
     * deux fois, ce qui vaut d'être écrit.
     *
     * Il a été décrit comme « un second rideau » et comme « ce qui tient le modèle
     * à l'écart du reste du disque » : les deux étaient faux. Notre config posait
     * `external_directory: "deny"`, et un `deny` de config **court-circuite avant
     * toute publication** — mesuré, la demande n'arrivait jamais ici
     * ([opencode-permissions.probe.test.ts](opencode-permissions.probe.test.ts)).
     * Et même publiée elle n'aurait rien tenu : vingt des trente commandes
     * mesurées atteignent un dossier extérieur sans jamais publier autre chose
     * que `bash` (mesure n°1 en tête de fichier).
     *
     * **En local, elle est désormais en `ask` et cette branche s'exécute — pour
     * autoriser.** Le mur d'avant n'attrapait que les tools honnêtes et poussait
     * le travail vers `bash`, c'est-à-dire vers l'endroit où l'on ne voit plus
     * rien. Autoriser en LAISSANT UNE TRACE (le superviseur publie un event à
     * chaque sortie de dossier, cf. `supervisor.ts`) est l'exact contraire : le
     * verdict ne bride rien, et le fil garde la liste des excursions.
     *
     * La règle « demander avant d'écrire ailleurs » vit dans le PROMPT, et elle
     * est assumée comme une politesse et non comme un mur (D5, point 1) : un
     * modèle qui ne la lit pas écrit ailleurs sans demander, et rien ne l'arrête.
     * Ce qui ne serait pas assumable, c'est de la décrire ailleurs comme une
     * garantie.
     *
     * Hors chemin local, rien ne bouge : la microVM n'a qu'un dépôt, la config y
     * garde son `deny`, et cette branche n'y est jamais atteinte.
     */
    case "external_directory":
      if (scope.local) return ALLOW;
      return {
        reply: "reject",
        message: `The harness only allows work inside the repository (${repoDir}).`,
      };

    /**
     * LA LECTURE (MIN-360) — une demande qui n'arrivait jamais, parce que notre
     * config disait `read: "allow"`.
     *
     * Ce que cette ligne effaçait, c'est une protection qu'opencode LIVRE : son
     * ruleset par défaut met `*.env` et `*.env.*` en `ask`. Nos règles étant
     * concaténées après et la dernière qui matche gagnant, notre `allow`
     * supprimait la question. Sans conséquence sur un clone jetable ; en mode
     * dépôt courant, c'est le `.env` RÉEL de l'utilisateur, avec ses vraies clés,
     * qui entrait en silence dans le contexte du modèle.
     *
     * ⚠ CE QUE CE REFUS NE FERME PAS, et il vaut mieux l'écrire que le laisser
     * croire : `bash` reste ouvert, et `cat .env` ne passe pas par ici. C'est le
     * « mur de papier » du §2 de l'audit — un périmètre de lecture qui tiendrait
     * vraiment demanderait de garder le SHELL, ce qui n'est pas de ce lot. Ce
     * refus-ci ferme le chemin par lequel un modèle distrait y arrive tout seul.
     */
    case "read": {
      const path = (ask.filepath ?? "").trim();
      if (!path) {
        return {
          reply: "reject",
          message: "The harness could not read the path to open, so it refused the read.",
        };
      }
      if (!isSecretFile(path)) return ALLOW;
      return {
        reply: "reject",
        message:
          `Refused reading ${path} — environment files hold this machine's real credentials, ` +
          `and this session runs on someone's own computer. If you need to know which ` +
          `variables exist, read the \`.env.example\` next to it.`,
        reason: SECRET_FILE_READ_REASON,
      };
    }

    /**
     * LE FETCH (MIN-360, puis MIN-364). Hors chemin local, il est en `allow` dans
     * la config et n'arrive donc pas ici. En local, c'est la boucle locale de
     * l'utilisateur qu'il atteint — voir [private-address.ts](private-address.ts).
     *
     * Le contrôle est en DEUX temps : le littéral ici, la RÉSOLUTION dans
     * [local-guard.ts](local-guard.ts). Sans le second, un domaine public qui
     * pointe sur le port du proxy passerait — et c'est la forme qu'a une attaque.
     *
     * Ce qui a changé avec D8 : le refus porte sur le PORT, plus sur tout
     * l'espace privé. Un agent qui ne peut pas aller voir la page qu'il vient
     * d'écrire n'a plus de boucle de feedback du tout, et c'est précisément celle
     * que l'app de bureau rend possible pour la première fois.
     */
    case "webfetch":
      return scope.local ? webfetchLiteralVerdict(ask.url, scope.harnessPorts ?? []) : ALLOW;

    /**
     * LA LECTURE SANS ENJEU (MIN-364, lot 7). `glob` et `grep` sont en `allow`
     * dans notre config et ne publient donc pas — mais ils sont LUS et décidés,
     * et c'est ce qui les distingue d'un `default` : le jour où une montée de
     * version les met en `ask`, ils passent, sans qu'un tour se casse dessus.
     */
    case "glob":
    case "grep":
      return ALLOW;

    /**
     * LA QUESTION (MIN-364, lot 7) — elle n'est PAS consultée : mesuré, un
     * `ask_user` publie `question.asked` sur le flux et ne passe jamais par une
     * demande de permission. Ce qui retire vraiment `ask_user` d'une routine est
     * le jeu de tools de l'agent (`primaryTools`).
     *
     * On l'autorise quand même, plutôt que de la laisser au `default` : si une
     * version se mettait à la publier, un refus casserait `ask_user` en silence
     * sur 100 % des tours locaux — pour une capacité que la config a déjà
     * tranchée juste au-dessus.
     */
    case "question":
      return ALLOW;

    /**
     * LA BOUCLE (MIN-364, lot 7). `doom_loop` est publié quand le modèle rejoue
     * exactement le même appel de tool avec exactement la même entrée, plusieurs
     * fois d'affilée (relevé dans le binaire 1.18.16) : la question posée est
     * « on continue malgré les échecs répétés ? ».
     *
     * On répond NON, et c'est une décision, pas une ignorance : personne n'est
     * devant l'écran pour arbitrer, et laisser tourner une boucle coûte de
     * l'argent par round pour produire la même chose. Le message, lui, doit dire
     * ce qui se passe — un refus qui ressemblait à « permission inconnue » ne
     * disait rien de la boucle, donc n'aidait pas à en sortir.
     */
    case "doom_loop":
      return {
        reply: "reject",
        message:
          `You have called the same tool with the same input several times in a row, and it keeps ` +
          `failing. Calling it again will not change the answer: read the error, then either fix ` +
          `what it points at or take another route. If nothing works, say so in your reply — ` +
          `looping costs a round each time and produces the same thing.`,
        reason: DOOM_LOOP_REASON,
      };

    /**
     * CE QUE LA CONFIG A DÉJÀ ÉTEINT (MIN-364, lot 7) — `websearch` et `todowrite`
     * sont en `deny`, `skill` est retiré du jeu de tools, `plan_enter`/`plan_exit`
     * (le mode plan d'opencode) n'ont pas de sens dans un tour ancré à un ticket.
     *
     * Un `deny` de config court-circuite avant publication : ces branches ne
     * s'exécutent pas aujourd'hui. Elles sont écrites pour que le refus soit une
     * DÉCISION relue plutôt qu'un défaut, et pour que le modèle lise un motif
     * plutôt que « le harness ne connaît pas cette permission ».
     */
    case "websearch":
    case "todowrite":
    case "skill":
    case "plan_enter":
    case "plan_exit":
      return {
        reply: "reject",
        message:
          `\`${ask.permission}\` is off in this session — minddy serves its own equivalent ` +
          `(\`web_search\` for the web, \`update_plan\` for the checklist, the ticket's plan for ` +
          `the rest). Use those instead.`,
        reason: DISABLED_PERMISSION_REASON,
      };

    /**
     * LA PERMISSION QU'ON NE CONNAÎT PAS (MIN-360, puis MIN-364 lot 7).
     *
     * `default: return ALLOW` laissait passer en silence tout type non déclaré.
     * C'était tenable dans une microVM jetable ; sur la machine de quelqu'un,
     * autoriser par défaut ce qu'on n'a jamais lu est le contraire d'un garde-fou.
     *
     * ⚠ MAIS LE REFUS PAR DÉFAUT EST UN CLIQUET, et c'est le §5.5 de l'audit du
     * 15/08 : en l'état, chaque montée d'opencode RETIRE de la capacité au lieu
     * d'en ajouter, sans que personne ne le décide. Ce qui manquait n'est pas le
     * refus — c'est le geste qui le lève : `KNOWN_PERMISSIONS` nomme ce qu'on a
     * lu, `REVIEWED_OPENCODE_VERSION` dit quand, et un test tombe à la prochaine
     * montée de version tant que la relecture n'a pas eu lieu.
     *
     * Le refus NOMME la permission : c'est ce qui le rend réparable. La première
     * montée de version qui en ajoute une se voit dans `agent_run_events` plutôt
     * que de s'ouvrir toute seule.
     */
    default:
      if (!scope.local) return ALLOW;
      return {
        reply: "reject",
        message:
          `The harness does not know the permission "${ask.permission}", and this session runs ` +
          `on a real computer — so it refused it rather than allow something it has never ` +
          `checked. Do what you were doing another way.`,
        reason: UNKNOWN_PERMISSION_REASON,
      };
  }
}

/**
 * LA DÉLÉGATION (MIN-286, lot 2, tâche 12) — le seul point où l'on peut encore
 * dire non à un `task`, et le seul d'où le modèle entend autre chose qu'un
 * message d'opencode.
 *
 * Deux refus, et rien d'autre :
 *
 * 1. **Le plafond de simultané** (`maxParallel`, réglé en `app_config`). C'est le
 *    même refus, aux mots près, que celui du registre maison
 *    ([subagent.ts](../subagent.ts)) : le sandbox est PARTAGÉ, et deux filles qui
 *    écrivent en même temps se marchent dessus. Chez opencode le `task` de premier
 *    plan BLOQUE le parent, donc le simultané ne vient que d'un round qui appelle
 *    `task` plusieurs fois — c'est exactement ce qu'on borne ici.
 * 2. **Un sous-agent qui n'existe pas.** Opencode répondrait « Unknown agent type:
 *    X », sans dire ce qui est offert au tour (les agents sont dans la description
 *    du tool, qu'un modèle a pu perdre de vue). On lui rend l'offre, comme
 *    `makeSubagentModelResolver` rendait les favoris.
 *
 * Le reste passe : la config a déjà décidé de ce qui est offert, et un garde-fou
 * qui redit la config est un endroit de plus où les deux peuvent diverger.
 */
function decideTask(ask: PermissionAsk, subagents?: SubagentContext): PermissionVerdict {
  if (!subagents) return ALLOW;

  // Vivantes ET promises : une autorisation déjà donnée compte, sans quoi un round
  // qui appelle `task` en rafale passe entièrement sous le plafond (cf. `pending`).
  const engaged = subagents.running + (subagents.pending ?? 0);
  if (engaged >= subagents.maxParallel) {
    return {
      reply: "reject",
      message:
        `Too many sub-agents running at once (${engaged}/${subagents.maxParallel}). ` +
        `Wait for one to report back before delegating again.`,
      reason: "subagent_limit",
    };
  }

  const requested = (ask.subagentType ?? "").trim();
  if (!subagents.names.has(requested)) {
    return {
      reply: "reject",
      message:
        `Unknown sub-agent type ${JSON.stringify(requested)}. ` +
        `Available for this session: ${[...subagents.names].join(", ")}.`,
      reason: "unknown_subagent",
    };
  }
  return ALLOW;
}

/**
 * Ce qu'une demande d'écriture engage, fichier par fichier. `files` fait foi dès
 * qu'il est là (`apply_patch`, qui porte aussi la NATURE de chaque geste) ;
 * sinon c'est `filepath`, qui est alors un vrai chemin unique (`write`, `edit`)
 * dont on ne sait dire que « modifié » — la liste de git, en fin de tour,
 * tranchera.
 */
export function editTargets(ask: PermissionAsk): NonNullable<PermissionAsk["files"]> {
  const files = (ask.files ?? [])
    .map((f) => ({ ...f, path: f.path.trim() }))
    .filter((f) => f.path);
  if (files.length > 0) return files;
  const single = (ask.filepath ?? "").trim();
  return single ? [{ path: single, status: "modified" }] : [];
}

/**
 * Le chemin absolu d'une écriture, LÈVE s'il sort du dépôt. Un chemin relatif
 * passe par `resolveWithin` (le `..` y est normalisé, la sortie y est refusée) ;
 * un absolu est comparé au dépôt tel quel.
 */
function absoluteInRepo(repoDir: string, filepath: string): string {
  if (!filepath.startsWith("/")) return resolveWithin(repoDir, filepath);
  const resolved = posixPath.normalize(filepath);
  if (resolved !== repoDir && !resolved.startsWith(`${repoDir}/`)) {
    throw new Error(`Path escapes the repository: ${filepath}`);
  }
  return resolved;
}

/**
 * LE MÊME CHEMIN, SANS LA FRONTIÈRE (MIN-364, décision D5) — sur la machine de
 * l'utilisateur, où le disque entier est à portée.
 *
 * Ne LÈVE plus sur la sortie de dépôt ; elle normalise, et c'est tout. Ce qui
 * garde encore quelque chose est `assertNotGit`, appelé juste après par
 * l'appelant : un segment `.git`, où qu'il soit sur le disque, reste refusé.
 *
 * Un chemin relatif reste relatif au DÉPÔT, `..` compris : c'est le cwd du
 * modèle, et un `../autre-projet/x.ts` désigne bien le dossier voisin.
 */
function absoluteOnDisk(repoDir: string, filepath: string): string {
  return posixPath.normalize(filepath.startsWith("/") ? filepath : `${repoDir}/${filepath}`);
}
