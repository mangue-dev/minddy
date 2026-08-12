import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { chatCompletionsUrl, getAgentProvider, type AgentProviderId } from "@/lib/agent-providers";
import { reasoningRequestFields, type ReasoningLevel } from "@/lib/agent-reasoning";
import {
  OPENROUTER_USAGE_INCLUDE,
  parseOpenRouterUsage,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage-shape";

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
 *    ([agent-providers.ts](../../../agent-providers.ts), `reasoningField`).
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
  // Le raisonnement : uniquement ce qui MANQUE. Sur OpenRouter la forme
  // imbriquée est déjà passée par la config d'opencode, et la réécrire ici
  // écraserait un `exclude` que le registre a choisi.
  for (const [key, value] of Object.entries(
    reasoningRequestFields(job.reasoningLevel, job.provider),
  )) {
    if (out[key] === undefined) out[key] = value;
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
    const gen = (this.current ??= { id: null, model: "", outputTokens: null, costUsd: null });
    if (typeof parsed.id === "string" && parsed.id && !gen.id) gen.id = parsed.id;
    if (typeof parsed.model === "string" && parsed.model && !gen.model) gen.model = parsed.model;
    if (parsed.usage) {
      const usage = parseOpenRouterUsage(parsed.usage as OpenRouterUsage);
      if (usage.completionTokens != null) gen.outputTokens = usage.completionTokens;
      if (usage.cost != null) gen.costUsd = usage.cost;
    }
  }

  private flush(): void {
    if (this.current) {
      this.done.push(this.current);
      this.current = null;
    }
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
  const target = chatCompletionsUrl(job.baseUrl).replace(/\/chat\/completions$/, "");

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
    const path = req.url ?? "/";
    const raw = await readBody(req);
    const isCompletion = path.split("?")[0].endsWith("/chat/completions");

    let body: string | undefined = raw.length > 0 ? raw.toString("utf8") : undefined;
    if (isCompletion && body) {
      try {
        body = JSON.stringify(patchCompletionBody(JSON.parse(body), job));
      } catch {
        // Un corps qu'on ne sait pas lire se relaie TEL QUEL : un round qui part
        // sans notre complément vaut infiniment mieux qu'un round qui ne part pas.
      }
    }

    const headers: Record<string, string> = { ...extraHeaders(job) };
    for (const [key, value] of Object.entries(req.headers)) {
      // `host` désignerait le proxy ; `content-length` ne vaut plus après le
      // complément ; `accept-encoding` ferait revenir un corps compressé qu'on
      // relaierait sans son en-tête (undici décompresse et garde l'en-tête).
      if (["host", "content-length", "connection", "accept-encoding"].includes(key)) continue;
      if (typeof value === "string") headers[key] = value;
    }

    const upstream = await http(`${target}${path}`, {
      method: req.method ?? "GET",
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
    const sniffer = new GenerationSniffer();
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // On ÉCRIT D'ABORD : le flux du modèle ne doit pas attendre notre lecture.
      res.write(value);
      if (isCompletion) sniffer.push(decoder.decode(value, { stream: true }));
    }
    if (isCompletion) {
      sniffer.end();
      pool.push(...sniffer.captured());
    }
    res.end();
  }

  const port = await listen(server, opts.port ?? 0);

  return {
    url: `http://127.0.0.1:${port}`,
    take: (round) => takeGeneration(pool, round),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        // Un flux SSE ouvert garderait le serveur en vie : le tour est fini, on
        // ne l'attend pas.
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
