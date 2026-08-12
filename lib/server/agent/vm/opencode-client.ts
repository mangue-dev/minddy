import type { OpencodeEvent } from "./opencode-events";

/**
 * LE CLIENT DU SERVEUR OPENCODE (MIN-286, lot 1) — l'unique endroit du dépôt qui
 * connaisse ses URLs.
 *
 * POURQUOI UN MODULE POUR ÇA, et ce n'est pas de la cérémonie : **le même binaire
 * sert DEUX générations d'API**, `/session/*` (héritée) et `/api/session/*` (v2),
 * et elles n'ont pas les mêmes routes. Une faute d'un segment ne rend pas un 404
 * mais **la page HTML du TUI** — donc un `JSON.parse` qui explose sur `<!doctype`,
 * à trois heures du matin, dans un tour de deux heures. Isoler les deux préfixes
 * ici est ce qui fait que la faute ne se commet qu'une fois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MESURÉ SUR `opencode-ai@1.18.16` (et deux points corrigent le dossier du lot 0)
 *
 * - **`POST /api/session/:id/wait` répond 503** : « Session wait is not available
 *   yet ». La route existe dans l'OpenAPI, le serveur ne l'implémente pas. Le
 *   dossier la donnait comme la moitié v2 du couple prompt/wait — elle ne l'est
 *   pas. On attend donc la fin d'un tour sur **`session.idle` du flux `/event`**,
 *   qu'on consomme de toute façon, et c'est mieux : aucune requête HTTP ne reste
 *   ouverte pendant des heures.
 * - **La réponse à une permission est `POST /session/:id/permissions/:permissionID`**
 *   avec `{response: "once"|"always"|"reject"}` — pas `/permission/:id/reply`.
 * - `POST /session/:id/prompt_async` rend **204** immédiatement.
 * - `POST /session/:id/abort` rend **200 `true`**, même sur une session au repos.
 * - `POST /session` rend la session complète (`id`, `projectID`, `directory`…).
 * - **`?directory=` est obligatoire** sur les routes héritées : sans lui, le
 *   serveur travaille dans son propre cwd, pas dans le dépôt du run.
 */

/** Ce qu'une session opencode rend à sa création. */
export interface OpencodeSession {
  id: string;
  projectID?: string;
  directory?: string;
}

/** Réponse possible à une demande de permission. */
export type PermissionResponse = "once" | "always" | "reject";

export interface OpencodeClientOptions {
  /** `http://127.0.0.1:<port>`, sans slash final. */
  baseUrl: string;
  /** Le dépôt : `?directory=` de toutes les routes héritées. */
  directory: string;
  /** Injecté pour les tests. Défaut : le `fetch` global. */
  fetchImpl?: typeof fetch;
}

export class OpencodeHttpError extends Error {
  constructor(
    readonly status: number,
    readonly route: string,
    body: string,
  ) {
    super(`${route} → ${status}: ${body.slice(0, 300)}`);
    this.name = "OpencodeHttpError";
  }
}

export class OpencodeClient {
  private readonly base: string;
  private readonly directory: string;
  private readonly http: typeof fetch;

  constructor(opts: OpencodeClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.directory = opts.directory;
    this.http = opts.fetchImpl ?? fetch;
  }

  /** Une route HÉRITÉE (`/session/…`), toujours avec `?directory=`. */
  private legacy(path: string): string {
    const sep = path.includes("?") ? "&" : "?";
    return `${this.base}${path}${sep}directory=${encodeURIComponent(this.directory)}`;
  }

  private async json<T>(route: string, init?: RequestInit): Promise<T> {
    const res = await this.http(route, init);
    const text = await res.text();
    if (!res.ok) throw new OpencodeHttpError(res.status, route, text);
    // Une route mal orthographiée rend la page du TUI, pas un 404 : le message
    // doit dire ÇA, et pas « Unexpected token < in JSON ».
    if (text.trimStart().startsWith("<")) {
      throw new OpencodeHttpError(res.status, route, "réponse HTML : la route n'existe pas");
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Le serveur répond-il ? Rend `false` plutôt que de lever. */
  async healthy(): Promise<boolean> {
    try {
      const body = await this.json<{ healthy?: boolean }>(`${this.base}/global/health`);
      return body.healthy === true;
    } catch {
      return false;
    }
  }

  /**
   * Attend que le serveur soit prêt. Mesuré au lot 0 : ~1,3 s à froid dans la
   * microVM. Le plafond est large devant ça — ce qu'il borne n'est pas la
   * lenteur, c'est le serveur qui ne démarrera jamais.
   */
  async waitHealthy(timeoutMs: number, sleep = defaultSleep): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.healthy()) return true;
      await sleep(200);
    }
    return false;
  }

  async createSession(title?: string): Promise<OpencodeSession> {
    return await this.json<OpencodeSession>(this.legacy("/session"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(title ? { title } : {}),
    });
  }

  /**
   * Poste un tour et rend la main TOUT DE SUITE (204). La fin du tour se lit sur
   * `session.idle` du flux d'events — `/api/session/:id/wait` répond 503 sur
   * cette version, et une requête bloquante de deux heures serait de toute façon
   * une mauvaise idée.
   */
  async promptAsync(sessionId: string, text: string): Promise<void> {
    const route = this.legacy(`/session/${sessionId}/prompt_async`);
    const res = await this.http(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text }] }),
    });
    if (!res.ok) throw new OpencodeHttpError(res.status, route, await res.text());
  }

  /** Coupe le tour en vol. Mesuré à 40 ms, et sans effet si rien ne tourne. */
  async abort(sessionId: string): Promise<void> {
    const route = this.legacy(`/session/${sessionId}/abort`);
    await this.http(route, { method: "POST" }).catch(() => undefined);
  }

  /** Répond à une demande de permission (le garde-fou du superviseur). */
  async replyPermission(
    sessionId: string,
    permissionId: string,
    response: PermissionResponse,
  ): Promise<void> {
    const route = this.legacy(`/session/${sessionId}/permissions/${permissionId}`);
    const res = await this.http(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response }),
    });
    if (!res.ok) throw new OpencodeHttpError(res.status, route, await res.text());
  }

  /**
   * L'historique en ÉVÉNEMENTS, pour la reprise sur une autre microVM (sonde du
   * lot 0). Incrémental : `{aggregateID: dernier_seq}` ne rend que la suite.
   *
   * PIÈGE, et il est dans le schéma, pas dans notre code : l'export rend du
   * **snake_case** (`aggregate_id`) et le replay attend du **camelCase**
   * (`aggregateID`). D'où `normalizeSyncEvents`.
   */
  async syncHistory(since: Record<string, number> = {}): Promise<Record<string, unknown>[]> {
    const body = await this.json<{ events?: Record<string, unknown>[] } | Record<string, unknown>[]>(
      this.legacy("/sync/history"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(since),
      },
    );
    const events = Array.isArray(body) ? body : (body.events ?? []);
    // NORMALISÉ DÈS LA LECTURE, et c'est ce qui a mordu : le curseur d'export se
    // dérive d'`aggregateID`, que cette réponse-ci n'a pas. Laisser le snake_case
    // circuler donnait un curseur VIDE — donc un export complet à chaque tour,
    // qui grossit jusqu'à ne plus passer, sans qu'aucun test ne tombe.
    return normalizeSyncEvents(events as Record<string, unknown>[]);
  }

  async syncReplay(events: Record<string, unknown>[]): Promise<void> {
    if (events.length === 0) return;
    await this.json(this.legacy("/sync/replay"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory: this.directory, events: normalizeSyncEvents(events) }),
    });
  }

  /**
   * Le flux `/event`, en itérateur asynchrone. Chaque `data:` est un événement.
   *
   * Ce qui n'est PAS ici : la traduction. Elle vit dans un module pur
   * ([opencode-events.ts](opencode-events.ts)) qu'on teste sur des fixtures
   * capturées — un flux réseau ne se rejoue pas dans un test unitaire.
   */
  async *events(signal?: AbortSignal): AsyncGenerator<OpencodeEvent> {
    const res = await this.http(this.legacy("/event"), { signal });
    if (!res.ok || !res.body) {
      throw new OpencodeHttpError(res.status, "/event", "flux d'events indisponible");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      // Les frames SSE sont séparées par une ligne vide ; une frame peut tenir
      // sur plusieurs lignes `data:`, mais opencode n'en émet qu'une par frame.
      let index = buffer.indexOf("\n\n");
      while (index !== -1) {
        const frame = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const parsed = parseFrame(frame);
        if (parsed) yield parsed;
        index = buffer.indexOf("\n\n");
      }
    }
  }
}

/** Une frame SSE → un événement, ou `null` (commentaire, ping, JSON illisible). */
export function parseFrame(frame: string): OpencodeEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as OpencodeEvent;
    return typeof parsed?.type === "string" ? parsed : null;
  } catch {
    // Un flux tiers qui envoie une frame illisible ne doit pas tuer le tour.
    return null;
  }
}

/**
 * `aggregate_id` → `aggregateID`. Le piège du §2.2 du dossier, et il est dans le
 * SCHÉMA d'opencode : l'export rend du snake_case, le replay attend du camelCase.
 * Sans ça, la reprise d'une session sur une autre microVM échoue en validation.
 */
export function normalizeSyncEvents(
  events: Record<string, unknown>[],
): Record<string, unknown>[] {
  return events.map((event) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(event)) {
      out[key === "aggregate_id" ? "aggregateID" : key] = value;
    }
    return out;
  });
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
