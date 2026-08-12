import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { ControlPlaneClient } from "./control-plane-client";
import { DOMAIN_TOOL_NAMES } from "./opencode-tools";
import type { OpencodeDelivery } from "./opencode-delivery";
import type { VmJob } from "./protocol";

/**
 * LE PONT DE TOOLS (MIN-286, lot 2) — le serveur local que les 32 tools de
 * domaine générés appellent, et qui tient ce qu'un tool sans mémoire ne peut pas
 * tenir : **les compteurs du TOUR**.
 *
 * Le chemin complet d'un appel : le modèle appelle `web_search` → opencode
 * exécute le `.opencode/tool/web_search.ts` généré → celui-ci poste sur
 * `MDY_SUPERVISOR_URL/tool/web_search` → **ici** → `cp.callTool` → le plan de
 * contrôle, avec l'identité que lui donne l'OIDC du firewall. Aucun secret
 * n'entre dans la VM, et le code généré ne contient aucune logique : il poste et
 * il rend ([opencode-tools.ts](opencode-tools.ts)).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SAUT LOCAL EXISTE, alors que le tool pourrait appeler le plan de
 * contrôle directement
 *
 * Parce que **le plan de contrôle ne compte rien** : il facture ce qu'on lui
 * demande, run par run, et il n'a aucune idée de ce qu'est un tour. Or trois
 * garanties du produit sont des états de TOUR :
 *
 * 1. **Le plafond de recherches web** (`webSearchMax`, 5 — `MAX_WEB_SEARCHES_PER_TURN`
 *    de [web-search.ts](../../web-search.ts)), partagé par la mère et ses filles.
 *    Chaque recherche coûte le forfait Exa (`WEB_SEARCH_USD_PER_CALL`, 0,005 $),
 *    et un modèle qui cherche en rond dépense sans borne si personne ne compte.
 *    C'est aussi ce compteur qui sert de `seq` : deux recherches d'un même tour
 *    écrivent alors deux lignes de ledger distinctes, là où un `seq` absent les
 *    rangeait toutes sous le même numéro.
 * 2. **Les ancres de relecture déjà posées** (`prInlineComments`) : le plafond
 *    des 5 se compte sur la vie du RUN, la fonction rend le compte à jour à
 *    chaque appel, et il faut le lui renvoyer au suivant.
 * 3. **Les images** (`imageInput`) : le plan de contrôle ne sert une maquette que
 *    si le modèle du tour sait la lire.
 *
 * C'est exactement ce que `runVmTurn` tenait dans ses fermetures
 * ([turn.ts](turn.ts)) ; le pont est ce qui reste de ces fermetures quand la
 * boucle qui les portait n'est plus notre code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES DE RÉPONSE, et elles ne sont pas cosmétiques
 *
 * - **Un échec de tool répond 200**, avec `{"error": …}` pour corps. Le modèle
 *   doit LIRE l'erreur et décider (réessayer, faire autrement) — c'est ce que
 *   faisait `execTool` côté boucle maison. Un 5xx ferait rendre au tool généré une
 *   phrase de transport (« could not reach the harness ») qui masquerait le vrai
 *   motif, et une exception couperait le round : la manière la plus chère de dire
 *   « réessaie ».
 * - **Un nom inconnu répond 404.** Celui-là n'est pas une erreur du modèle mais
 *   de nous : un tool servi et non routé. Il doit se voir, pas se rattraper.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET LA VOIX DU HARNESS (MIN-286, lot 2, tâche 14)
 *
 * Deux tools portent une règle de livraison : `write_issue_plan` (le plan relu
 * et sa clôture) et `create_pr` (type-check, tests, diff). Les deux la rendent
 * en `followUp` — ce que la boucle maison servait en message `user` après le
 * round, faute de pouvoir grossir un résultat de tool qu'elle élidait par le
 * milieu. **Chez opencode, un résultat de tool EST le texte que le tool rend**,
 * et rien ne l'élide en dessous des plafonds de `tool_output` (2 000 lignes /
 * 50 Ko ; le plus gros bloc, le diff, est capé à 12 Ko). Le pont colle donc le
 * `followUp` APRÈS le résultat, dans le même texte : le modèle lit les deux d'un
 * geste, sans qu'aucun message ne s'ajoute à la conversation.
 */

/** Le corps qu'un tool généré poste. `args` est ce que le modèle a rempli. */
interface ToolCallBody {
  args?: Record<string, unknown>;
  callID?: string;
  sessionID?: string;
}

/**
 * Ce que le superviseur garde du pont. `webSearchesUsed` est lu par les tests et
 * par le rapport de fin de tour : un plafond qu'on ne peut pas relire est un
 * plafond qu'on ne peut pas prouver.
 */
export interface ToolBridge {
  /** `http://127.0.0.1:<port>` — la valeur de `MDY_SUPERVISOR_URL`. */
  readonly url: string;
  readonly webSearchesUsed: number;
  /** Ancres de relecture posées par ce run, à jour du dernier appel. */
  readonly prInlineComments: number;
  close(): Promise<void>;
}

/**
 * Un tool que le SUPERVISEUR exécute lui-même, parce qu'il a quelque chose que
 * ni le plan de contrôle ni opencode n'ont — le dépôt, pour `create_pr` (la VM
 * pousse, la fonction ouvre).
 */
export type SupervisorTool = (
  args: Record<string, unknown>,
) => Promise<{ result: unknown; success: boolean; followUp?: string }>;

export interface ToolBridgeOptions {
  job: VmJob;
  cp: ControlPlaneClient;
  /**
   * Les règles de livraison ([opencode-delivery.ts](opencode-delivery.ts)).
   * Absentes, le pont est un passe-plat nu — c'est ce que veulent les tests qui
   * n'ont rien à dire du plan ni de la porte, et jamais un tour de production.
   */
  delivery?: OpencodeDelivery;
  /**
   * Les tools que le superviseur exécute au lieu de les faire suivre :
   *
   *  - `create_pr`, parce qu'il POUSSE avant de faire ouvrir ;
   *  - `run_background`, qui ne sort jamais de la microVM (tool LOCAL, §3.2) : le
   *    registre de jobs vit dans le superviseur, qui les tue avant chaque
   *    `git add -A` et à la fin du tour.
   *
   * Absent, le tool est REFUSÉ plutôt que passé tel quel — un `create_pr` qui
   * atteindrait la forge sans que la VM ait poussé ouvrirait une pull request sur
   * une branche vide. C'est le cas d'une session de relecture, qui ne pousse
   * jamais et ne lance rien en fond.
   */
  supervisorTools?: Record<string, SupervisorTool>;
  /** 0 = port libre choisi par l'OS. Le superviseur lit l'URL rendue. */
  port?: number;
}

/**
 * Les tools que le pont ne fait PAS suivre au plan de contrôle sans plus. Tout ce
 * qui n'est pas là-dedans est un passe-plat, et c'est le cas le plus fréquent :
 * lire un ticket ou écrire une page n'a besoin d'aucun état de tour.
 */
const SUPERVISOR_ONLY = new Set(["create_pr", "run_background"]);

/** Démarre le pont. Le superviseur l'ouvre AVANT le serveur opencode. */
export async function startToolBridge(opts: ToolBridgeOptions): Promise<ToolBridge> {
  const { job, cp } = opts;

  /**
   * Recherches web déjà payées par ce TOUR, mère et filles confondues — le même
   * compteur partagé que la boucle maison tenait (MIN-171), au même endroit
   * logique : le seul point par lequel toutes les recherches passent.
   */
  let webSearchesUsed = 0;
  let prInlineComments = job.prInlineComments;

  /**
   * LE PLAFOND DE RECHERCHES, et le refus qu'il rend.
   *
   * Le refus est une réponse de tool ORDINAIRE (`success: false`), pas une
   * erreur de transport : le modèle le lit, comprend qu'il a épuisé son quota de
   * recherche et travaille avec ce qu'il a. La phrase est celle de `turn.ts`, au
   * mot près — le critère de bascule du lot 3 est que le fil raconte la même
   * chose des deux côtés, et le texte d'un `tool_result` en fait partie.
   */
  async function runWebSearch(
    args: Record<string, unknown>,
  ): Promise<{ result: unknown; success: boolean }> {
    if (!job.webSearch) {
      // Le tool n'est pas généré dans ce cas (`agentToolsFor` le retire hors
      // OpenRouter) : y arriver quand même veut dire qu'un tour précédent a
      // laissé son fichier derrière lui. On refuse, on ne paie pas.
      return { result: { error: "Web search is not available on this run." }, success: false };
    }
    if (webSearchesUsed >= job.webSearchMax) {
      return {
        result: {
          error: `Web search limit reached for this turn (${job.webSearchMax} searches). Work with what you already found.`,
        },
        success: false,
      };
    }
    const seq = webSearchesUsed++;
    const res = await cp.callTool("web_search", { args: { query: args.query, seq } });
    return { result: res.result, success: res.success };
  }

  /** Le passe-plat : les états de tour partent avec, et reviennent à jour. */
  async function forwardRaw(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ result: unknown; success: boolean }> {
    const res = await cp.callTool(name, { args, imageInput: job.imageInput, prInlineComments });
    // Le compteur d'ancres fait l'aller-retour : c'est la fonction qui l'oppose
    // au plafond des 5 et qui rend celui qu'elle a atteint (`runPrTool`).
    if (typeof res.inlineUsed === "number") prInlineComments = res.inlineUsed;
    /**
     * LES IMAGES de `read_resource` ne traversent PAS encore ce pont : le
     * résultat d'un tool opencode est du texte, et une maquette rendue au modèle
     * demande une pièce jointe de message. À traiter à part (lot 2) ; d'ici là
     * une lecture de maquette rend sa fiche signalétique, ce qu'elle rendait
     * déjà sur un run dont le modèle ne voit pas les images.
     */
    return { result: res.result, success: res.success };
  }

  /**
   * Le passe-plat SOUS les règles de livraison : `write_issue_plan` y note le
   * plan écrit et repart avec sa relecture en `followUp`. Enveloppé une fois, au
   * démarrage — l'envelopper par appel referait un sink de plan neuf à chaque
   * fois, donc un contrôle qui ne parle jamais.
   */
  const forward = opts.delivery ? opts.delivery.wrapDomainTool(forwardRaw) : forwardRaw;

  /**
   * `create_pr`, sous sa porte : le premier appel d'un tour qui a édité rend les
   * contrôles au lieu de pousser. La porte n'est posée que s'il y a un handler —
   * sans lui le tool est REFUSÉ, et rendre des contrôles pour refuser juste après
   * dirait au modèle qu'il a livré alors qu'il n'a rien fait.
   */
  const supervisorTools: Record<string, SupervisorTool> = { ...opts.supervisorTools };
  if (opts.delivery && supervisorTools.create_pr) {
    supervisorTools.create_pr = opts.delivery.wrapCreatePr(supervisorTools.create_pr);
  }

  async function dispatch(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ result: unknown; success: boolean; followUp?: string } | null> {
    const own = supervisorTools[name];
    if (own) return await own(args);
    if (SUPERVISOR_ONLY.has(name)) {
      return {
        result: { error: `${name} is not available on this turn.` },
        success: false,
      };
    }
    if (name === "web_search") return await runWebSearch(args);
    if (!DOMAIN_TOOL_NAMES.has(name)) return null;
    return await forward(name, args);
  }

  const server = createServer((req, res) => {
    void handle(req, res).catch((err) => {
      // Une panne du pont lui-même (corps illisible, socket coupée) : elle se dit
      // au modèle comme une erreur de tool, jamais en faisant tomber le process
      // qui tient tout le tour.
      if (!res.headersSent) res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `minddy tool bridge: ${(err as Error).message}` }));
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "/").split("?")[0];
    const name = path.startsWith("/tool/") ? decodeURIComponent(path.slice("/tool/".length)) : "";
    if (req.method !== "POST" || !name) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const raw = await readBody(req);
    let body: ToolCallBody = {};
    try {
      body = raw.length ? (JSON.parse(raw.toString("utf8")) as ToolCallBody) : {};
    } catch {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "minddy tool bridge: malformed request body" }));
      return;
    }

    let outcome: { result: unknown; success: boolean; followUp?: string } | null;
    try {
      outcome = await dispatch(name, body.args ?? {});
    } catch (err) {
      // Le plan de contrôle a lâché (409, panne, timeout). Le modèle doit le
      // lire : un tool en erreur se retente, un round coupé se repaie.
      outcome = { result: { error: `${name} failed: ${(err as Error).message}` }, success: false };
    }
    if (!outcome) {
      // Un tool servi au modèle et routé nulle part : c'est notre défaut, et il
      // doit se voir dans les logs de la VM autant que dans la conversation.
      console.error(`[tool-bridge] unrouted tool: ${name}`);
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `unknown minddy tool: ${name}` }));
      return;
    }

    // `JSON.stringify` du résultat, tel quel : c'est ce que la boucle maison
    // donnait au modèle, et une deuxième mise en forme serait une deuxième chose
    // à garder en phase pendant la bascule. La voix du harness, elle, vient
    // APRÈS, en texte : le modèle lit un résultat puis ce qu'on a à lui en dire.
    const rendered = JSON.stringify(
      outcome.result ?? (outcome.success ? {} : { error: "no result" }),
    );
    res.writeHead(200, {
      "content-type": outcome.followUp ? "text/plain; charset=utf-8" : "application/json",
    });
    res.end(outcome.followUp ? `${rendered}\n\n${outcome.followUp}` : rendered);
  }

  const port = await listen(server, opts.port ?? 0);

  return {
    url: `http://127.0.0.1:${port}`,
    get webSearchesUsed() {
      return webSearchesUsed;
    },
    get prInlineComments() {
      return prInlineComments;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    });
  });
}
