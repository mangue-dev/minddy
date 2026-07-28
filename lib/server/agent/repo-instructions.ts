/**
 * Instructions d'un dépôt (`AGENTS.md` / `CLAUDE.md`) — PUR et testable, comme
 * command-output.ts : `execute.ts` ne fait que lire les fichiers nommés ici et
 * emballer ce qu'il a lu.
 *
 * Deux temps (MIN-115) :
 *  - à l'AMORCE, la racine du clone, en message dédié (`formatBootInstructions`) ;
 *  - PARESSEUSEMENT, à la première édition dans un sous-dossier, les fichiers
 *    rencontrés entre la racine et le fichier touché (`instructionFilesFor` →
 *    `formatTouchedInstructions`), collés au RÉSULTAT du tool d'édition.
 *
 * Pourquoi paresseux plutôt que tout à l'amorce (la règle de Codex) : le cap
 * global reste 32 Ko, et remplir ce budget des conventions de paquets que l'agent
 * ne touchera jamais se ferait au détriment de celles de la racine.
 */

/** Fichiers d'instructions reconnus, par ordre d'affichage. */
export const REPO_INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"];

/** Cap TOTAL des instructions injectées sur un run (miroir du project_doc_max_bytes de Codex). */
export const REPO_INSTRUCTIONS_MAX_BYTES = 32_000;

/**
 * Cap d'UNE injection collée à un résultat de tool. Le résultat entier passe par
 * `headTail(…, TOOL_RESULT_MAX_CHARS)` (6 000) : au-delà, c'est le MILIEU qui est
 * élidé — donc les instructions elles-mêmes. On borne ici, et l'agent garde le
 * chemin du fichier pour aller lire le reste avec `read_file`.
 */
export const TOUCHED_INSTRUCTIONS_MAX_BYTES = 2_500;

/** Tronque en gardant la note DANS le budget (elle occupe de la place, elle aussi). */
function cap(body: string, max: number, path: string): string {
  if (body.length <= max) return body;
  const note = `\n… [truncated — read ${path} in full if you need the rest]`;
  return `${body.slice(0, Math.max(0, max - note.length))}${note}`;
}

/**
 * Chemins d'instructions candidats pour un fichier édité, du plus GÉNÉRAL au plus
 * spécifique, RACINE EXCLUE (elle part à l'amorce). `apps/web/app/page.tsx` →
 * `apps/AGENTS.md`, `apps/CLAUDE.md`, `apps/web/AGENTS.md`, … Chemins relatifs au
 * dépôt : un chemin absolu ou remontant (`..`) ne donne rien.
 */
export function instructionFilesFor(filePath: string): string[] {
  const cleaned = filePath.trim().replace(/^\.\//, "");
  if (!cleaned || cleaned.startsWith("/") || cleaned.split("/").includes("..")) return [];
  const segments = cleaned.split("/").filter((s) => s !== "" && s !== ".");
  // Le dernier segment est le fichier ; la racine est déjà couverte par l'amorce.
  const dirs = segments.slice(0, -1);
  const out: string[] = [];
  let prefix = "";
  for (const dir of dirs) {
    prefix = prefix ? `${prefix}/${dir}` : dir;
    for (const name of REPO_INSTRUCTION_FILES) out.push(`${prefix}/${name}`);
  }
  return out;
}

/** Un fichier d'instructions lu dans le dépôt. */
export interface RepoInstructionFile {
  path: string;
  content: string;
}

/**
 * Message d'amorce des instructions de la RACINE, ou null s'il n'y en a pas.
 * `bytes` sert à tenir le budget global sur les injections suivantes.
 */
export function formatBootInstructions(
  files: RepoInstructionFile[],
): { message: string; bytes: number } | null {
  const parts = files
    .filter((f) => f.content.trim())
    .map((f) => `## ${f.path}\n${f.content.trim()}`);
  if (parts.length === 0) return null;
  let body = parts.join("\n\n");
  if (body.length > REPO_INSTRUCTIONS_MAX_BYTES) {
    body = `${body.slice(0, REPO_INSTRUCTIONS_MAX_BYTES)}… [truncated]`;
  }
  const message = `# Repository instructions\nThe repository ships these instructions. Follow them; they override the general conventions on project-specific matters (build/test commands, structure, forbidden areas).\n\n<REPO_INSTRUCTIONS>\n${body}\n</REPO_INSTRUCTIONS>`;
  return { message, bytes: body.length };
}

/**
 * Ce qu'un run a déjà servi d'instructions. Muté par `collectTouchedInstructions`
 * et persisté dans le checkpoint : un tour éclaté sur plusieurs chunks ne doit pas
 * re-servir un `AGENTS.md` que le modèle a déjà lu.
 */
export interface InstructionsState {
  /** Chemins déjà injectés OU constatés absents — jamais relus. */
  paths: string[];
  /** Octets d'instructions déjà injectés, sur le cap global. */
  bytes: number;
}

/**
 * Instructions des sous-dossiers que l'agent vient de toucher, prêtes à coller au
 * résultat de son tool d'édition — ou null s'il n'y a rien de neuf. `read` est
 * fourni par l'appelant (la sandbox), pour que la règle reste testable ici : un
 * chemin n'est lu QU'UNE fois par run, trouvé ou non, et le budget global ne se
 * dépasse pas.
 */
export async function collectTouchedInstructions(
  touchedPaths: string[],
  state: InstructionsState,
  read: (path: string) => Promise<string | null>,
): Promise<string | null> {
  const budget = REPO_INSTRUCTIONS_MAX_BYTES - state.bytes;
  if (budget <= 0) return null;
  const seen = new Set(state.paths);
  const found: RepoInstructionFile[] = [];
  for (const touched of touchedPaths) {
    for (const candidate of instructionFilesFor(touched)) {
      if (seen.has(candidate)) continue;
      // Marqué AVANT la lecture : trouvé ou absent, on ne le redemandera pas.
      seen.add(candidate);
      state.paths.push(candidate);
      const content = await read(candidate);
      if (content?.trim()) found.push({ path: candidate, content });
    }
  }
  if (found.length === 0) return null;
  const formatted = formatTouchedInstructions(found, budget);
  if (!formatted) return null;
  state.bytes += formatted.bytes;
  return formatted.block;
}

/**
 * Bloc collé au résultat d'un tool d'édition : les instructions du sous-dossier
 * que l'agent vient de toucher. Renvoie null si rien de neuf tient dans le budget.
 */
function formatTouchedInstructions(
  files: RepoInstructionFile[],
  budgetBytes: number,
): { block: string; bytes: number } | null {
  const blocks: string[] = [];
  let spent = 0;
  for (const file of files) {
    const trimmed = file.content.trim();
    if (!trimmed) continue;
    const remaining = Math.min(TOUCHED_INSTRUCTIONS_MAX_BYTES, budgetBytes - spent);
    if (remaining <= 0) break;
    const body = cap(trimmed, remaining, file.path);
    blocks.push(`<REPO_INSTRUCTIONS path="${file.path}">\n${body}\n</REPO_INSTRUCTIONS>`);
    spent += body.length;
  }
  if (blocks.length === 0) return null;
  return {
    block: `The directory you just edited ships its own instructions. Follow them for anything under it; they override the repository-wide ones on project-specific matters.\n\n${blocks.join("\n\n")}`,
    bytes: spent,
  };
}
