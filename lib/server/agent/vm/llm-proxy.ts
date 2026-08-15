import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { chatCompletionsUrl, getAgentProvider, type AgentProviderId } from "@/lib/agent-providers";
import {
  REASONING_REQUEST_KEYS,
  reasoningRequestFields,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";
import {
  OPENROUTER_USAGE_INCLUDE,
  parseOpenRouterUsage,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage-shape";
import type { NormalizedUsage } from "@/lib/server/ai-usage";
import type { RedactText } from "../redact";

/**
 * LE PROXY LOCAL DU SUPERVISEUR (MIN-286, lot 2) — les quarante lignes qui
 * rendent au ledger ce qu'opencode ne dit pas.
 *
 * Opencode parle au fournisseur par une `baseURL` ; on la fait pointer sur
 * `127.0.0.1` **dans la microVM**, et ce serveur-ci relaie vers la vraie. Le
 * trafic sort donc toujours de la VM avec le PLACEHOLDER, le firewall pose la
 * clé après la sortie comme aujourd'hui, `network-policy.ts` ne change pas d'une
 * ligne et aucun secret n'entre dans le process où le modèle exécute du shell.
 *
 * ET SUR LA MACHINE DE L'UTILISATEUR, C'EST CE PROCESS QUI POSE LA CLÉ (MIN-357).
 * Il n'y a pas de firewall sur un Mac : la clé descend jusqu'ici — et pas plus
 * bas — demandée au plan de contrôle au démarrage du tour, gardée en mémoire, et
 * posée sur la seule route servie (cf. `LlmProxyOptions.apiKey` et
 * `resolveProxyTarget`). C'est ce qui fait de la garde de chemin, ci-dessous, une
 * pièce de sécurité et plus une commodité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS CHOSES QUI NE SE FONT QUE LÀ, et c'est pour elles qu'il existe
 *
 * 1. **Le `generation_id`.** Un message assistant d'opencode porte
 *    `id, sessionID, role, time, parentID, modelID, providerID, mode, agent,
 *    path, cost, tokens, finish` — et c'est tout (dossier §2.6). L'identifiant de
 *    génération du fournisseur, celui par lequel on réconcilie une facture et par
 *    lequel un support client remonte un appel, n'existe nulle part. Il est dans
 *    la RÉPONSE, que ce proxy voit passer.
 * 2. **Le coût RÉELLEMENT facturé.** `usage: {include: true}` demande à OpenRouter
 *    le coût de la génération dans la dernière frame du flux. Opencode, lui,
 *    CALCULE le sien (nos prix × tokens depuis le lot 1). La sonde du lot 0 a
 *    mesuré un écart nul sur cinq générations — mais l'écart nul d'un jour n'est
 *    pas une garantie, et c'est le chiffre du fournisseur qui fait foi le jour où
 *    ils divergent. C'est aussi ce qui rend le ledger IDENTIQUE entre les deux
 *    moteurs, ce qui est le critère de bascule du lot 3.
 * 3. **Le niveau de raisonnement des couches compat.** Mesuré au lot 1 :
 *    `reasoning_effort` à plat est RETIRÉ du corps par opencode ; seule la forme
 *    imbriquée (OpenRouter) survit. Un BYOK openai / anthropic / google perdrait
 *    donc son raisonnement en silence — le round part, il coûte, il pense moins.
 *    Le champ est réinjecté ici, dans la forme que le registre déclare
 *    ([agent-providers.ts](../../../agent-providers.ts), `reasoningField`) — et
 *    dans CELLE-LÀ SEULEMENT : un corps qui porte les deux formes à la fois part
 *    en 400 chez OpenRouter (« both provided with conflicting values »), donc
 *    l'autre est retirée du corps avant le relais.
 *
 * CE QU'IL NE FAIT PAS : décider. Il observe et il complète le corps ; le ledger,
 * les plafonds et l'appariement restent au superviseur.
 */

/** Ce qu'une génération a laissé voir en passant. */
export interface CapturedGeneration {
  /** L'`id` du fournisseur — `gen-…` chez OpenRouter. */
  id: string | null;
  /** Le modèle tel que le fournisseur le renvoie (il peut préciser une variante). */
  model: string;
  /** Tokens de sortie, quand le fournisseur les compte. */
  outputTokens: number | null;
  /** Le coût FACTURÉ, quand le fournisseur le rend (`usage: {include: true}`). */
  costUsd: number | null;
  /**
   * L'usage COMPLET du fournisseur, gardé pour les rounds dont opencode ne dira
   * jamais rien (`drain`). Sur un round ordinaire il ne sert pas : les tokens
   * viennent du message assistant, qui les tient déjà.
   */
  usage: NormalizedUsage | null;
}

/** Ce que le superviseur tient du proxy. */
export interface LlmProxy {
  /** `http://127.0.0.1:<port>` — la `baseURL` à donner à opencode. */
  readonly url: string;
  /**
   * La génération de CE round, retirée de la file.
   *
   * L'appariement se fait par modèle, puis par tokens de sortie quand ils
   * concordent, sinon dans l'ordre d'arrivée. Il est donc EXACT en séquentiel, et
   * seulement probable quand deux filles tournent en parallèle SUR LE MÊME
   * MODÈLE — auquel cas deux `generation_id` d'un même run et d'un même modèle
   * peuvent s'échanger. Ce qui se joue là est une référence de réconciliation, pas
   * une dépense : les tokens et le coût viennent du round, pas de l'appariement.
   */
  take(round: { model: string; outputTokens: number }): CapturedGeneration | null;
  /**
   * LES GÉNÉRATIONS QUE PLUS AUCUN ROUND NE VIENDRA PRENDRE, retirées de la file.
   *
   * C'est ce qu'un round COUPÉ EN VOL laisse derrière lui, et c'est le seul
   * endroit du harness où sa dépense existe encore. Mesuré le 2026-08-12
   * (dossier §2.23) : opencode ne facture RIEN d'un round avorté — `finish: null`,
   * `cost: 0`, `tokens: 0`, `error: MessageAbortedError` — alors que 179 caractères
   * étaient déjà écrits et que le fournisseur, lui, a bel et bien facturé
   * 0,002827 $. Sans ce drain, un « Stop », un plafond ou une deadline sortiraient
   * la dépense du ledger, du quota et de la facture, sur un geste déclenchable à
   * volonté — le défaut exact que MIN-216 avait fermé côté boucle maison.
   *
   * Ce que ce proxy a de plus que tout le reste : **il ne coupe pas l'amont quand
   * le client s'en va**. Le `fetch` vers le fournisseur n'a pas de signal, la
   * boucle de lecture continue jusqu'au bout du flux (mesuré : 1 221 ms après le
   * départ du client, sans une erreur de socket), et la dernière frame — celle qui
   * porte `usage` et son coût — arrive donc quand même. La ligne écrite n'est pas
   * une estimation : c'est le chiffre du fournisseur.
   */
  drain(): CapturedGeneration[];
  /**
   * Attend que les relais ENCORE EN VOL se terminent, au plus `timeoutMs`.
   *
   * À appeler avant `drain`, et c'est une question de course, pas de prudence :
   * quand le client coupe, l'amont continue — mesuré à **1 221 ms** de plus
   * jusqu'à sa dernière frame. Drainer tout de suite après un `abort` ne
   * trouverait donc rien, et la dépense repartirait par le trou qu'on vient de
   * boucher. Le plafond, lui, existe pour le cas inverse : un fournisseur qui ne
   * fermerait jamais son flux ne doit pas retenir la fin du tour.
   */
  settle(timeoutMs: number): Promise<void>;
  close(): Promise<void>;
}

export interface LlmProxyJob {
  /** La vraie base URL du fournisseur (sans `/chat/completions`). */
  baseUrl: string;
  provider: AgentProviderId;
  reasoningLevel: ReasoningLevel;
}

export interface LlmProxyOptions {
  job: LlmProxyJob;
  /** 0 = un port libre choisi par l'OS (le défaut, et ce que font les tests). */
  port?: number;
  /** Injecté pour les tests : le fournisseur, sans réseau. */
  fetchImpl?: typeof fetch;
  /**
   * LA CLÉ DU MODÈLE, QUAND C'EST À NOUS DE LA POSER (MIN-357) — présente
   * SEULEMENT quand le tour joue sur la machine de l'utilisateur.
   *
   * En microVM, ce champ est absent et rien ne change : la boucle envoie le
   * placeholder, le firewall pose la vraie clé après la sortie de la VM, et ce
   * process ne détient rien. Sur un Mac il n'y a pas de firewall, donc la clé
   * doit bien exister quelque part — et « quelque part », c'est ICI, dans la
   * mémoire du proxy, pas dans `job.json` ni dans `OPENCODE_CONFIG_CONTENT`
   * (qui entre dans l'environnement du serveur opencode, donc lisible par un
   * simple `env` du shell du modèle).
   *
   * DEMANDÉE UNE FOIS, AU DÉMARRAGE, et gardée en closure. Le plan de contrôle
   * ne rend qu'une clé MINTÉE À PLAFOND DUR (`/llm-key`, control-plane.ts) : ce
   * qui borne le dégât n'est pas la cachette — le modèle peut appeler ce proxy
   * depuis son propre shell, il écoute sur `127.0.0.1` — c'est le plafond que
   * le fournisseur tient. D'où le refus de démarrer sans clé, plus bas : un tour
   * local sans plafond n'est pas un tour dégradé, c'est un tour qui ne doit pas
   * avoir lieu.
   */
  apiKey?: () => Promise<string | null>;
  /**
   * LA SUBSTITUTION DES SECRETS, AVANT LE MODÈLE (MIN-328) — et c'est ICI qu'elle
   * doit vivre sous ce moteur.
   *
   * L'invariant de MIN-239 (« le modèle ne voit plus le token du tout ») tenait
   * parce que la boucle maison fabriquait elle-même chaque message `role:"tool"`
   * et le substituait au passage. Opencode, lui, exécute ses tools DANS la
   * microVM et construit le corps de la requête sans repasser par nous : un
   * `bash("cat .git/config")` remontait donc au modèle intact, qui pouvait
   * ensuite le recopier dans un fichier, un commit ou sa réponse.
   *
   * Ce proxy est le SEUL point de passage obligé entre opencode et le
   * fournisseur : la substitution posée sur le corps sortant vaut pour toutes les
   * sorties de tools, présentes et à venir, sans rien savoir d'elles. Elle porte
   * sur le JSON sérialisé — un token de forge est alphanumérique, il ne subit
   * aucun échappement JSON et se retrouve tel quel dans la chaîne.
   */
  redact?: RedactText;
}

/**
 * LE CORPS D'UNE REQUÊTE, COMPLÉTÉ — pur, donc testable sans serveur.
 *
 * On AJOUTE, on ne remplace pas : opencode a construit ce corps (messages, tools,
 * `stream`, et la forme imbriquée du raisonnement quand elle passe), et ce n'est
 * pas notre travail de le refaire. Un champ déjà présent reste tel quel — c'est ce
 * qui fait qu'une version future d'opencode qui se mettrait à envoyer `usage`
 * elle-même ne se retrouve pas avec deux vérités.
 */
export function patchCompletionBody(
  body: Record<string, unknown>,
  job: LlmProxyJob,
): Record<string, unknown> {
  const profile = getAgentProvider(job.provider)?.requestProfile ?? {};
  const out = { ...body };
  if (profile.usageAccounting && out.usage === undefined) out.usage = OPENROUTER_USAGE_INCLUDE;
  if (profile.streamUsage && out.stream_options === undefined) {
    out.stream_options = { include_usage: true };
  }
  // Le raisonnement : uniquement ce qui MANQUE, et dans UNE SEULE forme.
  //
  // Ce qui manque : sur OpenRouter la forme imbriquée est déjà passée par la
  // config d'opencode, et la réécrire ici écraserait un `exclude` que le
  // registre a choisi.
  //
  // Une seule forme : le corps peut porter les DEUX. La nôtre voyage imbriquée
  // dans les `options` du modèle, et opencode pose la sienne à plat sur les
  // modèles de la famille OpenAI — mesuré sur le run c7465b6b (openrouter,
  // `openai/gpt-5.6-luna`, niveau `high`), mort au tout premier appel :
  // « "reasoning_effort" and "reasoning.effort" are both provided with
  // conflicting values ». On ne laisse donc partir que la forme que le registre
  // déclare, et on retire l'autre du corps — y compris quand le niveau est `off`,
  // où un `reasoning_effort` posé par opencode ferait penser (et payer) un run
  // qui avait demandé le contraire.
  //
  // `undefined` (provider générique, dont on ne sait rien) : on ne touche à rien.
  const field = profile.reasoningField;
  if (field) {
    const fields = reasoningRequestFields(job.reasoningLevel, job.provider);
    for (const key of REASONING_REQUEST_KEYS) {
      if (key in fields) {
        if (out[key] === undefined) out[key] = fields[key];
      } else {
        delete out[key];
      }
    }
  }
  return out;
}

/** Les en-têtes que le registre ajoute, et qu'opencode ne connaît pas. */
export function extraHeaders(job: LlmProxyJob): Record<string, string> {
  const profile = getAgentProvider(job.provider)?.requestProfile ?? {};
  const headers: Record<string, string> = {};
  if (profile.attribution) {
    headers["HTTP-Referer"] = "https://minddy.app";
    headers["X-Title"] = "Numo agent (minddy)";
  }
  if (profile.anthropicVersion) headers["anthropic-version"] = "2023-06-01";
  return headers;
}

/** Ce qu'une requête entrante a le droit de devenir : une URL, ou un refus. */
export type ProxyRoute =
  | { ok: true; url: string }
  | { ok: false; status: 400 | 404 | 405; message: string };

/**
 * LE PROXY SERT UNE ROUTE, IL N'EST PAS UN RELAIS GÉNÉRIQUE (MIN-357) — et
 * c'est la ligne qui décide si le verrou de la clé tient ou tombe entièrement.
 *
 * L'ANCIENNE FORME ÉTAIT UN TEST DE SUFFIXE SUR UNE REQUEST-TARGET BRUTE
 * (`path.split("?")[0].endsWith("/chat/completions")`). Mesuré :
 *
 * ```
 * '/../v1/keys#/chat/completions'.endsWith('/chat/completions')  → true
 * new URL('https://openrouter.ai/api/v1' + ce_chemin).pathname   → /api/v1/keys
 * ```
 *
 * `fetch` normalise les `..` et jette le fragment : ce que le test regarde et ce
 * que le relais appelle ne sont PAS le même chemin. Tant que la clé était posée
 * par le firewall après la sortie de la VM, ça ne rendait rien (le placeholder
 * repartait en 401) ; le jour où ce proxy porte la vraie clé, **le modèle
 * s'émet une clé sans plafond depuis son propre shell** et le verrou 2 tombe
 * entièrement. Même faille sur `/api/v1/credits` et `/api/v1/generation`.
 *
 * D'où les quatre gardes, dans cet ordre, et aucune n'est décorative :
 *
 * 1. **400 sur `#`, `..`, `//` et sur tout chemin ne commençant pas par `/`.**
 *    C'est le refus de tout ce qui rend une chaîne et son URL différentes —
 *    fragment jeté, segments normalisés, et le `//` qui change carrément
 *    d'hôte (`new URL('https://a/api' + '//evil.com/x')`). On refuse la FORME
 *    plutôt que d'essayer de deviner ce qu'elle deviendra.
 * 2. **Égalité stricte sur `url.pathname`**, jamais un suffixe ni un préfixe :
 *    c'est le même mot qui met `/api/v1/keys` hors de portée dans la politique
 *    réseau (`path: { exact }`, network-policy.ts), et pour la même raison.
 * 3. **L'origine, comparée aussi.** Redondante avec la garde 1 aujourd'hui ;
 *    gratuite, et c'est elle qui tient si quelqu'un assouplit l'autre.
 * 4. **`POST` exigé.** La route de complétion est un POST ; un GET sur elle est
 *    une sonde, pas un round.
 *
 * CE QUE ÇA REFUSE ET QUI PASSAIT AVANT : tout le reste du fournisseur. C'est
 * tenable parce qu'opencode n'appelle qu'elle — le provider est
 * `@ai-sdk/openai-compatible` et le catalogue de modèles est DÉCLARÉ dans la
 * config (`providerModels`), donc rien ne va chercher `/models` en ligne.
 */
export function resolveProxyTarget(
  method: string | undefined,
  requestTarget: string | undefined,
  baseUrl: string,
): ProxyRoute {
  const completions = chatCompletionsUrl(baseUrl);
  const prefix = completions.replace(/\/chat\/completions$/, "");
  const raw = requestTarget ?? "";

  if (!raw.startsWith("/")) {
    return { ok: false, status: 400, message: "proxy: path must start with '/'" };
  }
  if (raw.includes("#") || raw.includes("..") || raw.includes("//")) {
    return { ok: false, status: 400, message: "proxy: path must not contain '#', '..' or '//'" };
  }

  let url: URL;
  let expected: URL;
  try {
    url = new URL(`${prefix}${raw}`);
    expected = new URL(completions);
  } catch {
    return { ok: false, status: 400, message: "proxy: unreadable path" };
  }
  if (url.origin !== expected.origin || url.pathname !== expected.pathname) {
    return { ok: false, status: 404, message: "proxy: only the completion route is served" };
  }
  if ((method ?? "").toUpperCase() !== "POST") {
    return { ok: false, status: 405, message: "proxy: the completion route is POST only" };
  }
  return { ok: true, url: url.toString() };
}

/**
 * LE LECTEUR DE RÉPONSES — l'`id` et l'`usage`, lus au vol dans un flux SSE.
 *
 * Il ne bufferise pas la réponse : il en lit les lignes `data:` au passage et ne
 * garde que deux nombres et deux chaînes. Un tour peut rendre des mégaoctets de
 * texte ; les retenir pour y chercher un identifiant serait le meilleur moyen de
 * faire tomber une microVM à 4 Go sur un run bavard.
 */
export class GenerationSniffer {
  private buffer = "";
  private current: CapturedGeneration | null = null;
  private readonly done: CapturedGeneration[] = [];

  /** Un morceau de réponse, tel qu'il arrive du fournisseur. */
  push(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index !== -1) {
      this.line(this.buffer.slice(0, index));
      this.buffer = this.buffer.slice(index + 1);
      index = this.buffer.indexOf("\n");
    }
  }

  /** La réponse est finie : ce qui restait devient une génération. */
  end(): void {
    if (this.buffer) {
      this.line(this.buffer);
      this.buffer = "";
    }
    this.flush();
  }

  private line(raw: string): void {
    const line = raw.trim();
    if (!line) return;
    // Une réponse NON streamée est un seul objet JSON : la même lecture marche,
    // parce qu'on ne cherche que des champs de haut niveau.
    const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
    if (!payload || payload === "[DONE]") return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      // Du texte d'erreur, une frame partielle, un commentaire SSE : rien à lire,
      // et surtout rien qui doive interrompre le relais.
      return;
    }
    const gen = (this.current ??= {
      id: null,
      model: "",
      outputTokens: null,
      costUsd: null,
      usage: null,
    });
    if (typeof parsed.id === "string" && parsed.id && !gen.id) gen.id = parsed.id;
    if (typeof parsed.model === "string" && parsed.model && !gen.model) gen.model = parsed.model;
    if (parsed.usage) {
      const usage = parseOpenRouterUsage(parsed.usage as OpenRouterUsage);
      gen.usage = usage;
      if (usage.completionTokens != null) gen.outputTokens = usage.completionTokens;
      if (usage.cost != null) gen.costUsd = usage.cost;
    }
  }

  /**
   * UNE GÉNÉRATION SANS AUCUNE TRACE N'EN EST PAS UNE (MIN-286).
   *
   * `line()` alloue dès la PREMIÈRE ligne JSON lisible, sans exiger d'`id` ni
   * d'`usage` : un corps d'erreur du fournisseur (`{"error":{…}}` sur un 429, une
   * frame d'erreur au milieu d'un 200) fabriquait donc une génération fantôme.
   * Elle ne coûtait pas rien : `takeGeneration` apparie sur le modèle, et un
   * fantôme a le modèle VIDE, donc il matche tout et se fait prendre en premier —
   * le round repartait sans son coût facturé ni son `generation_id`, et la vraie
   * génération restait dans la file jusqu'à `recordOrphans`, qui l'écrivait une
   * SECONDE fois. Un round facturé deux fois, sur une réponse d'erreur.
   */
  private flush(): void {
    const gen = this.current;
    this.current = null;
    if (!gen) return;
    if (gen.id == null && gen.usage == null) return;
    this.done.push(gen);
  }

  /** Ce qui a été vu et pas encore consommé. */
  captured(): CapturedGeneration[] {
    return this.done;
  }
}

/**
 * L'APPARIEMENT round → génération. Pur, et sorti du serveur pour ça : c'est la
 * seule partie qui puisse se tromper, donc la seule qui mérite un test à part.
 */
export function takeGeneration(
  pool: CapturedGeneration[],
  round: { model: string; outputTokens: number },
): CapturedGeneration | null {
  const sameModel = (gen: CapturedGeneration) =>
    !gen.model || !round.model || gen.model === round.model || gen.model.endsWith(round.model);
  const exact = pool.findIndex((gen) => sameModel(gen) && gen.outputTokens === round.outputTokens);
  const index = exact !== -1 ? exact : pool.findIndex(sameModel);
  if (index === -1) return null;
  return pool.splice(index, 1)[0];
}

/** Démarre le proxy. Rend son URL, sa file de générations et son arrêt. */
export async function startLlmProxy(opts: LlmProxyOptions): Promise<LlmProxy> {
  const { job } = opts;
  const http = opts.fetchImpl ?? fetch;
  /**
   * La file COMMUNE, alimentée par un lecteur PAR REQUÊTE. Un lecteur partagé
   * mélangerait deux réponses en vol — et deux filles en parallèle, c'est
   * exactement ce que le tour fait quand le modèle délègue.
   */
  const pool: CapturedGeneration[] = [];
  /** Relais commencés et pas finis — ce que `settle` attend. */
  let inFlight = 0;

  /**
   * LA CLÉ, PRISE AVANT LE PREMIER OCTET DE SERVEUR. Le port n'existe pas encore
   * quand cette ligne s'exécute : il n'y a donc aucune fenêtre pendant laquelle
   * ce proxy écoute sans savoir quoi poser sur `authorization`.
   *
   * L'échec LÈVE, et remonte jusqu'au rapport de fin de tour (`main.ts`) : sans
   * clé plafonnée, un tour local n'a plus aucun garde-fou de dépense — le
   * compute de microVM, dernier filet dans le cloud, vaut structurellement zéro
   * sur la machine de quelqu'un. Mieux vaut un tour qui ne part pas et le dit.
   */
  const apiKey = opts.apiKey ? await requireApiKey(opts.apiKey) : null;

  const server = createServer((req, res) => {
    void relay(req, res).catch((err) => {
      // Le proxy est sur le chemin critique du modèle : une panne ici doit se
      // dire au client HTTP (donc à opencode, qui la retentera), pas faire
      // tomber le process qui tient tout le tour.
      if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `proxy: ${(err as Error).message}` } }));
    });
  });

  async function relay(req: IncomingMessage, res: ServerResponse): Promise<void> {
    inFlight++;
    try {
      await relayOnce(req, res);
    } finally {
      inFlight--;
    }
  }

  async function relayOnce(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const route = resolveProxyTarget(req.method, req.url, job.baseUrl);
    if (!route.ok) {
      // Le corps est LU QUAND MÊME avant de refuser : un client qui a commencé à
      // écrire et à qui on répond sans vider la socket se retrouve avec une
      // connexion à moitié consommée, et opencode retente sur un tuyau cassé.
      await readBody(req).catch(() => {});
      // Un refus ici n'est jamais anodin : c'est soit un opencode qui a changé de
      // route, soit quelqu'un qui essaie de se servir du proxy. Ça se lit dans un
      // log, borné parce que la request-target vient d'en face.
      console.error(`[llm-proxy] refused ${req.method} ${(req.url ?? "").slice(0, 200)}`);
      res.writeHead(route.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: route.message } }));
      return;
    }
    const raw = await readBody(req);

    // Il n'y a plus qu'une route servie : ce qui arrive ici EST une complétion,
    // et les trois gestes qui suivent n'ont plus de condition à porter.
    let body: string | undefined = raw.length > 0 ? raw.toString("utf8") : undefined;
    if (body) {
      try {
        body = JSON.stringify(patchCompletionBody(JSON.parse(body), job));
      } catch {
        // Un corps qu'on ne sait pas lire se relaie TEL QUEL : un round qui part
        // sans notre complément vaut infiniment mieux qu'un round qui ne part pas.
      }
      // APRÈS le complément, et sur le corps ENTIER : les sorties de tools
      // d'opencode entrent dans ce corps sans être jamais passées par nous
      // (MIN-328). Le corps qu'on ne sait pas lire est substitué lui aussi — la
      // substitution est textuelle, elle n'a pas besoin de comprendre la forme.
      if (opts.redact) body = opts.redact(body);
    }

    const headers: Record<string, string> = { ...extraHeaders(job) };
    for (const [key, value] of Object.entries(req.headers)) {
      // `host` désignerait le proxy ; `content-length` ne vaut plus après le
      // complément ; `accept-encoding` ferait revenir un corps compressé qu'on
      // relaierait sans son en-tête (undici décompresse et garde l'en-tête).
      if (["host", "content-length", "connection", "accept-encoding"].includes(key)) continue;
      if (typeof value === "string") headers[key] = value;
    }
    // LA CLÉ ÉCRASE LE PLACEHOLDER, et seulement sur cette route-là (MIN-357).
    // Sans clé — le cas de la microVM — c'est le placeholder d'opencode qui part,
    // et le firewall le remplace après la sortie : la ligne ci-dessous est la
    // SEULE différence entre les deux mondes.
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    const upstream = await http(route.url, {
      method: "POST",
      headers,
      ...(body === undefined ? {} : { body }),
    });

    const out: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      if (["content-encoding", "content-length", "transfer-encoding"].includes(key)) return;
      out[key] = value;
    });
    res.writeHead(upstream.status, out);

    if (!upstream.body) {
      res.end();
      return;
    }
    /**
     * ON NE LIT QUE LES RÉPONSES QUI ONT ABOUTI. Un 4xx/5xx du fournisseur porte
     * un corps JSON (`{"error":{…}}`) que le lecteur prendrait pour le début d'une
     * génération : rien à facturer, mais une entrée de plus dans la file, au
     * modèle vide — donc appariable à n'importe quel round (cf. `flush`).
     */
    const sniff = upstream.status < 400;
    const sniffer = new GenerationSniffer();
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // On ÉCRIT D'ABORD : le flux du modèle ne doit pas attendre notre lecture.
      res.write(value);
      if (sniff) sniffer.push(decoder.decode(value, { stream: true }));
    }
    if (sniff) {
      sniffer.end();
      pool.push(...sniffer.captured());
    }
    res.end();
  }

  const port = await listen(server, opts.port ?? 0);

  return {
    url: `http://127.0.0.1:${port}`,
    take: (round) => takeGeneration(pool, round),
    drain: () => pool.splice(0, pool.length),
    settle: async (timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (inFlight > 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        // Un flux SSE ouvert garderait le serveur en vie : le tour est fini, on
        // ne l'attend pas.
        server.closeAllConnections?.();
      }),
  };
}

/**
 * La clé du tour, ou rien du tout. Le message est ce qu'un utilisateur lira dans
 * son fil quand un tour local n'aura pas pu démarrer : il doit dire la CAUSE,
 * pas « proxy error ».
 */
async function requireApiKey(fetchKey: () => Promise<string | null>): Promise<string> {
  const key = (await fetchKey())?.trim();
  if (!key) throw new Error("llm proxy: no capped model key for this turn");
  return key;
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
