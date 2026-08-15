import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

/**
 * CE QUI SURVIT AU HARNESS, ET COMMENT ON LE RETROUVE (MIN-293).
 *
 * ## Le fait, mesuré, qui rend ce fichier nécessaire
 *
 * Le serveur opencode est lancé par `spawn` ordinaire
 * ([opencode-host.ts](opencode-host.ts)), et le commentaire qui l'accompagne dit
 * « l'enfant meurt avec nous ». **C'est vrai du chemin heureux et faux du reste**
 * : sur POSIX, un enfant n'est pas tué quand son parent meurt, il est réparenté.
 * Ce qui le tue aujourd'hui, c'est le `finally` du superviseur — donc rien du
 * tout quand le harness est tué net (⌘Q, plantage du main process, `SIGKILL`).
 *
 * Ce qui reste alors : 143 Mo en mémoire, le port du tour tenu, et **le tour
 * suivant qui échoue sur un `listen` refusé** — à un endroit qui ne ressemble en
 * rien à sa cause. Les jobs de fond du modèle sont pires encore : ils partent en
 * `setsid`, **explicitement pour survivre au shell**, et le `npm run dev` qu'ils
 * tiennent garde le port 3000 sans que rien nulle part ne sache où le retrouver.
 *
 * Dans une microVM, rien de tout ça ne compte : la machine meurt à la fin du
 * tour. Sur un Mac, c'est de l'ordure qui s'accumule dans la session de
 * quelqu'un.
 *
 * ## La forme : un fichier, pas un protocole
 *
 * Le harness inscrit ses enfants à longue vie dans `<harnessDir>/children.json`,
 * **avant** qu'ils servent à quoi que ce soit, et les retire quand il les a
 * arrêtés lui-même. Le lanceur, qui a écrit `job.json` dans ce même dossier et
 * sait donc où regarder, relit le fichier quand un tour se termine — et au
 * démarrage de l'app, pour les orphelins d'un plantage précédent.
 *
 * **Un fichier plutôt qu'un message IPC**, parce que le cas qu'on traite est
 * précisément celui où plus personne ne parle : un process tué net n'envoie pas
 * de message d'adieu. Et **écrit en synchrone**, parce qu'une écriture asynchrone
 * peut n'avoir pas eu lieu à l'instant où on tue.
 *
 * ## Rien ici ne lève
 *
 * Un disque plein ou un dossier en lecture seule ne doivent pas faire tomber un
 * tour : ce registre est ce qu'on lit quand ça a mal fini, pas une raison de mal
 * finir. Le pire cas d'un échec ici est celui d'avant ce fichier.
 */

/** Le nom du fichier, sous `harnessDir` — à côté du job et du bundle. */
export const CHILD_REGISTRY_FILE = "children.json";

/** Ce qu'un enfant à longue vie déclare de lui-même. */
export interface HarnessChild {
  readonly pid: number;
  /**
   * `opencode` : le serveur du tour, qui tient un port et une base SQLite.
   * `background` : un job du modèle, chef de sa propre session (`setsid`), donc
   * un GROUPE de processus — c'est `-pid` qu'il faut signaler, pas `pid`.
   */
  readonly kind: "opencode" | "background";
  /** De quoi lire le registre sans deviner : `opencode serve --port 51234`. */
  readonly label?: string;
}

export function childRegistryPath(harnessDir: string): string {
  return `${harnessDir.replace(/\/+$/, "")}/${CHILD_REGISTRY_FILE}`;
}

/**
 * Le registre relu de ce qu'on trouve sur le disque.
 *
 * Tout ce qui n'a pas la forme attendue disparaît en silence — un fichier
 * tronqué par un arrêt brutal est le cas ORDINAIRE ici, puisque l'arrêt brutal
 * est la raison d'être du fichier. Et les pid absurdes sont écartés avant même
 * d'arriver au tueur : `0` signale tout le groupe de l'appelant, `1` est
 * `launchd`, et un négatif signale un groupe entier. Aucun des trois ne peut
 * venir d'un `spawn` légitime, et chacun serait catastrophique.
 */
export function parseChildRegistry(raw: unknown): HarnessChild[] {
  if (typeof raw !== "object" || raw === null) return [];
  const children = (raw as { children?: unknown }).children;
  if (!Array.isArray(children)) return [];
  const out: HarnessChild[] = [];
  const seen = new Set<number>();
  for (const entry of children) {
    if (typeof entry !== "object" || entry === null) continue;
    const { pid, kind, label } = entry as Record<string, unknown>;
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 1) continue;
    if (kind !== "opencode" && kind !== "background") continue;
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push({ pid, kind, ...(typeof label === "string" && label ? { label } : {}) });
  }
  return out;
}

export function serializeChildRegistry(children: readonly HarnessChild[]): string {
  return `${JSON.stringify({ children }, null, 2)}\n`;
}

/** Les enfants inscrits pour ce tour. Vide quand le fichier manque ou ment. */
export function readHarnessChildren(harnessDir: string): HarnessChild[] {
  try {
    return parseChildRegistry(JSON.parse(readFileSync(childRegistryPath(harnessDir), "utf8")));
  } catch {
    return [];
  }
}

/**
 * Inscrit un enfant. **Appelé AVANT que l'enfant serve à quoi que ce soit** : un
 * process tué entre son `spawn` et son inscription est exactement l'orphelin
 * qu'on cherche à ne plus produire.
 */
export function noteHarnessChild(harnessDir: string, child: HarnessChild): void {
  write(harnessDir, [...readHarnessChildren(harnessDir).filter((c) => c.pid !== child.pid), child]);
}

/** Retire un enfant qu'on vient d'arrêter soi-même. */
export function forgetHarnessChild(harnessDir: string, pid: number): void {
  write(harnessDir, readHarnessChildren(harnessDir).filter((c) => c.pid !== pid));
}

/**
 * LES PID QU'ON A LE DROIT DE TUER, et dans quel ordre.
 *
 * Pur, et testé, parce que c'est la seule partie où une faute a des conséquences
 * qu'on ne rattrape pas : un `process.kill` sur le mauvais numéro tue quelque
 * chose de la session de quelqu'un.
 *
 * - **jamais soi-même**, ni le parent : un registre corrompu qui porterait le pid
 *   du main process ferait quitter l'app en croyant faire le ménage ;
 * - **les jobs de fond d'abord** : ils sont plus nombreux et plus volatils, et le
 *   serveur opencode est ce qui bloque le tour suivant — on veut sa mort en
 *   dernier, quand le reste a déjà lâché ce qu'il tenait ;
 * - **un `background` se signale en GROUPE** (`-pid`), parce qu'il est parti en
 *   `setsid` : tuer le seul chef laisserait le `npm run dev` qu'il a lancé.
 */
export function killTargets(
  children: readonly HarnessChild[],
  self: { pid: number; ppid?: number },
): Array<{ signalTo: number; kind: HarnessChild["kind"]; label?: string }> {
  const forbidden = new Set([self.pid, self.ppid].filter((v): v is number => typeof v === "number"));
  const order = { background: 0, opencode: 1 } as const;
  return children
    .filter((child) => !forbidden.has(child.pid))
    .slice()
    .sort((a, b) => order[a.kind] - order[b.kind])
    .map((child) => ({
      signalTo: child.kind === "background" ? -child.pid : child.pid,
      kind: child.kind,
      ...(child.label ? { label: child.label } : {}),
    }));
}

function write(harnessDir: string, children: readonly HarnessChild[]): void {
  try {
    mkdirSync(harnessDir, { recursive: true });
    writeFileSync(childRegistryPath(harnessDir), serializeChildRegistry(children), "utf8");
  } catch (error) {
    console.error("[child-registry] inscription impossible", error);
  }
}
