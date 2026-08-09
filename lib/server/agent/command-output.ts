import { headTail, TOOL_RESULT_MAX_CHARS } from "./prune";

/**
 * Mise en forme de la sortie de `run_command` (MIN-107). PUR et testable —
 * `execute.ts` ne fait que l'appeler (il importe `server-only` et la base : rien
 * d'exécutable en test). Deux règles, une seule idée : **ne jamais perdre la fin**.
 *
 *  1. La troncature garde la QUEUE (`headTail`, milieu élidé) — le récapitulatif
 *     d'un test qui échoue, la dernière erreur d'un build, le résumé d'un lint
 *     sont toujours en bas. L'ancien `cap()` coupait par la tête : le modèle
 *     voyait cent coches vertes et `exitCode: 1`, sans savoir ce qui avait cassé.
 *  2. Au-delà du seuil, la sortie COMPLÈTE est déposée dans la sandbox et le
 *     chemin renvoyé (modèle d'OpenCode) : le modèle la relit à la demande avec
 *     `grep`/`read_file` au lieu de se défendre du harness avec `| tail`.
 */

/** Cap de stdout renvoyé au modèle (milieu élidé, tête ET queue gardées). */
export const RUN_COMMAND_STDOUT_CAP = 4000;
/** Cap de stderr renvoyé au modèle. */
export const RUN_COMMAND_STDERR_CAP = 2000;
/**
 * LE DÉPÔT SUIT LA TRONCATURE, IL N'A PLUS DE SEUIL À LUI.
 *
 * Il en avait un — 8 000 caractères cumulés — plus haut que la somme des deux caps
 * (4 000 + 2 000). Entre les deux s'ouvrait une bande où le milieu de la sortie
 * était élidé sans que rien ne le rattrape : ni `full_output_path`, ni `note`. Un
 * `typecheck` à 7 000 caractères de stdout perdait ses erreurs du milieu, et le
 * prompt interdit par ailleurs de relancer la commande filtrée pour les retrouver
 * — on lui fermait la porte après lui avoir pris la clé.
 *
 * La bonne question n'était pas « la sortie est-elle grosse ? » mais « va-t-on lui
 * en cacher un morceau ? ». C'est celle-ci qu'on pose maintenant, et elle a
 * exactement la même réponse que le `truncated` de `buildResult`.
 *
 * Il reste un cas résiduel, et il est DIT plutôt que couvert : le rétrécissement
 * de l'enveloppe (`formatRunCommandResult`) peut couper plus bas que les caps
 * nominaux, sur une sortie que `spillsToDisk` a laissée passer. `buildResult`
 * pose alors une `note` sans chemin, qui autorise explicitement la seule chose
 * qui reste — relancer la commande cadrée.
 */

/** Sortie brute d'une commande (forme de `ShellResult`). */
export interface CommandOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Ce que le tool `run_command` renvoie au modèle. */
export interface RunCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Chemin absolu de la sortie complète dans la sandbox (si déposée). */
  full_output_path?: string;
  /** Consigne de relecture, présente seulement avec `full_output_path`. */
  note?: string;
}

/** La sortie mérite-t-elle d'être déposée en entier dans la sandbox ? Oui dès
 *  qu'un des deux flux dépasse SON cap — c'est-à-dire dès qu'on va en élider le
 *  milieu, et non plus au-delà d'un cumul indépendant des caps. */
export function spillsToDisk(o: Pick<CommandOutput, "stdout" | "stderr">): boolean {
  return o.stdout.length > RUN_COMMAND_STDOUT_CAP || o.stderr.length > RUN_COMMAND_STDERR_CAP;
}

/**
 * Nom du fichier de dépôt : un slug de la commande (pour que le modèle reconnaisse
 * SA sortie dans `list_dir`) + un `seq` unique dans le run (l'appelant le tranche
 * par continuation, comme les autres compteurs de run).
 */
export function toolOutputFileName(command: string, seq: number): string {
  const slug =
    command
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "command";
  return `${slug}-${seq}.log`;
}

/**
 * Document déposé dans la sandbox : la commande, son code de sortie, puis stdout
 * et stderr EN ENTIER sous des en-têtes repérables (un `grep` sur le fichier doit
 * pouvoir dire de quel flux vient la ligne trouvée).
 */
export function fullOutputDocument(command: string, o: CommandOutput): string {
  return [
    `$ ${command}`,
    `exit code: ${o.exitCode}`,
    "",
    "===== stdout =====",
    o.stdout,
    "===== stderr =====",
    o.stderr,
    "",
  ].join("\n");
}

/** Plancher des caps quand il faut rétrécir pour tenir dans l'enveloppe. */
const MIN_STREAM_CAP = 500;

function buildResult(
  o: CommandOutput,
  fullOutputPath: string | null,
  stdoutCap: number,
  stderrCap: number,
): RunCommandResult {
  const stdout = headTail(o.stdout, stdoutCap);
  const stderr = headTail(o.stderr, stderrCap);
  const truncated = stdout !== o.stdout || stderr !== o.stderr;
  if (!truncated) return { exitCode: o.exitCode, stdout, stderr };
  // Tronqué SANS dépôt : l'enveloppe a rétréci les caps sous ce que `spillsToDisk`
  // avait jugé, ou l'écriture du fichier a échoué. Le dire, et lever la seule
  // interdiction qui n'a plus de sens ici — sans fichier à relire, relancer la
  // commande cadrée est le seul chemin qui reste vers le milieu perdu.
  if (!fullOutputPath) {
    return {
      exitCode: o.exitCode,
      stdout,
      stderr,
      note: "The output was truncated (the middle was elided; the beginning and the end are shown) and no full copy was saved. If you need the elided part, re-run the command scoped to what you are looking for.",
    };
  }
  return {
    exitCode: o.exitCode,
    stdout,
    stderr,
    full_output_path: fullOutputPath,
    note: `The output was truncated (the middle was elided; the beginning and the end are shown). Full output saved to ${fullOutputPath}. Use grep to search it, or read_file with offset/limit to view specific sections — do not re-run the command piped to head/tail.`,
  };
}

/**
 * Résultat renvoyé au modèle. `fullOutputPath` = chemin du dépôt sur disque, ou
 * null (sortie courte, ou écriture échouée — best-effort : la troncature garde de
 * toute façon la queue).
 *
 * Le résultat doit tenir dans `TOOL_RESULT_MAX_CHARS` UNE FOIS SÉRIALISÉ : la
 * boucle applique son propre `headTail` au JSON, et cette coupe-là élide le
 * MILIEU du document — c'est-à-dire la fin de stdout, exactement ce qu'on essaie
 * de sauver. L'échappement JSON (sauts de ligne, guillemets, séquences ANSI)
 * gonfle une sortie de commande de façon très variable : on rétrécit donc les
 * caps jusqu'à ce que ça rentre POUR DE VRAI, sans parier sur un ratio.
 */
export function formatRunCommandResult(
  o: CommandOutput,
  fullOutputPath: string | null,
): RunCommandResult {
  let stdoutCap = RUN_COMMAND_STDOUT_CAP;
  let stderrCap = RUN_COMMAND_STDERR_CAP;
  for (;;) {
    const result = buildResult(o, fullOutputPath, stdoutCap, stderrCap);
    if (JSON.stringify(result).length <= TOOL_RESULT_MAX_CHARS) return result;
    if (stdoutCap <= MIN_STREAM_CAP && stderrCap <= MIN_STREAM_CAP) return result;
    stdoutCap = Math.max(MIN_STREAM_CAP, Math.floor(stdoutCap * 0.8));
    stderrCap = Math.max(MIN_STREAM_CAP, Math.floor(stderrCap * 0.8));
  }
}
