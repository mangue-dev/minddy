import { sq, type RepoHost } from "./repo-host";

/**
 * Type-check du dépôt (MIN-110). Depuis MIN-263 il ne tourne plus en fin de tour :
 * il est réclamé par la porte de livraison (`delivery-gate.ts`), au premier
 * `create_pr` d'un tour qui a édité. Le reste du raisonnement ci-dessous — un check
 * par TOUR et non par édition — vaut inchangé.
 *
 * OpenCode referme la boucle DANS le tool d'édition : chaque `edit` touche le
 * fichier côté LSP et recolle les diagnostics au résultat. On ne peut pas copier
 * ça tel quel, et la mesure le dit (docs/agent-harness-comparison.md §3.3, section
 * « Coût d'un type-check dans la sandbox ») : dans notre microVM, un `tsc --noEmit`
 * incrémental coûte 4,9 s au plancher, ~11 s en régime normal, 14,4 s quand le
 * fichier touché est un carrefour. Par édition, le run le plus lourd de notre
 * histoire paierait jusqu'à 290 s — plus que la soft-deadline d'un chunk. Et
 * surtout, un changement cohérent s'étale sur plusieurs fichiers : checker ENTRE
 * deux moitiés d'un même changement remonte des erreurs que l'édition suivante
 * efface.
 *
 * D'où : UN check par tour, et seulement si le tour a touché des fichiers. Il tombe
 * au moment de LIVRER (le premier `create_pr`, MIN-263), pas après la réponse du
 * modèle : les erreurs partent alors dans le `followUp` du tool, le modèle corrige,
 * puis rappelle `create_pr` — et rien n'a rouvert un tour déjà terminé.
 *
 * TOUT ici est best-effort et SILENCIEUX en cas de doute : pas de `tsconfig.json`,
 * pas de `node_modules/.bin/tsc` (notre échec de production le plus fréquent :
 * `tsc: command not found`, le modèle lançant `npm run typecheck` avant d'installer),
 * timeout, sortie illisible → `null`. Un harness qui transformerait un
 * environnement pas installé en mur d'erreurs serait pire que silencieux.
 */

/** Budget mural d'un type-check. Mesuré : 22 s à froid, ~11 s à chaud sur minddy.
 *  Large pour un gros dépôt, borné pour ne jamais manger un chunk entier. */
export const TYPECHECK_TIMEOUT_MS = 120_000;
/** Budget minimum restant sur le chunk pour lancer un check (sinon on se tait). */
export const TYPECHECK_MIN_BUDGET_MS = 60_000;
/** Cap du bloc d'erreurs renvoyé au modèle. Au-delà, il ne lit plus, il subit. */
export const TYPE_ERRORS_MAX_CHARS = 2000;
/**
 * `.tsbuildinfo` gardé HORS du dépôt : le `git add -A` de fin de tour ne le voit
 * jamais, et `git status` reste propre pour le modèle (même raison que le dossier
 * de sorties de tools). Persiste dans le snapshot de la microVM → les tours
 * suivants repartent à chaud (22 s → 11 s).
 *
 * Sous la racine DU RUN depuis MIN-354 : deux runs qui partageraient un cache
 * incrémental le rendraient plus lent que pas de cache du tout, chacun
 * invalidant celui de l'autre à chaque passage.
 */
function tsbuildinfo(host: RepoHost): string {
  return `${host.layout.typecheckDir}/agent.tsbuildinfo`;
}

/** En-tête du bloc d'erreurs. Formulation d'OpenCode (« … please fix: »), dont on
 *  sait qu'elle fonctionne, recalée sur notre portée : le tour, pas le fichier. */
const HEADER = "Type errors detected after your changes, please fix:";
/** Rappel anti-boucle : un dépôt déjà cassé ne doit pas devenir le sujet du tour. */
const FOOTER =
  "If an error is unrelated to what you changed (it was already there), do not fix it — say so in your reply.";

/** Une erreur de typage telle que `tsc --pretty false` la rend. */
export interface TypeErrorEntry {
  /** Chemin relatif au dépôt, tel que tsc l'imprime. */
  file: string;
  /** La ligne complète, élaborations indentées comprises. */
  text: string;
}

/** Le type-checker du dépôt, s'il est utilisable ICI ET MAINTENANT. */
export interface TypeChecker {
  /** Version majeure de TypeScript (`--incremental` avec `--noEmit` exige TS ≥ 5). */
  major: number;
}

/**
 * Le dépôt a-t-il un type-checker RÉELLEMENT exécutable ? `tsconfig.json` seul ne
 * suffit pas — sans `node_modules`, `tsc` n'existe pas. Une seule commande (1 ms
 * dans la VM, le round-trip domine). Best-effort : tout échec → `null`.
 */
export async function detectTypeChecker(host: RepoHost): Promise<TypeChecker | null> {
  try {
    const res = await host.exec(
      `test -f tsconfig.json && test -x ./node_modules/.bin/tsc && ./node_modules/.bin/tsc --version`,
      { cwd: host.layout.repoDir, timeoutMs: 30_000 },
    );
    if (res.exitCode !== 0) return null;
    const major = Number(/Version (\d+)\./.exec(res.stdout)?.[1] ?? NaN);
    return Number.isFinite(major) ? { major } : null;
  } catch {
    return null;
  }
}

/**
 * Lance le type-check du dépôt et renvoie le bloc à servir au modèle, ou `null`
 * s'il n'y a rien à dire. `touched` = les chemins que le tour a édités : ils
 * passent EN TÊTE du bloc (c'est le lien « ton édition → cette erreur » que le
 * ticket cherche à rétablir), le reste du dépôt derrière.
 */
export async function typeErrorsForTurn(
  host: RepoHost,
  touched: readonly string[],
): Promise<string | null> {
  const checker = await detectTypeChecker(host);
  if (!checker) return null;

  // `--incremental` explicite : le tsconfig du dépôt ne l'active pas forcément, et
  // c'est lui qui fait passer les tours suivants de 22 s à 11 s. Interdit avec
  // `--noEmit` avant TS 5 → on s'en passe (on paie le prix fort, mais on parle).
  const buildInfo = tsbuildinfo(host);
  const incremental =
    checker.major >= 5 ? ` --incremental --tsBuildInfoFile ${sq(buildInfo)}` : "";
  try {
    const res = await host.exec(
      `mkdir -p ${sq(host.layout.typecheckDir)}; ./node_modules/.bin/tsc --noEmit --pretty false${incremental} 2>&1`,
      { cwd: host.layout.repoDir, timeoutMs: TYPECHECK_TIMEOUT_MS },
    );
    // exitCode 0 = rien à dire. Non nul SANS erreur analysable = panne d'outil
    // (tsconfig illisible, OOM, timeout) : `formatTypeErrors` renvoie null.
    return formatTypeErrors(res.stdout + res.stderr, touched);
  } catch {
    return null;
  }
}

/** `path/to/file.ts(12,3): error TS2322: …` — la forme de `tsc --pretty false`. */
const ERROR_LINE = /^(\S[^(]*)\((\d+),(\d+)\): error (TS\d+): /;

/**
 * Découpe une sortie `tsc --pretty false` en erreurs. Une entrée commence à une
 * ligne `fichier(l,c): error TSxxxx:` et absorbe les lignes indentées qui la
 * suivent (les élaborations de TypeScript, souvent le seul endroit où il dit
 * POURQUOI). Tout ce qui n'appartient à aucune entrée est jeté — dont les erreurs
 * de configuration sans fichier (`TS5083`, `TS18003`), qui ne concernent pas le
 * modèle et le mèneraient sur une fausse piste.
 */
export function parseTypeErrors(raw: string): TypeErrorEntry[] {
  const entries: TypeErrorEntry[] = [];
  for (const line of raw.split("\n")) {
    const m = ERROR_LINE.exec(line);
    if (m) {
      entries.push({ file: m[1], text: line.trimEnd() });
      continue;
    }
    // Élaboration : rattachée à l'erreur en cours, jamais orpheline.
    if (entries.length > 0 && /^\s+\S/.test(line)) {
      entries[entries.length - 1].text += `\n${line.trimEnd()}`;
    }
  }
  return entries;
}

/**
 * Rend le bloc servi au modèle : en-tête, erreurs des fichiers TOUCHÉS d'abord,
 * puis les autres, cap à `TYPE_ERRORS_MAX_CHARS`. `null` s'il n'y a aucune erreur
 * analysable — l'appelant se tait alors complètement.
 *
 * Pur (aucune sandbox) : c'est ici que vivent le tri, le cap et la formulation,
 * donc c'est ici que portent les tests.
 */
export function formatTypeErrors(raw: string, touched: readonly string[]): string | null {
  const entries = parseTypeErrors(raw);
  if (entries.length === 0) return null;

  const isTouched = new Set(touched.map(normalizePath));
  const mine = entries.filter((e) => isTouched.has(normalizePath(e.file)));
  const others = entries.filter((e) => !isTouched.has(normalizePath(e.file)));
  const ordered = [...mine, ...others];

  const lines: string[] = [];
  let used = 0;
  let shown = 0;
  for (const entry of ordered) {
    // +1 pour le saut de ligne. On s'arrête AVANT de dépasser : un bloc coupé au
    // milieu d'une erreur ferait lire au modèle un chemin ou un message tronqué.
    if (used + entry.text.length + 1 > TYPE_ERRORS_MAX_CHARS) break;
    lines.push(entry.text);
    used += entry.text.length + 1;
    shown++;
  }
  // Cap atteint dès la première erreur (une élaboration monstrueuse) : on la sert
  // quand même, tronquée — mieux qu'un bloc vide qui dirait « tout va bien ».
  if (lines.length === 0) {
    lines.push(ordered[0].text.slice(0, TYPE_ERRORS_MAX_CHARS));
    shown = 1;
  }

  const hidden = ordered.length - shown;
  const more = hidden > 0 ? `\n… and ${hidden} more error${hidden > 1 ? "s" : ""}.` : "";
  return `${HEADER}\n${lines.join("\n")}${more}\n${FOOTER}`;
}

/** `./lib/a.ts` et `lib/a.ts` sont le même fichier ; tsc et nos tools ne les
 *  écrivent pas pareil. Comparaison sur une forme unique. */
function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/+/, "");
}

// ── La suite de tests, même geste que le type-check (MIN-251) ────────────────

/**
 * CE QUE LE HARNESS FAIT ENSEIGNE PLUS FORT QUE CE QUE LE PROMPT DIT.
 *
 * Le prompt demande depuis toujours de « lancer le linter / type-check / build /
 * tests du projet ». Le harness, lui, ne lançait QUE `tsc`. Sur le run de la PR 48,
 * un tour de 13,6 minutes qui a livré une feature en sept fichiers n'a exécuté
 * DEUX commandes en tout — un install et un `npm run typecheck` — sans ouvrir un
 * seul des 209 fichiers de test du dépôt. Et la feature ne marchait pas. Le modèle
 * avait vu le défaut dans son propre thinking, puis l'avait classé : « *that's
 * working as expected since type checks are passing* ». C'est la conclusion
 * logique de ce qu'il voyait s'exécuter à sa place, tour après tour.
 *
 * D'où ce bloc, calqué trait pour trait sur le type-check : détecté, lancé en fin
 * de tour quand le dépôt a été touché, ses échecs mis dans le contexte AVANT que
 * le modèle ne réponde. Un seul passage par tour — le tour doit se terminer, pas
 * partir en boucle de correction.
 *
 * Mêmes règles de silence, et pour la même raison : pas de script `test`, pas de
 * binaire installé, sortie illisible, panne → `null`. Un harness qui transformerait
 * un environnement pas installé en mur d'échecs serait pire que silencieux.
 */

/**
 * Budget mural de la suite. MESURÉ dans la microVM (2 vCPU / 4,2 Go) sur les 2 760
 * tests de minddy : **80,5 s**, et — contrairement à `tsc` — le second passage coûte
 * exactement le même prix (80,5 s aussi, 81,2 s avec un test rouge). Il n'y a pas
 * de dividende « à chaud » à espérer ici : le chiffre à budgéter est celui-là.
 *
 * Le local ment de 4,4× (18,4 s sur douze cœurs) : c'est la mesure dans la VM qui
 * fait foi, jamais celle du poste.
 */
export const TEST_TIMEOUT_MS = 240_000;
/**
 * Budget mural d'un passage CIBLÉ (`vitest related` / `jest --findRelatedTests`).
 * Le runner démarre pareil et ne charge que le sous-graphe des fichiers touchés :
 * c'est le démarrage qui domine, pas les cas. Borné bien plus court que la suite
 * entière — un passage ciblé qui prend deux minutes n'est plus un passage ciblé,
 * et le laisser courir reviendrait à payer la suite sans l'avoir demandée.
 */
export const TEST_RELATED_TIMEOUT_MS = 120_000;
/**
 * Budget minimum restant sur le chunk pour lancer la suite (sinon on se tait). Même
 * marge que le type-check sur sa propre mesure (60 s pour 22 s, ~2,7×) : ici 180 s
 * pour 80 s. Un chunk complet vaut 700 s, et le pire tour paie les deux contrôles —
 * deux type-checks et une suite, soit ~125 s, un sixième du chunk. C'est le prix
 * qu'on accepte pour qu'un tour ne puisse pas se terminer en rouge sans le dire.
 */
export const TEST_MIN_BUDGET_MS = 180_000;
/** Même marge, sur le budget d'un passage ciblé (~30 s mesurés au pire). */
export const TEST_RELATED_MIN_BUDGET_MS = 90_000;
/** Cap du bloc d'échecs renvoyé au modèle. Au-delà, il ne lit plus, il subit. */
export const TEST_FAILURES_MAX_CHARS = 3000;
/**
 * Lignes gardées par échec. Un échec de vitest ou de jest, c'est un titre, un
 * message, un diff attendu/reçu et une position — puis un extrait de code source
 * que le modèle peut relire lui-même. On garde le premier, on jette le second.
 */
const TEST_FAILURE_MAX_LINES = 8;

const TEST_HEADER = "Tests are failing after your changes, please fix:";
/** Même rappel anti-boucle que le type-check : un dépôt déjà rouge ne doit pas
 *  devenir le sujet du tour. */
const TEST_FOOTER =
  "If a failure is unrelated to what you changed (it was already there), do not fix it — say so in your reply.";

/** La suite de tests du dépôt, si elle est lançable ICI ET MAINTENANT. */
export interface TestRunner {
  /** Le script `test` du package.json, tel quel (on le lance via `npm run`). */
  script: string;
  /** Le binaire qu'il appelle, vérifié présent dans `node_modules/.bin`. */
  bin: string;
}

/**
 * Le binaire qu'un script npm lance, ou `null` si on ne peut pas le dire. Pur, et
 * exporté pour les tests : c'est ici que se décide ce qu'on refuse de deviner.
 *
 * On saute les affectations d'environnement en tête (`NODE_ENV=test jest`), et on
 * REFUSE les enveloppes (`npm run test:unit`, `bash scripts/test.sh`, `node --test`) :
 * derrière, il n'y a pas de binaire à vérifier, donc pas de moyen de savoir si
 * l'environnement est installé — et un `command not found` servi comme un échec de
 * test enverrait le modèle chercher un bug qui n'existe pas.
 */
export function testRunnerBin(script: string): string | null {
  // Le script par défaut de `npm init`. Il sort en 1 sans avoir rien testé.
  if (/no test specified/i.test(script)) return null;
  const tokens = script.trim().split(/\s+/);
  while (tokens.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
  const bin = tokens[0];
  if (!bin || !/^[\w.@/-]+$/.test(bin)) return null;
  const WRAPPERS = new Set([
    "npm", "pnpm", "yarn", "npx", "pnpx", "bun", "bunx", "deno",
    "node", "sh", "bash", "zsh", "make", "echo", "true", "exit",
  ]);
  return WRAPPERS.has(bin) ? null : bin;
}

/**
 * Le dépôt a-t-il une suite de tests RÉELLEMENT exécutable ? Un script `test` dans
 * `package.json` ne suffit pas — sans `node_modules`, son binaire n'existe pas.
 * Best-effort : tout échec, tout doute → `null`, et rien ne sera lancé.
 */
export async function detectTestRunner(host: RepoHost): Promise<TestRunner | null> {
  try {
    const raw = await host.readFile(`${host.layout.repoDir}/package.json`);
    if (!raw) return null;
    const script = (JSON.parse(raw) as { scripts?: Record<string, unknown> }).scripts?.test;
    if (typeof script !== "string" || script.trim() === "") return null;
    const bin = testRunnerBin(script);
    if (!bin) return null;
    const res = await host.exec(`test -x ./node_modules/.bin/${bin}`, {
      cwd: host.layout.repoDir,
      timeoutMs: 30_000,
    });
    return res.exitCode === 0 ? { script, bin } : null;
  } catch {
    return null;
  }
}

/**
 * LA PORTÉE DU PASSAGE, ET POURQUOI ELLE N'EST PLUS TOUJOURS « TOUT » (MIN-262).
 *
 * `"full"` lance la suite entière — c'est la garantie de MIN-251, et elle reste la
 * règle dès que le changement pèse : un test qui casse AILLEURS est précisément ce
 * qu'on cherche à voir, c'est la ligne non modifiée qui défait le changement.
 *
 * `{ related }` lance le passage CIBLÉ du runner sur les fichiers du tour. Ce n'est
 * pas « les tests de ces fichiers » : `vitest related` comme `jest
 * --findRelatedTests` remontent le GRAPHE D'IMPORTS et lancent tout test qui touche
 * ces modules, transitivement. Le « casse ailleurs » reste donc couvert partout où
 * il est traçable ; ce qu'on perd est le test qui atteint le code par un chemin que
 * l'analyse statique ne voit pas (un fixture, un fichier lu à l'exécution) — pour
 * une ligne retirée, c'est un prix qu'on paie contre 80 s de mur à chaque tour.
 *
 * `allowFullFallback` tranche le cas du runner sans mode ciblé : `true`, on paie la
 * suite entière ; `false`, on ne lance rien. L'appelant met `false` quand il n'a
 * PAS le budget d'une suite entière — sinon un tour minuscule déclencherait, par la
 * bande, exactement le passage qu'il essayait d'éviter, et sans budget pour lui.
 */
export type TestScope =
  | "full"
  | { related: readonly string[]; allowFullFallback: boolean };

/** Ce qu'un passage de tests a produit — le bloc, et ce qui a réellement tourné. */
export interface TestRunOutcome {
  /** Le bloc à servir au modèle, ou `null` si la suite est verte / illisible. */
  block: string | null;
  /** Ce qui a tourné POUR DE BON : la mesure ne doit pas lire l'intention. */
  scope: "full" | "related";
}

/**
 * La commande d'un passage CIBLÉ, ou `null` si ce runner n'en a pas.
 *
 * On sort ici du `npm run test` du projet — délibérément, et c'est la seule
 * exception : le mode ciblé est un DRAPEAU du runner, et il n'y a aucun moyen sûr
 * de le glisser dans un script qu'on ne connaît pas (`npm run test -- related`
 * donnerait `vitest run related`, qui cherche un fichier nommé « related »). On
 * appelle donc le binaire, celui-là même que `detectTestRunner` a vérifié exécutable.
 *
 * `--passWithNoTests` / `--passWithNoTests` : un tour qui touche un fichier que rien
 * ne teste doit rendre VERT, pas rouge — l'absence de test n'est pas un échec, et la
 * servir comme tel enverrait le modèle chercher un bug qui n'existe pas.
 */
export function relatedTestCommand(runner: TestRunner, files: readonly string[]): string | null {
  const paths = files.filter((f) => f.trim() !== "").map(sq);
  if (paths.length === 0) return null;
  const bin = `./node_modules/.bin/${runner.bin}`;
  if (runner.bin === "vitest") {
    return `${bin} related --run --passWithNoTests ${paths.join(" ")} 2>&1`;
  }
  if (runner.bin === "jest") {
    return `${bin} --findRelatedTests --passWithNoTests ${paths.join(" ")} 2>&1`;
  }
  return null;
}

/**
 * Lance les tests du dépôt à la portée demandée et rend ce qui en sort, ou `null`
 * s'il n'y a rien de lançable ici et maintenant.
 *
 * `CI=1` n'est pas décoratif : sans lui, un script `vitest` (sans `run`) partirait
 * en mode watch et occuperait le budget jusqu'au timeout sans jamais rendre la main.
 */
export async function testFailuresForTurn(
  host: RepoHost,
  scope: TestScope = "full",
): Promise<TestRunOutcome | null> {
  const runner = await detectTestRunner(host);
  if (!runner) return null;

  const related = scope === "full" ? null : relatedTestCommand(runner, scope.related);
  if (!related && scope !== "full" && !scope.allowFullFallback) return null;

  try {
    // Suite entière : `npm run` plutôt que le binaire — ce qui tourne est le script
    // DU PROJET, arguments compris. `--silent` coupe l'écho de npm et son propre
    // rapport d'erreur — le seul texte rendu est celui du runner.
    //
    // Et la sortie n'est PAS filtrée ici (pas de `| tail`) : sur le chemin RPC,
    // une commande qui reste muette une minute voit sa socket fermée par l'autre
    // bout (`UND_ERR_SOCKET: other side closed`, mesuré en calant ces constantes —
    // un `| tail` avait suffi à faire taire un run de suite de 2 760 tests). Un
    // runner qui écrit sa progression tient la socket ouverte ; on le laisse.
    const res = await host.exec(related ?? `npm run test --silent 2>&1`, {
      cwd: host.layout.repoDir,
      timeoutMs: related ? TEST_RELATED_TIMEOUT_MS : TEST_TIMEOUT_MS,
      env: { CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    const ran = related ? ("related" as const) : ("full" as const);
    // exitCode 0 = vert : le silence est le bon retour.
    if (res.exitCode === 0) return { block: null, scope: ran };
    return { block: formatTestFailures(res.stdout + res.stderr), scope: ran };
  } catch {
    return null;
  }
}

// ── Ce que le MODÈLE a vérifié lui-même (MIN-262) ────────────────────────────

/**
 * LE GESTE FAIT FOI.
 *
 * MIN-251 a mis la suite dans le harness parce que *ce que le harness fait enseigne
 * plus fort que ce que le prompt dit* : le modèle ne lançait jamais les tests, et
 * concluait « *that's working as expected since type checks are passing* » sur une
 * feature cassée. La leçon a porté — et le crochet est devenu un impôt : 80 s de
 * mur plus une réponse entière, sur un tour qui retire une ligne.
 *
 * Ce registre rend la décision au modèle sans rien lui faire PROMETTRE. Il ne
 * déclare pas ce qu'il compte vérifier : il vérifie, et le harness ne relance pas
 * ce qu'il vient de voir passer vert. Une déclaration serait invérifiable ; un
 * `npm test` qui sort en 0 est un fait, daté, et le harness le lit tout seul.
 *
 * L'invariant, et il tient en une phrase : **vert APRÈS la dernière édition**.
 * Toute édition périme le registre — un tour qui teste puis réédite retrouve le
 * crochet, exactement comme avant.
 */
export interface VerificationSink {
  /**
   * La dernière commande de test du dépôt que le MODÈLE a lancée et qui est sortie
   * en 0, si rien n'a été édité depuis. `null` sinon — et c'est l'état par défaut.
   */
  greenCommand: string | null;
}

export function newVerificationSink(): VerificationSink {
  return { greenCommand: null };
}

/** Toute édition périme la vérification : ce qui était vert ne l'est plus. */
export function noteVerificationStale(sink: VerificationSink): void {
  sink.greenCommand = null;
}

/**
 * Note le verdict d'une commande du modèle. Seule une commande de test RECONNUE et
 * VERTE remplit le registre ; une commande rouge le vide (le modèle a vu son échec,
 * s'il ne le corrige pas le crochet doit reparler).
 */
export function noteVerificationCommand(
  sink: VerificationSink,
  command: string,
  exitCode: number,
): void {
  if (!looksLikeTestCommand(command)) return;
  sink.greenCommand = exitCode === 0 ? command.trim() : null;
}

/** Runners qu'on reconnaît à leur nom, appelés directement ou via `npx`. */
const TEST_BINS = new Set([
  "vitest", "jest", "mocha", "ava", "tap", "playwright", "cypress",
  "pytest", "phpunit", "rspec", "gotestsum",
]);

/**
 * Cette commande lance-t-elle les tests du dépôt ? PUR, et volontairement AVARE :
 * un faux positif fait TAIRE le harness, c'est-à-dire qu'il rend le silence à un
 * tour qui n'a rien vérifié. Dans le doute, on ne reconnaît pas — le pire coût
 * d'un faux négatif est un passage de tests qu'on aurait pu s'épargner.
 *
 * D'où trois refus nets :
 * - tout ce qui rend le code de sortie MENTEUR : `||`, `;`, un pipe, un `&`. Seul
 *   le `&&` passe, parce qu'il propage l'échec — et on n'y regarde alors que le
 *   DERNIER segment, le seul dont le code de sortie soit celui de la commande.
 * - le mode watch : il ne rend jamais la main, donc il ne conclut rien.
 * - les enveloppes qu'on ne sait pas lire (`bash script.sh`, `make test`) : on ne
 *   peut pas dire ce qu'il y a derrière.
 */
export function looksLikeTestCommand(command: string): boolean {
  const raw = command.trim();
  if (raw === "") return false;
  // Un pipe rend le code du dernier maillon, `;` ne propage rien, `&` détache, une
  // substitution masque tout. Seul le `&&` survit — il propage l'échec.
  if (/[|;`]|\$\(|(?<!&)&(?!&)/.test(raw)) return false;
  if (/(^|\s)(--watch|-w)(\s|$)|--watch=|--ui(\s|$)/.test(raw)) return false;

  const last = raw.split("&&").pop()!.trim();
  const tokens = last.split(/\s+/);
  while (tokens.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
  if (tokens.length === 0) return false;

  // `npx` / `pnpm exec` / `pnpm dlx` : ce qui compte est ce qui suit.
  if (["npx", "pnpx", "bunx"].includes(tokens[0])) tokens.shift();
  else if (["pnpm", "yarn", "bun", "npm"].includes(tokens[0]) &&
           ["exec", "dlx"].includes(tokens[1] ?? "")) tokens.splice(0, 2);

  const head = tokens[0] ?? "";
  const next = (tokens[1] ?? "").replace(/^--$/, "");

  // Le script du projet : `npm test`, `npm t`, `pnpm run test:unit`, `yarn test`.
  if (["npm", "pnpm", "yarn", "bun"].includes(head)) {
    const script = next === "run" ? (tokens[2] ?? "") : next;
    return /^(test|t)(:[\w:-]+)?$/.test(script);
  }
  // `go test ./…`, `cargo test`, `python -m pytest`, `dotnet test`.
  if (["go", "cargo", "dotnet", "swift", "mix"].includes(head)) return next === "test";
  if (["python", "python3"].includes(head)) return tokens.includes("pytest");
  // Le runner appelé par son nom, avec ou sans chemin (`./node_modules/.bin/vitest`).
  return TEST_BINS.has(head.split("/").pop() ?? "");
}

/** Un échec, tel qu'on le sert : un titre normalisé et son corps. */
export interface TestFailureEntry {
  /** `fichier > suite > test` (vitest) ou le nom du test (jest). */
  title: string;
  /** Le bloc complet, titre `FAIL …` en tête. */
  text: string;
  /**
   * `"suite"` quand le fichier n'a pas pu être CHARGÉ (section « Failed Suites »
   * de vitest) : il n'y a alors ni suite ni cas, le titre vaut le fichier, et
   * l'échec pèse un fichier de test entier, pas une assertion.
   */
  kind?: "suite";
}

/** ` FAIL  lib/a.test.ts > groupe > cas` — la forme de vitest. Le `>` est ce qui
 *  la distingue du `FAIL <fichier>` de jest, qui n'est qu'un en-tête de fichier. */
const VITEST_FAIL = /^\s*(?:❯\s*)?FAIL\s+(\S.*>.*\S)\s*$/;
/**
 * ` FAIL  lib/b.test.ts [ lib/b.test.ts ]` — la forme de vitest quand le fichier
 * ne se CHARGE pas (import manquant, erreur au niveau module) : il n'a ni suite
 * ni cas à nommer, donc pas de `>`, et il ne ressemble pas non plus au
 * `FAIL <fichier>` de jest à cause du `[ … ]` qui suit. Sans ce motif, la ligne
 * ne matchait rien et tout le corps de l'erreur d'import partait à la poubelle —
 * le modèle ne voyait pas le défaut que son édition venait de causer.
 */
const VITEST_SUITE_FAIL = /^\s*(?:❯\s*)?FAIL\s+(\S+)\s+\[\s*\S+\s*\]\s*$/;
/** L'en-tête de la section des fichiers non chargeables (`⎯⎯ Failed Suites 1 ⎯⎯`). */
const VITEST_SUITES_HEADER = /^[\s⎯─=-]*Failed Suites\b/m;
/** `● groupe › cas` — la forme de jest. `● Console` n'est pas un échec. */
const JEST_FAIL = /^\s*●\s+(?!Console\b)(\S.*\S|\S)\s*$/;
/** `FAIL src/a.test.js` seul : contexte de fichier pour les `●` qui suivent. */
const JEST_FILE = /^\s*FAIL\s+(\S+)\s*$/;
/** Le récapitulatif de fin : au-delà, plus rien n'appartient à un échec. */
const SUMMARY = /^\s*(Test Files|Tests|Test Suites:|Snapshots:|Duration|Start at)\b/;
/** Extrait de code source (` 4|   expect(…)`, `  |     ^`) : le modèle sait relire
 *  le fichier, et ces lignes-là noieraient le message. */
const CODE_FRAME = /^\s*(\d+\s*\||\|\s*\^)/;
/** Les traits de séparation de vitest (`⎯⎯⎯[1/2]⎯⎯⎯`). */
const RULE = /^[\s⎯─=-]*(\[\d+\/\d+\])?[\s⎯─=-]*$/;

/** Les couleurs des runners, quand la sortie n'est pas un terminal mais le reste. */
// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g;

/**
 * Découpe une sortie de runner en échecs. Vitest et jest sont les deux formes
 * traitées ; toute autre retombe sur la queue de sortie (cf. `formatTestFailures`),
 * jamais sur le silence : une suite rouge qu'on ne sait pas lire reste une suite
 * rouge, et c'est exactement la chose que ce ticket refuse de laisser passer.
 */
export function parseTestFailures(raw: string): TestFailureEntry[] {
  const entries: TestFailureEntry[] = [];
  let body: string[] = [];
  let file = "";
  let stopped = false;

  const push = (title: string, kind?: "suite") => {
    entries.push({ title, text: `FAIL ${title}`, ...(kind ? { kind } : {}) });
    body = [];
  };

  for (const line of raw.replace(ANSI, "").split("\n")) {
    if (SUMMARY.test(line)) {
      stopped = true;
      continue;
    }
    const vitest = VITEST_FAIL.exec(line);
    if (vitest) {
      stopped = false;
      push(vitest[1]);
      continue;
    }
    const suite = VITEST_SUITE_FAIL.exec(line);
    if (suite) {
      stopped = false;
      // On ne touche PAS à `file` : ce titre nomme un fichier qui n'a pas chargé,
      // il n'ouvre pas un contexte pour des `●` de jest qui suivraient.
      push(suite[1], "suite");
      continue;
    }
    const jest = JEST_FAIL.exec(line);
    if (jest) {
      stopped = false;
      push(file ? `${file} > ${jest[1]}` : jest[1]);
      continue;
    }
    const jestFile = JEST_FILE.exec(line);
    if (jestFile) {
      // En-tête de fichier : il nomme les `●` suivants, il n'est pas un échec.
      file = jestFile[1];
      continue;
    }
    if (stopped || entries.length === 0) continue;
    const text = line.replace(/\s+$/, "");
    if (text.trim() === "" || CODE_FRAME.test(text) || RULE.test(text)) continue;
    if (body.length >= TEST_FAILURE_MAX_LINES) continue;
    body.push(text.trim());
    entries[entries.length - 1].text += `\n${text.trim()}`;
  }
  return entries;
}

/**
 * Rend le bloc servi au modèle : en-tête, échecs, cap à `TEST_FAILURES_MAX_CHARS`.
 *
 * Quand rien n'est analysable, on ne se tait PAS — on sert la queue de la sortie.
 * Une suite qui tombe à l'import, un runner qu'on ne connaît pas, une config
 * cassée : le verdict vit toujours à la fin, et un « rouge sans détail » vaut
 * infiniment mieux qu'un tour qui se termine en croyant la suite verte. Seule
 * exception, l'absence de test, qui n'est pas un échec.
 */
export function formatTestFailures(raw: string): string | null {
  const clean = raw.replace(ANSI, "");
  const entries = parseTestFailures(clean);

  // Le repli ne se contente pas de `entries.length === 0` : une sortie qui annonce
  // des « Failed Suites » dont on n'a su tirer AUCUNE entrée est le cas où l'on
  // cache un vrai échec — un seul échec d'assertion lu ailleurs suffirait sinon à
  // le désarmer, et le fichier tombé à l'import ne serait dit nulle part.
  const suitesUnread = VITEST_SUITES_HEADER.test(clean) && !entries.some((e) => e.kind === "suite");

  if (entries.length === 0 || suitesUnread) {
    if (/No test files found|no tests found/i.test(clean)) return null;
    const tail = clean.trimEnd().slice(-TEST_FAILURES_MAX_CHARS).trimStart();
    if (tail.trim() === "") return null;
    return `${TEST_HEADER}\n${tail}\n${TEST_FOOTER}`;
  }

  // Les fichiers qui n'ont pas chargé d'abord : ils pèsent un fichier de test
  // ENTIER mis à zéro, là où une assertion rouge ne pèse qu'un cas. Vitest les
  // imprime déjà en tête, mais le cap ne doit dépendre ni de cet ordre ni du
  // nombre d'assertions rouges qui les précéderaient chez un autre runner.
  const ordered = [...entries.filter((e) => e.kind === "suite"), ...entries.filter((e) => !e.kind)];

  const lines: string[] = [];
  let used = 0;
  let shown = 0;
  for (const entry of ordered) {
    // On s'arrête AVANT de dépasser : un échec coupé au milieu ferait lire au
    // modèle un chemin ou un message tronqué.
    if (used + entry.text.length + 1 > TEST_FAILURES_MAX_CHARS) break;
    lines.push(entry.text);
    used += entry.text.length + 1;
    shown++;
  }
  // Cap atteint dès le premier échec : on le sert quand même, tronqué — mieux
  // qu'un bloc vide qui dirait « tout va bien ».
  if (lines.length === 0) {
    lines.push(ordered[0].text.slice(0, TEST_FAILURES_MAX_CHARS));
    shown = 1;
  }

  const hidden = entries.length - shown;
  const more = hidden > 0 ? `\n… and ${hidden} more failing test${hidden > 1 ? "s" : ""}.` : "";
  return `${TEST_HEADER}\n${lines.join("\n")}${more}\n${TEST_FOOTER}`;
}
