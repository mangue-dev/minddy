import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { OPENCODE_VERSION } from "./opencode-version";

/**
 * LE DÉCOR PARTAGÉ DES SONDES DE PERMISSION (MIN-362).
 *
 * Ce module n'est chargé par AUCUN chemin de production : il n'existe que pour
 * [opencode-permissions.probe.test.ts](opencode-permissions.probe.test.ts) et
 * [opencode-wait.probe.test.ts](opencode-wait.probe.test.ts), qui mesurent le
 * comportement du vrai binaire `opencode-ai@${OPENCODE_VERSION}` et gardent ces
 * mesures d'un bump à l'autre. Il vit ici, à côté d'elles, parce que le décor
 * EST la moitié difficile de la mesure — et qu'un décor recopié dans deux
 * fichiers dérive.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE FAUX FOURNISSEUR, ET POURQUOI IL NE COÛTE RIEN
 *
 * Ce qu'on mesure n'est pas le modèle : c'est ce qu'opencode fait AUTOUR d'un
 * appel de tool — quelle permission il publie, dans quel ordre, ce qu'un « oui »
 * couvre, ce qu'un `deny` empêche. Un modèle réel rendrait tout ça
 * non-déterministe (il choisit ses outils) et payant. `startProvider` sert donc
 * un `/v1/chat/completions` OpenAI-compatible qui rend EXACTEMENT l'appel de
 * tool qu'on lui a mis dans la file, en SSE, comme le ferait OpenRouter.
 *
 * SA LIMITE, ET ELLE COMPTE : le faux fournisseur a **fini son flux** avant que
 * le tool s'exécute. Il ne peut donc rien dire d'une session dont le modèle
 * attend encore de l'autre côté d'une connexion ouverte — c'est ce que
 * `opencode-wait.probe.test.ts` va chercher avec un vrai fournisseur.
 *
 * ⚠ CHAQUE RÉSULTAT DE TOOL RAPPELLE LE FOURNISSEUR. Une file de trois tours ne
 * demande donc pas trois prompts : un seul prompt les déroule tous les trois.
 * C'est ce qui permet d'enchaîner « demande → réponse → nouvelle demande » dans
 * un tour unique, et ce qui fait qu'une file mal dimensionnée décale tout.
 *
 * ⚠ `realpathSync` SUR LE DOSSIER TEMPORAIRE, et ce n'est pas de la coquetterie :
 * `/var/folders/…` est un lien vers `/private/var/…` sur macOS, opencode résout
 * le chemin de sa session, et un `write` visant la forme non résolue est vu
 * comme HORS du dépôt — la sonde mesure alors `external_directory` en croyant
 * mesurer `edit`. Deux mesures ont été fausses avant qu'on s'en aperçoive.
 */

/** Un appel de tool, tel que le modèle l'émettrait. */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** Un tour scripté : soit des appels de tool, soit du texte qui clôt le round. */
export type ProviderTurn =
  | { tools: ToolCall[]; text?: undefined }
  | { text: string; tools?: undefined };

export interface FakeProvider {
  /** À poser dans `options.baseURL` de la config opencode. */
  url: string;
  /** La file des tours à servir. Vide → le fournisseur clôt le round. */
  queue: ProviderTurn[];
  /** Les corps de requête reçus, dans l'ordre — c'est là que vivent les tools offerts. */
  seen: string[];
  /** Les noms de tools offerts au modèle dans la dernière requête vue. */
  offeredTools(): string[];
  close(): void;
}

/**
 * Un fournisseur OpenAI-compatible qui rend ce qu'on lui dit de rendre.
 *
 * Le port est choisi par le noyau (`listen(0)`) : deux sondes lancées en
 * parallèle ne se disputent rien.
 */
export function startProvider(turns: ProviderTurn[] = []): Promise<FakeProvider> {
  const seen: string[] = [];
  const queue = [...turns];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      seen.push(body);
      if (!req.url?.includes("chat/completions")) {
        res.writeHead(404, { "content-type": "application/json" }).end("{}");
        return;
      }
      const turn = queue.shift() ?? { text: "done" };
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const frame = { id: "probe", object: "chat.completion.chunk", created: 1, model: "probe" };
      const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (turn.tools) {
        send({
          ...frame,
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: null,
                tool_calls: turn.tools.map((tool, i) => ({
                  index: i,
                  id: `call_${i}_${seen.length}`,
                  type: "function",
                  function: { name: tool.name, arguments: JSON.stringify(tool.args) },
                })),
              },
              finish_reason: null,
            },
          ],
        });
        send({ ...frame, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
      } else {
        send({
          ...frame,
          choices: [{ index: 0, delta: { role: "assistant", content: turn.text }, finish_reason: null }],
        });
        send({ ...frame, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      }
      send({ ...frame, choices: [], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } });
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/v1`,
        queue,
        seen,
        offeredTools() {
          const last = seen.at(-1);
          if (!last) return [];
          const parsed = JSON.parse(last) as { tools?: Array<{ function?: { name?: string } }> };
          return (parsed.tools ?? []).map((t) => t.function?.name ?? "?").sort();
        },
        close: () => server.close(),
      });
    });
  });
}

/**
 * Le binaire, installé une fois pour toutes.
 *
 * `MDY_OPENCODE_BIN` court-circuite l'installation : 144 Mo par `npm i`, c'est
 * 40 s qu'on ne veut pas repayer à chaque itération d'écriture d'une sonde.
 */
export function installOpencode(root: string): string {
  const given = process.env.MDY_OPENCODE_BIN;
  if (given) return given;
  const version = process.env.MDY_OPENCODE_VERSION ?? OPENCODE_VERSION;
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"probe","private":true}');
  execFileSync("npm", ["i", "--no-audit", "--no-fund", `opencode-ai@${version}`], {
    cwd: root,
    stdio: "ignore",
  });
  return path.join(root, "node_modules", ".bin", "opencode");
}

/**
 * Les creds vivent dans `.env` ; vitest ne le charge pas tout seul.
 *
 * Seule la sonde d'attente à VRAI fournisseur en a besoin — les mesures de
 * permission ne dépensent aucun modèle.
 */
export function loadEnv(): void {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    if (process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

/** Un dossier de sonde, CHEMIN RÉSOLU (cf. l'avertissement en tête de fichier). */
export function probeRoot(tag: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `mdy-probe-${tag}-`)));
}

/** Un dépôt git minimal, avec un commit — opencode veut une session dans un dépôt. */
export function makeRepo(root: string): string {
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo, { recursive: true });
  const git = (args: string[]) =>
    execFileSync("git", ["-c", "user.email=a@b", "-c", "user.name=probe", ...args], { cwd: repo });
  git(["init", "-q"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "hi\n");
  git(["add", "-A"]);
  git(["commit", "-qm", "init"]);
  return repo;
}

/** La config d'un tour de sonde : notre provider, et ce qu'on veut mesurer autour. */
export function probeConfig(
  providerUrl: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    provider: {
      probe: {
        npm: "@ai-sdk/openai-compatible",
        name: "probe",
        options: { baseURL: providerUrl, apiKey: "placeholder" },
        models: { model: { name: "model", tool_call: true } },
      },
    },
    model: "probe/model",
    small_model: "probe/model",
    ...extra,
  };
}

/** Un événement du flux `/event`, tel qu'il arrive. */
export interface ProbeEvent {
  type: string;
  properties: Record<string, any>;
}

export interface ProbeServer {
  url: string;
  repo: string;
  root: string;
  proc: ChildProcess;
  events: ProbeEvent[];
  /** Les demandes de permission publiées, dans l'ordre. */
  asks(sessionId?: string): Array<Record<string, any>>;
  /** Le DERNIER état connu de chaque appel de tool. */
  toolParts(): Array<{ tool: string; status: string; error: string }>;
  /** A-t-on vu la session retomber au repos ? */
  sawIdle(): boolean;
  post(route: string, body?: unknown): Promise<{ status: number; body: any }>;
  get(route: string): Promise<{ status: number; body: any }>;
  createSession(title: string, permission?: unknown): Promise<string>;
  prompt(sessionId: string, text?: string): Promise<void>;
  stop(): void;
}

/**
 * Monte un serveur opencode sur un dépôt neuf, et branche le collecteur d'events.
 *
 * `HOME` pointe sur la racine de la sonde : les motifs en `~` deviennent alors
 * mesurables sans jamais toucher au vrai home de qui lance la sonde.
 */
export async function startProbeServer(opts: {
  bin: string;
  tag: string;
  config: Record<string, unknown>;
  /** Réutiliser un décor existant (redémarrage : même DB, même dépôt). */
  reuse?: { root: string; repo: string };
  /**
   * Variables d'environnement de PLUS, posées sur le serveur (MIN-364, lot 9).
   *
   * Elles vont ici plutôt que dans le `process.env` de la sonde parce que la
   * découverte d'opencode est MÉMOÏSÉE au premier accès : mesurer un
   * `OPENCODE_DISABLE_*` demande de redémarrer le serveur, et un `process.env`
   * restauré entre-temps aurait rendu la mesure muette — une sonde qui dit « oui,
   * c'est coupé » sur un serveur où rien n'était posé.
   */
  env?: Record<string, string>;
}): Promise<ProbeServer> {
  const root = opts.reuse?.root ?? probeRoot(opts.tag);
  const repo = opts.reuse?.repo ?? makeRepo(root);
  const port = await reserveProbePort();
  const proc = spawn(opts.bin, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: repo,
    env: {
      ...process.env,
      HOME: root,
      XDG_CONFIG_HOME: path.join(root, "config"),
      OPENCODE_CONFIG_CONTENT: JSON.stringify(opts.config),
      OPENCODE_DB: path.join(root, "probe.db"),
      OPENCODE_DISABLE_AUTOUPDATE: "1",
      OPENCODE_DISABLE_MODELS_FETCH: "1",
      ...opts.env,
    },
    stdio: "ignore",
  });

  const url = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 150 && !ready; i++) {
    await sleep(200);
    ready = await fetch(`${url}/global/health`).then(
      (r) => r.ok,
      () => false,
    );
  }
  if (!ready) {
    proc.kill("SIGKILL");
    throw new Error(`opencode n'a pas démarré sur ${url}`);
  }

  const events: ProbeEvent[] = [];
  const abort = new AbortController();
  void streamEvents(url, repo, abort.signal, (event) => events.push(event));

  const route = (p: string) =>
    `${url}${p}${p.includes("?") ? "&" : "?"}directory=${encodeURIComponent(repo)}`;
  const call = async (p: string, init?: RequestInit) => {
    const res = await fetch(route(p), init);
    const text = await res.text();
    return { status: res.status, body: text && !text.startsWith("<") ? JSON.parse(text) : null };
  };

  return {
    url,
    repo,
    root,
    proc,
    events,
    asks: (sessionId?: string) =>
      events
        .filter((e) => e.type === "permission.asked")
        .map((e) => e.properties)
        .filter((p) => !sessionId || p.sessionID === sessionId),
    toolParts() {
      const byCall = new Map<string, any>();
      for (const event of events) {
        if (event.type !== "message.part.updated") continue;
        const part = event.properties.part;
        if (part?.type === "tool") byCall.set(part.callID, part);
      }
      return [...byCall.values()].map((part) => ({
        tool: part.tool as string,
        status: part.state?.status as string,
        error: (part.state?.error ?? "") as string,
      }));
    },
    sawIdle: () =>
      events.some((e) => e.type === "session.idle") ||
      events.some((e) => e.type === "session.status" && e.properties.status?.type === "idle"),
    post: (p: string, body?: unknown) =>
      call(p, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      }),
    get: (p: string) => call(p),
    async createSession(title: string, permission?: unknown) {
      const created = await call("/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(permission ? { title, permission } : { title }),
      });
      if (created.status !== 200) throw new Error(`création de session: ${created.status}`);
      return created.body.id as string;
    },
    async prompt(sessionId: string, text = "go") {
      await call(`/session/${sessionId}/prompt_async`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parts: [{ type: "text", text }] }),
      });
    },
    stop() {
      abort.abort();
      proc.kill("SIGKILL");
    },
  };
}

/** Attend qu'une condition devienne vraie, ou rend `false` au bout du plafond. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 15_000,
  stepMs = 200,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(stepMs);
  }
  return await Promise.resolve(predicate());
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Attend que le fournisseur soit RETOMBÉ AU CALME — plus aucune requête depuis
 * `quietMs`.
 *
 * À appeler entre deux mesures qui partagent une file. Le piège, mesuré : le
 * résultat d'un tool (une réponse de permission, un refus) rappelle le
 * fournisseur, et cet appel-là arrive APRÈS qu'on a rendu la main. Sans cette
 * attente, il consomme le tour de la mesure SUIVANTE — qui, elle, ne voit alors
 * rien venir. Symptôme reconnaissable : une mesure sur deux tombe à vide.
 */
export async function settleProvider(
  provider: FakeProvider,
  quietMs = 800,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let seen = provider.seen.length;
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    await sleep(150);
    if (provider.seen.length !== seen) {
      seen = provider.seen.length;
      quietSince = Date.now();
      continue;
    }
    if (Date.now() - quietSince >= quietMs) return;
  }
}

/** Un appel de tool `bash`, tel que le modèle l'émettrait. */
export const bash = (command: string, extra: Record<string, unknown> = {}): ToolCall => ({
  name: "bash",
  args: { command, ...extra },
});

/** Un appel de tool `write` — le chemin est ABSOLU, comme chez un vrai modèle. */
export const write = (filePath: string, content = "x\n"): ToolCall => ({
  name: "write",
  args: { filePath, content },
});

async function reserveProbePort(): Promise<number> {
  const { reservePort } = await import("./free-port");
  return await reservePort();
}

async function streamEvents(
  url: string,
  repo: string,
  signal: AbortSignal,
  sink: (event: ProbeEvent) => void,
): Promise<void> {
  try {
    const res = await fetch(`${url}/event?directory=${encodeURIComponent(repo)}`, { signal });
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try {
          sink(JSON.parse(line.slice(5).trim()) as ProbeEvent);
        } catch {
          // Une frame tronquée n'est pas une panne de sonde.
        }
      }
    }
  } catch {
    // Le flux meurt avec le serveur : c'est la fin normale d'une sonde.
  }
}
