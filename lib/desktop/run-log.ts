import { SecretRedactor, type RedactText } from "@/lib/server/agent/redact";

/**
 * LE JOURNAL D'UN TOUR JOUÉ SUR LA MACHINE (MIN-363) — la moitié qui se décide
 * sans disque.
 *
 * ## Pourquoi ce fichier existe
 *
 * Un run local peut rater **avant que le harness ait parlé** : le bundle ne se
 * lance pas, opencode ne s'installe pas, le dépôt a bougé, macOS refuse le
 * dossier, le plan de contrôle rend 403. Dans cette fenêtre-là, il n'existe ni
 * event, ni checkpoint, ni ligne de `agent_runs` à lire — le `stdio` de
 * l'enfant est la SEULE chose qui parle, et personne ne l'écoute : la coquille
 * n'a jamais lancé d'enfant, et les journaux d'opencode partent dans un dossier
 * de la machine que l'utilisateur ne connaît pas.
 *
 * C'est le premier ticket de support de la fonctionnalité, et sans ce fichier il
 * est insoluble : « ça ne marche pas » sans une ligne à regarder.
 *
 * ## Ce qui se décide ici, et pourquoi ça ne vit pas dans `desktop/src/`
 *
 * Le nommage, la rotation, l'en-tête, la substitution des secrets et le rapport
 * de diagnostic sont des décisions ; `vitest` ne collecte pas `desktop/src/`
 * ([local-surface-coverage.test.ts](../server/agent/local-surface-coverage.test.ts)).
 * Elles descendent donc ici, avec leur test, et la coquille ne garde que le `fs`.
 *
 * ## Trois règles qui ont l'air de détails
 *
 * 1. **Le nom porte la date en tête**, donc l'ordre alphabétique EST l'ordre
 *    chronologique. La rotation trie des chaînes, sans jamais lire une `mtime` —
 *    qu'une copie, une sauvegarde ou un `rsync` réécrit.
 * 2. **La rotation garde toujours le plus récent**, même seul au-dessus du
 *    plafond d'octets. Un tour qui déraille et crache 200 Mo est exactement
 *    celui qu'on veut lire ; une rotation qui le supprime pour tenir un quota
 *    laisse l'utilisateur avec un dossier propre et rien à envoyer.
 * 3. **Les secrets sont substitués à l'ÉCRITURE**, pas à la lecture. Le jeton
 *    d'exécution locale et la clé du modèle passent par l'environnement et les
 *    arguments de l'enfant ; un journal qu'on colle dans un fil de support ne
 *    doit pas les porter, et le seul moment où c'est garanti est avant que
 *    l'octet touche le disque.
 *
 * Et une règle de produit, qui n'est pas technique : **le rapport ne part
 * jamais tout seul.** Il va au presse-papier, l'utilisateur le relit et le
 * colle. C'est ce qui permet d'y mettre un chemin de home.
 */

/** Le dossier des journaux, sous `userData`. */
export const RUN_LOG_DIR_NAME = "agent-logs";

/** L'extension, et le filtre de la rotation : elle ne regarde rien d'autre. */
export const RUN_LOG_EXTENSION = ".log";

/** Combien de journaux on garde au plus. */
export const RUN_LOG_MAX_FILES = 20;

/** Et combien d'octets, tous journaux confondus (25 Mo). */
export const RUN_LOG_MAX_BYTES = 25 * 1024 * 1024;

/** Combien de lignes de queue le rapport de diagnostic emporte. */
export const RUN_LOG_REPORT_LINES = 120;

/** Ce qu'on écrit quand on ne sait pas — jamais une chaîne vide, qui se lit mal. */
const UNKNOWN = "—";

/**
 * CE QU'UN JOURNAL SAIT DE SON TOUR AVANT QUE LE HARNESS AIT PARLÉ.
 *
 * Les cinq champs du rapport de diagnostic, plus l'identité du run. Ils sont
 * tous connus du lanceur au moment du `fork` : c'est précisément ce qui rend
 * l'en-tête utile quand tout le reste a échoué.
 */
export interface RunLogFacts {
  /** Le run dont ce journal est le tour. */
  readonly runId: string;
  /** Version de l'app de bureau (`app.getVersion()`). */
  readonly appVersion: string;
  /** Empreinte du bundle de harness téléchargé pour ce tour. */
  readonly bundleVersion: string;
  /** Version d'opencode épinglée (`OPENCODE_VERSION`). */
  readonly opencodeVersion: string;
  /** Le dépôt sur lequel le tour joue — un chemin de cette machine. */
  readonly repoPath: string;
}

/** L'en-tête relu depuis un journal. Tous les champs sont facultatifs : un
 *  fichier tronqué par un arrêt brutal doit se lire quand même. */
export type RunLogHeader = Partial<Record<keyof RunLogFacts | "started", string>>;

/** Un journal sur le disque, tel que la rotation a besoin de le voir. */
export interface RunLogFile {
  readonly name: string;
  readonly bytes: number;
}

/** Les deux plafonds de la rotation. */
export interface RunLogLimits {
  readonly maxFiles?: number;
  readonly maxBytes?: number;
}

/**
 * Le nom du journal d'un tour : la date d'abord, l'identifiant ensuite.
 *
 * `:` et `.` sortent de l'horodatage — le premier est interdit sur les systèmes
 * de fichiers d'autres plateformes et fâcheux dans un `scp`, le second couperait
 * l'extension en deux. L'identifiant est réduit aux caractères sûrs : il vient
 * de la base, mais un nom de fichier construit à partir d'une valeur distante
 * sans être filtré est un chemin d'écriture qu'on offre à quelqu'un d'autre.
 */
export function runLogFileName(runId: string, startedAt: Date): string {
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const safe = runId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${stamp}-run-${safe || "unknown"}${RUN_LOG_EXTENSION}`;
}

/**
 * L'en-tête écrit en tête de chaque journal, et relisible par
 * {@link readRunLogHeader}. Il se termine par une ligne vide : c'est elle qui
 * borne la lecture, et elle sépare visuellement l'en-tête de la sortie brute.
 */
export function runLogHeader(facts: RunLogFacts, startedAt: Date): string {
  return (
    [
      "minddy run log",
      `runId: ${facts.runId}`,
      `started: ${startedAt.toISOString()}`,
      `appVersion: ${facts.appVersion}`,
      `bundleVersion: ${facts.bundleVersion}`,
      `opencodeVersion: ${facts.opencodeVersion}`,
      `repoPath: ${facts.repoPath}`,
    ].join("\n") + "\n\n"
  );
}

/**
 * L'en-tête relu. S'arrête à la première ligne vide, et ignore tout ce qui n'a
 * pas la forme `clé: valeur` — un journal dont l'en-tête a été mangé rend un
 * objet vide plutôt que de lever.
 */
export function readRunLogHeader(text: string): RunLogHeader {
  const header: RunLogHeader = {};
  for (const line of text.split("\n")) {
    if (line.trim() === "") break;
    const match = /^([A-Za-z]+): (.*)$/.exec(line);
    if (!match) continue;
    const key = match[1] as keyof RunLogHeader;
    header[key] = match[2];
  }
  return header;
}

/**
 * Les journaux à SUPPRIMER — la fonction ne touche à rien, elle nomme.
 *
 * Deux plafonds, et le plus récent survit toujours aux deux (cf. règle 2 en tête
 * de fichier). Le tri est décroissant sur le NOM, qui commence par la date.
 */
export function pruneRunLogs(files: readonly RunLogFile[], limits: RunLogLimits = {}): string[] {
  const maxFiles = limits.maxFiles ?? RUN_LOG_MAX_FILES;
  const maxBytes = limits.maxBytes ?? RUN_LOG_MAX_BYTES;

  const sorted = files
    .filter((file) => file.name.endsWith(RUN_LOG_EXTENSION))
    .slice()
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));

  const doomed: string[] = [];
  let kept = 0;
  let bytes = 0;
  for (const file of sorted) {
    const first = kept === 0;
    const overflow = kept >= maxFiles || bytes + file.bytes > maxBytes;
    if (overflow && !first) {
      doomed.push(file.name);
      continue;
    }
    kept += 1;
    bytes += file.bytes;
  }
  return doomed;
}

/**
 * Les `count` dernières lignes. Le `\n` final ne compte pas pour une ligne vide
 * de plus : un journal se termine toujours par une fin de ligne, et emporter
 * une ligne vide au lieu de la dernière ligne utile serait la faute qu'on ne
 * remarque que le jour où on lit le rapport.
 */
export function tailLines(text: string, count: number): string {
  const lines = text.replace(/\n$/, "").split("\n");
  if (count <= 0) return "";
  return lines.slice(Math.max(0, lines.length - count)).join("\n");
}

/**
 * La substitution posée sur ce que le tour écrit. Les valeurs trop courtes pour
 * être un secret sont ignorées par `SecretRedactor` — sans quoi une « clé » de
 * trois caractères substituerait des bouts de mots dans tout le journal.
 *
 * `redact.ts` plutôt qu'une seconde substitution écrite ici : c'est le même
 * problème que dans la boucle, et deux implémentations divergent.
 */
export function runLogRedactor(secrets: readonly (string | null | undefined)[]): RedactText {
  const redactor = new SecretRedactor();
  for (const secret of secrets) redactor.add(secret);
  return redactor.redact;
}

/**
 * Un morceau de `stdout` ou de `stderr`, préparé pour le journal : chaque ligne
 * porte sa source.
 *
 * Le marquage compte plus qu'il n'en a l'air — un harness qui écrit sa
 * progression sur `stdout` et ses erreurs sur `stderr` produit, mélangé, un
 * texte où l'on ne sait plus ce qui est un incident. Une ligne vide reste vide :
 * on ne fabrique pas du `[out]` pour du blanc.
 */
export function tagRunLogChunk(chunk: string, stream: "out" | "err"): string {
  const tag = stream === "err" ? "[err] " : "[out] ";
  return chunk
    .split("\n")
    .map((line) => (line === "" ? "" : `${tag}${line}`))
    .join("\n");
}

/** Ce que la coquille a ramassé sur le disque pour fabriquer le rapport. */
export interface DiagnosticFacts {
  readonly appVersion: string;
  readonly opencodeVersion: string;
  /** `darwin 25.5.0`, ou ce que la plateforme rend. */
  readonly platform: string;
  readonly generatedAt: Date;
  /** Le dossier des journaux — l'utilisateur doit pouvoir aller voir. */
  readonly logDir: string;
  /** Combien de journaux y vivent. */
  readonly logCount: number;
  /** Le dernier tour joué, ou `null` quand aucun n'a jamais joué. */
  readonly lastRun: {
    readonly fileName: string;
    readonly header: RunLogHeader;
    readonly tail: string;
  } | null;
}

/**
 * LE RAPPORT DE DIAGNOSTIC, tel qu'il part au presse-papier.
 *
 * En anglais, comme le menu qui le déclenche, et en markdown : il finira collé
 * dans un fil de support, pas lu dans un terminal.
 *
 * Quand aucun tour n'a jamais joué, il le DIT au lieu de rendre un rapport vide.
 * C'est déjà une réponse — « la machine n'a jamais reçu de run » et « le run a
 * échoué au démarrage » sont deux tickets de support différents.
 */
export function formatDiagnosticReport(facts: DiagnosticFacts): string {
  const header = facts.lastRun?.header ?? {};
  const rows: Array<[string, string]> = [
    ["App", facts.appVersion],
    ["Platform", facts.platform],
    ["opencode", facts.opencodeVersion],
    ["Harness bundle", header.bundleVersion || UNKNOWN],
    ["Repository", header.repoPath || UNKNOWN],
    ["Last run", header.runId || UNKNOWN],
    ["Started", header.started || UNKNOWN],
    ["Logs", `${facts.logCount} in ${facts.logDir}`],
  ];

  const body = facts.lastRun
    ? `### Last ${RUN_LOG_REPORT_LINES} lines — ${facts.lastRun.fileName}\n\n` +
      "```\n" +
      `${facts.lastRun.tail}\n` +
      "```"
    : "No agent run has ever started on this machine — there is no log to read.";

  return (
    `## minddy diagnostic report\n\n` +
    `Generated ${facts.generatedAt.toISOString()}\n\n` +
    rows.map(([label, value]) => `- **${label}:** ${value}`).join("\n") +
    `\n\n${body}\n`
  );
}
