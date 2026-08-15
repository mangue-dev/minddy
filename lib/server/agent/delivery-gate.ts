import {
  typeErrorsForTurn,
  TYPECHECK_MIN_BUDGET_MS,
  testFailuresForTurn,
  TEST_MIN_BUDGET_MS,
  TEST_RELATED_MIN_BUDGET_MS,
  newVerificationSink,
  type TestScope,
  type VerificationSink,
} from "./diagnostics";
import {
  formatSelfReview,
  overwriteSitesForTurn,
  SELF_REVIEW_MIN_BUDGET_MS,
} from "./self-review";
import { planReviewForTurn, PLAN_REVIEW_MIN_BUDGET_MS } from "./plan-review";
import { planClosureForTurn, PLAN_CLOSURE_MIN_BUDGET_MS } from "./plan-closure";
import { turnDiff, turnDiffStat, type RepoHost } from "./repo-host";
import type { PlanWriteSink } from "./plan-closure";
import type { PlatformToolHandler } from "./agent-contract";
import type { EmitAgentEvent } from "./agent-contract";

/**
 * LA PORTE DE LIVRAISON — le seul endroit où le harness vérifie quoi que ce soit
 * (MIN-263).
 *
 * CE QUE CE MODULE ÉTAIT, ET POURQUOI IL A CHANGÉ DE NATURE. Il tenait les contrôles
 * de FIN DE TOUR : le modèle écrivait sa réponse, le harness reprenait la parole
 * (type-check, tests, relecture du diff), le tour repartait, et le modèle répondait
 * une seconde fois. Trois tickets successifs ont tenté de rendre ce mécanisme
 * vivable — la règle qui interdit de répondre au contrôle (MIN-256), puis le
 * brouillon rendu au modèle parce que la règle seule ne suffisait pas (MIN-249 bis),
 * puis l'allègement des contrôles eux-mêmes (MIN-262). Aucun n'attaquait la cause :
 * **on rouvrait un tour terminé**, et tout le reste en découlait.
 *
 * CE QUE FONT LES DEUX AUTRES. Codex n'exécute rien : sa section « Validating your
 * work » est du PROMPT, et elle dit même de repousser les tests au moment de
 * finaliser, parce qu'ils coûtent du temps et ralentissent l'itération. OpenCode
 * exécute, mais toujours DANS le résultat d'un tool (les diagnostics LSP recollés
 * au résultat de l'édition). Ni l'un ni l'autre ne rouvre un tour.
 *
 * D'OÙ LA FORME D'AUJOURD'HUI, qui prend à chacun ce qu'il a de juste :
 *
 * - **Pendant le travail, le harness n'exécute RIEN.** Pas de type-check, pas de
 *   tests, pas de relecture. Le modèle itère sans impôt, et la doctrine de
 *   vérification vit dans le prompt (« du plus spécifique au plus large »).
 * - **À la livraison, il exécute tout, d'un coup.** Le premier `create_pr` d'un tour
 *   qui a édité ne pousse rien : il rend les erreurs de typage, les échecs de tests
 *   et le diff, dans le `followUp` d'un résultat de tool. Zéro réponse de plus, zéro
 *   message déclassé — c'est la forme OpenCode appliquée au geste qui compte chez
 *   nous, et le moment que Codex désigne lui-même.
 * - **Le plan garde sa porte** (`gateWritePlan`), pour la même raison : un retour
 *   attaché au geste ne coûte rien.
 *
 * LA RÈGLE À TENIR, si un contrôle s'ajoute un jour : **il s'accroche à un geste ou
 * il n'existe pas.** Un contrôle qui a besoin de rouvrir un tour pour parler est un
 * contrôle qu'on paie en réponse modèle, et l'histoire de ce fichier dit ce que ça
 * coûte.
 *
 * CE QU'ON ASSUME. Un tour qui n'ouvre pas de pull request ne voit plus aucun
 * contrôle du harness — c'est le prix de la stabilité, et c'est exactement le régime
 * de Codex. La garantie de MIN-251 (le modèle concluait « *that's working as expected
 * since type checks are passing* » sur une feature cassée) ne tient donc plus par le
 * harness pendant l'itération : elle tient par le prompt, et elle est REPRISE en dur
 * au moment où le code part vers un humain.
 */

/**
 * CE QUI FAIT UN « PETIT » TOUR (MIN-262) — celui qui n'a pas à payer la suite
 * entière quand le modèle n'a rien lancé lui-même.
 *
 * Volontairement bas, et pas calé sur une théorie : le cas qui a ouvert le ticket
 * est « une ligne à retirer » payée quatre minutes. Trois fichiers et quarante
 * lignes couvrent une correction ciblée et son test, pas une feature. Au-dessus,
 * la suite entière reprend la main sans discussion — et le fichier NEUF sort du
 * lot quelle que soit sa taille (`untracked`, cf. `turnDiffStat`).
 */
export const SMALL_TURN_MAX_FILES = 3;
export const SMALL_TURN_MAX_LINES = 40;

export interface DeliveryGateDeps {
  host: RepoHost;
  emit: EmitAgentEvent;
  /** Fichiers édités depuis le dernier type-check. VIDÉ par le type-check. */
  editedPaths: Set<string>;
  /** Le plan écrit ce tour, noté au passage des tools ticket (`watchPlanWrites`). */
  planWrites: PlanWriteSink;
  /**
   * Ce que le MODÈLE a vérifié lui-même ce tour, noté au passage de `run_command`
   * (MIN-262). Optionnel : un appelant qui ne le câble pas retrouve le crochet
   * d'avant, qui relance tout — le défaut est le comportement prudent.
   */
  verification?: VerificationSink;
  /** Baseline du diff du tour (`lastFilesSha` du checkpoint, ou la tête d'origine). */
  filesFromSha: string;
  /** Graine du verrou « le dépôt a été touché » — vient du checkpoint. */
  repoTouched: boolean;
  /**
   * LE PÉRIMÈTRE DU TOUR, quand le dépôt n'est pas à nous (MIN-358).
   *
   * Les deux lectures ci-dessous qui comparent une référence à l'ARBRE DE
   * TRAVAIL — la portée des tests et l'auto-relecture — y verraient sinon le WIP
   * de l'utilisateur : le modèle relirait le travail de quelqu'un d'autre comme
   * s'il était le sien, et `vitest related` partirait sur ses fichiers à lui.
   *
   * ABSENT en mode clone, et c'est le cas courant : là, l'arbre de travail n'a
   * jamais contenu que le travail de l'agent.
   */
  scopePaths?: () => Promise<readonly string[]>;
  /** Préfixe des logs du moteur appelant (`[agent-vm]`, `[agent-execute]`). */
  logPrefix: string;
}

export interface DeliveryGate {
  /**
   * LES CONTRÔLES DE LIVRAISON, réclamés par la porte de `create_pr` : erreurs de
   * typage, échecs de tests et diff du tour, en UN SEUL bloc. Un seul passage par
   * tour — le second `create_pr` ouvre pour de bon. `null` = rien à dire, ou déjà dit.
   */
  checkBeforeSubmit: (budgetMs: number) => Promise<string | null>;
  /**
   * Le contrôle du plan RÉCLAMÉ SUR LE GESTE, pour `write_issue_plan` (cf.
   * `gateWritePlan`). Un seul passage, donc la question n'est jamais posée deux
   * fois. `null` = rien à dire, ou déjà dit.
   */
  checkPlanAfterWrite: (budgetMs: number) => Promise<string | null>;
  /** `repoTouched` À JOUR — l'appelant l'écrit au checkpoint. */
  repoTouched: () => boolean;
  /**
   * Note les éditions en attente comme « dépôt touché » : l'appelant le fait une
   * dernière fois avant le push, là où la porte peut n'avoir jamais été franchie
   * (tour sans pull request, interrompu, suspendu).
   */
  noteEdits: () => void;
  /**
   * LE DÉPÔT A ÉTÉ TOUCHÉ AUTREMENT QUE PAR UN TOOL D'ÉDITION (MIN-286).
   *
   * `noteEdits` latche sur `editedPaths`, qui vient des tools d'écriture. Sous
   * opencode il n'y a plus de `delete_file` ni de `move_file` : un `rm`, un `mv`,
   * un `sed -i` ou un codemod passent par le SHELL, ne remplissent rien, et la
   * porte restait alors muette sur un tour qui a pourtant changé le dépôt — ni
   * type-check, ni tests, ni relecture du diff avant la pull request. L'appelant
   * qui a constaté la différence (l'état de l'arbre de travail) le dit ici.
   */
  noteRepoTouched: () => void;
}

/**
 * La porte de livraison d'un chunk (fonction) ou d'un tour (microVM). Tout son état
 * est PAR CHUNK et ne voyage pas dans le checkpoint — sauf `repoTouched`, qui porte
 * sur le TOUR et arrive donc semé.
 */
export function makeDeliveryGate(deps: DeliveryGateDeps): DeliveryGate {
  const { host, emit, editedPaths, planWrites, filesFromSha, logPrefix } = deps;
  const verification = deps.verification ?? newVerificationSink();
  /** Le périmètre, ou `undefined` quand rien ne borne (mode clone). Un périmètre
   *  qui LÈVE ne borne rien non plus : mieux vaut un diff trop large qu'une porte
   *  de livraison en panne. */
  const scope = async (): Promise<readonly string[] | undefined> => {
    if (!deps.scopePaths) return undefined;
    return await deps.scopePaths().catch(() => undefined);
  };

  /** Le tour a-t-il édité le dépôt ? Verrou LATCHÉ, là où `editedPaths` se vide à
   *  chaque type-check : après une relance, le tour a toujours édité, même si le
   *  modèle n'a plus rien touché depuis. */
  let repoTouched = deps.repoTouched;
  /**
   * LES DEUX SEULS VERROUS QUI RESTENT (MIN-263). Chaque contrôle portait le sien,
   * du temps où la fin de tour pouvait les rappeler indéfiniment ; ils sont
   * maintenant réclamés par une porte qui ne s'ouvre qu'une fois, et trois verrous
   * de plus ne borneraient rien que celui-ci ne borne déjà.
   */
  let submitChecked = false;
  let planChecked = false;

  const noteEdits = () => {
    if (editedPaths.size > 0) repoTouched = true;
  };

  /**
   * Type-check de fin de tour (MIN-110). Se tait — et coûte alors un aller-retour
   * shell de ~1 ms — dès qu'une condition manque : plus de passage disponible, rien
   * d'édité, pas de `tsconfig.json`, pas de `node_modules/.bin/tsc`, ou pas assez de
   * budget mural pour absorber un check à froid (mesuré 22 s). Best-effort de bout
   * en bout : une panne du checker n'empêche jamais un tour de se terminer.
   */
  const typeCheckBlock = async (budgetMs: number): Promise<string | null> => {
    if (editedPaths.size === 0 || budgetMs < TYPECHECK_MIN_BUDGET_MS) return null;
    const touched = [...editedPaths];
    editedPaths.clear();
    const startedAt = Date.now();
    const block = await typeErrorsForTurn(host, touched).catch((err) => {
      console.error(`${logPrefix} turn-end typecheck failed:`, (err as Error).message);
      return null;
    });
    // Event `status` (neutre : invisible dans le fil, comptable en base) — c'est lui
    // qui répond à « combien de tours se terminent avec des erreurs de typage
    // introduites par l'agent ? ». `errorsShown` compte les erreurs SERVIES (le bloc
    // est capé) : ce que le modèle a lu, pas ce que tsc a trouvé.
    await emit("status", {
      phase: "type_check",
      durationMs: Date.now() - startedAt,
      files: touched.length,
      errorsShown: block ? block.split("\n").filter((l) => /error TS\d+/.test(l)).length : 0,
    });
    return block;
  };

  /**
   * Tests de fin de tour (MIN-251), à la portée que le TOUR justifie (MIN-262).
   * Mêmes gardes que le type-check : un seul passage, rien sans édition, rien sans
   * budget — et le même best-effort de bout en bout (pas de script `test`, pas de
   * binaire installé, runner en panne → silence, jamais un tour bloqué).
   *
   * Le verrou est `repoTouched`, pas `editedPaths` : le type-check vide cette liste
   * en passant, et il passe AVANT. Un tour qui a édité doit voir ses tests, même
   * quand le modèle n'a plus rien touché depuis le check.
   *
   * TROIS ISSUES, ET L'ORDRE EST LE POINT.
   *
   * 1. **Le modèle l'a déjà fait.** S'il a lancé lui-même les tests du dépôt et
   *    qu'ils sont sortis verts sans qu'il ait réédité derrière, le harness se tait.
   *    Ce n'est pas de la confiance : c'est un fait qu'il a lu (`VerificationSink`).
   *    Relancer par-dessus coûterait 80 s de mur et une réponse entière pour
   *    apprendre ce qu'on sait déjà — c'est exactement l'impôt que ce ticket lève.
   * 2. **Petit tour, passage ciblé.** Quelques lignes sur deux ou trois fichiers,
   *    rien de neuf : le mode `related` du runner remonte le graphe d'imports et
   *    couvre le « ça casse ailleurs » partout où il est traçable, en quelques
   *    secondes au lieu de 80.
   * 3. **Sinon, la suite entière**, inchangée. C'est le cas d'un fichier neuf, d'un
   *    gros diff, d'un tour dont on n'a pas su mesurer la taille : le doute paie
   *    plein tarif, il ne se solde pas en silence.
   */
  const testBlock = async (budgetMs: number): Promise<string | null> => {
    if (!repoTouched) return null;

    // (1) Le geste du modèle fait foi. Aucun budget requis : on ne lance rien.
    if (verification.greenCommand) {
      await emit("status", {
        phase: "tests",
        scope: "model",
        durationMs: 0,
        command: verification.greenCommand,
        failuresShown: 0,
      });
      return null;
    }

    if (budgetMs < TEST_RELATED_MIN_BUDGET_MS) return null;
    const scope = await testScopeForTurn(budgetMs);
    if (!scope) return null;
    const startedAt = Date.now();
    const out = await testFailuresForTurn(host, scope).catch((err) => {
      console.error(`${logPrefix} turn-end tests failed:`, (err as Error).message);
      return null;
    });
    const block = out?.block ?? null;
    // Event `status` (neutre : invisible dans le fil, comptable en base) — c'est lui
    // qui répondra à « combien de tours se terminent en rouge ? », et depuis MIN-262
    // à « lesquels ont payé la suite entière ». `failuresShown` compte les échecs
    // SERVIS (le bloc est capé) : ce que le modèle a lu, pas ce que le runner a trouvé.
    await emit("status", {
      phase: "tests",
      scope: out?.scope ?? "none",
      durationMs: Date.now() - startedAt,
      failuresShown: block ? block.split("\n").filter((l) => l.startsWith("FAIL ")).length : 0,
    });
    return block;
  };

  /**
   * La portée que ce tour justifie, ou `null` s'il n'y a pas le budget de la payer.
   *
   * Un tour de taille INCONNUE (git muet, baseline hors de l'historique shallow) est
   * traité comme un gros tour : la mesure sert à s'épargner du travail, pas à s'en
   * dispenser sur un doute.
   */
  const testScopeForTurn = async (budgetMs: number): Promise<TestScope | null> => {
    const stat = await turnDiffStat(host, filesFromSha, await scope()).catch(() => null);
    const small =
      stat !== null &&
      stat.untracked === 0 &&
      stat.files.length > 0 &&
      stat.files.length <= SMALL_TURN_MAX_FILES &&
      stat.lines <= SMALL_TURN_MAX_LINES;
    if (small) {
      // `allowFullFallback` : un runner sans mode ciblé fait payer la suite entière,
      // mais seulement si le budget la couvre. Sinon on ne lance rien — déclencher
      // 80 s de tests avec 90 s au compteur ferait mourir le chunk sur le contrôle
      // censé l'alléger.
      return {
        related: stat.files,
        allowFullFallback: budgetMs >= TEST_MIN_BUDGET_MS,
      };
    }
    return budgetMs >= TEST_MIN_BUDGET_MS ? "full" : null;
  };

  /**
   * Auto-relecture : le diff du tour, servi avant la livraison (cf. self-review.ts).
   *
   * C'est le SEUL des trois qui parle même quand tout va bien — un diff est une
   * question, pas un verdict. C'est aussi pour ça qu'il ne peut vivre QU'ICI : en
   * fin de tour, il coûtait une réponse entière à chaque tour qui édite, y compris
   * pour trois lignes que le modèle venait d'écrire (MIN-262). Sur la porte, il ne
   * coûte rien — le modèle le lit, corrige, et rappelle `create_pr`.
   *
   * Pendant l'itération, la relecture est un geste du modèle, dosé par le prompt
   * selon ce qu'il vient de faire (`git diff`, il l'a).
   *
   * Commandes git en LECTURE SEULE — l'index n'est jamais touché, la fin de tour
   * reste seule à stager.
   *
   * Le diff est suivi, depuis MIN-252, des autres écritures des états qu'il
   * écrit — des `git grep`, donc toujours en lecture seule, et toujours
   * best-effort : leur panne coûte le second bloc, jamais la relecture.
   */
  const selfReviewBlock = async (budgetMs: number): Promise<string | null> => {
    if (!repoTouched || budgetMs < SELF_REVIEW_MIN_BUDGET_MS) return null;
    const startedAt = Date.now();
    const { diff, porcelain } = await turnDiff(host, filesFromSha, await scope()).catch(() => ({
      diff: "",
      porcelain: "",
    }));
    const overwrites = await overwriteSitesForTurn(host, diff).catch(() => []);
    const block = formatSelfReview({ diff, porcelain, overwrites });
    // `overwrites` compte les SYMBOLES rapportés : c'est lui qui dira si le bloc
    // de MIN-252 parle, et à quelle fréquence.
    await emit("status", {
      phase: "self_review",
      at: "create_pr",
      durationMs: Date.now() - startedAt,
      chars: block?.length ?? 0,
      overwrites: overwrites.length,
    });
    return block;
  };

  /**
   * LE CONTRÔLE DU PLAN, EN UN SEUL BLOC ET SUR LE GESTE (MIN-236, MIN-237, puis
   * MIN-256 pour la fusion et le déplacement).
   *
   * Deux choses, indissociables et posées ensemble parce que le modèle y répond
   * d'un seul geste : le plan qu'il vient d'écrire, relu (`planReviewForTurn`), et
   * les fichiers que ses identifiants touchent sans qu'il les nomme
   * (`planClosureForTurn`). La relecture parle toujours, la clôture seulement
   * quand elle a trouvé quelque chose.
   *
   * POURQUOI FUSIONNÉS. Séparés, ils coûtaient DEUX réinjections de fin de tour,
   * donc deux réponses de plus — et sur un run de plan, la dernière, celle que
   * l'utilisateur lit, ne parlait plus que du contrôle. Le prix de la fusion est
   * connu et assumé : la clôture grep le plan tel qu'il a été ÉCRIT, plus tel que
   * la relecture l'a laissé, donc elle peut nommer un fichier que le modèle
   * s'apprêtait à ajouter. Un faux « oublié » de plus dans un bloc qui s'annonce
   * déjà comme une observation, contre une réponse finale qui redevient lisible.
   *
   * Muet tant qu'aucun `write_issue_plan` n'a réussi, donc gratuit sur l'écrasante
   * majorité des tours. Le déclencheur est le TOOL, pas `run.intent === "plan"` : le
   * cas courant est un run ordinaire à qui on demande un plan en cours de route.
   */
  const planBlock = async (budgetMs: number): Promise<string | null> => {
    const floor = Math.max(PLAN_REVIEW_MIN_BUDGET_MS, PLAN_CLOSURE_MIN_BUDGET_MS);
    if (planChecked || !planWrites.wrote || budgetMs < floor) return null;
    planChecked = true;
    const startedAt = Date.now();
    const [review, closure] = await Promise.all([
      planReviewForTurn(host, planWrites.markdown).catch(() => null),
      planClosureForTurn(host, planWrites.markdown).catch(() => null),
    ]);
    const block = [review, closure].filter(Boolean).join("\n\n---\n\n") || null;
    await emit("status", {
      phase: "plan_check",
      at: "write_plan",
      durationMs: Date.now() - startedAt,
      chars: block?.length ?? 0,
    });
    return block;
  };

  /**
   * LES TROIS CONTRÔLES, SERVIS ENSEMBLE, AU MOMENT DE LIVRER (MIN-263).
   *
   * L'ORDRE PORTE DU SENS, et c'est le même qu'avant : les erreurs de typage
   * d'abord — elles sont concrètes et bloquantes, et des échecs de test sur un dépôt
   * qui ne compile pas ne se lisent même pas. Les échecs de test ensuite : un échec
   * est un fait, un diff est une question. Le diff ferme la marche.
   *
   * Ils partent en UN SEUL bloc, là où la fin de tour les servait un par un : elle
   * n'avait pas le choix (chaque bloc coûtait une réponse, donc il fallait les
   * étaler), la porte l'a — un `followUp` de tool ne coûte rien, et le modèle traite
   * les trois d'un même geste avant de rappeler `create_pr`.
   *
   * UN SEUL PASSAGE PAR TOUR : le second `create_pr` ouvre pour de bon, même si le
   * modèle n'a rien corrigé. C'est délibéré — une porte qui re-vérifie à chaque
   * tentative est une porte qui peut refuser de s'ouvrir, et un agent qui ne peut
   * plus livrer est pire qu'un agent qui livre du rouge en le disant.
   */
  const submitChecks = async (budgetMs: number): Promise<string | null> => {
    noteEdits();
    if (submitChecked || !repoTouched) return null;
    submitChecked = true;
    const blocks = [
      await typeCheckBlock(budgetMs),
      await testBlock(budgetMs),
      await selfReviewBlock(budgetMs),
    ].filter(Boolean);
    return blocks.length > 0 ? blocks.join("\n\n---\n\n") : null;
  };

  return {
    repoTouched: () => repoTouched,
    noteEdits,
    noteRepoTouched: () => {
      repoTouched = true;
    },
    checkBeforeSubmit: submitChecks,
    checkPlanAfterWrite: async (budgetMs: number) => await planBlock(budgetMs),
  };
}

/**
 * LE CONTRÔLE DU PLAN SUR LE GESTE, PAS APRÈS LA RÉPONSE (MIN-256).
 *
 * Même patron que `gateCreatePr`, et pour une raison de plus. Servi en fin de
 * tour, le contrôle arrivait après que le modèle avait écrit sa réponse : le tour
 * repartait, il répondait une seconde fois, et c'est cette réponse-là — « j'ai
 * vérifié, le plan tient » — que l'utilisateur lisait, le vrai résumé étant
 * redescendu au rang d'étape dans le fil. Accroché au `write_issue_plan`, le même
 * contrôle arrive AVANT toute réponse : le modèle corrige, puis écrit son unique
 * message final, qui raconte le tour.
 *
 * À la différence de `gateCreatePr`, la porte ne RETIENT rien — le plan est bel et
 * bien écrit, et il doit l'être : c'est le document qu'on relit. Seul le retour
 * s'ajoute, en `followUp`, parce qu'un résultat de tool est élidé par le milieu et
 * qu'un plan amputé de son milieu ne se relit pas.
 *
 * Best-effort : une panne du contrôle ne doit jamais empêcher un plan d'être écrit.
 */
export function gateWritePlan(
  handler: PlatformToolHandler,
  hook: Pick<DeliveryGate, "checkPlanAfterWrite">,
  remainingMs: () => number,
): PlatformToolHandler {
  return async (name, args) => {
    const out = await handler(name, args);
    if (name !== "write_issue_plan" || !out.success) return out;
    const followUp = await hook.checkPlanAfterWrite(remainingMs()).catch(() => null);
    return followUp ? { ...out, followUp } : out;
  };
}

/**
 * LE PREMIER `create_pr` NE SOUMET PAS — il rend les contrôles (MIN-247 pour le
 * diff, emprunté au `review_on_submit` de SWE-agent ; MIN-263 pour les deux autres).
 *
 * `create_pr` pousse et ouvre la pull request AU MOMENT DE L'APPEL. Sans porte,
 * l'ordre réel serait : PR ouverte, corps rédigé, relecteur notifié, *puis*
 * vérification — ce que la relecture attrape (l'erreur de JOINTURE entre deux
 * fichiers, cf. self-review.ts) arriverait après la livraison.
 *
 * La porte ne rajoute pas un round : elle DÉPLACE celui qu'on paie déjà, et depuis
 * que la fin de tour n'exécute plus rien, c'est le SEUL endroit où le harness
 * vérifie le code. Le second `create_pr` ouvre pour de bon, même si le modèle n'a
 * rien corrigé : une porte qui peut refuser indéfiniment est une porte qui empêche
 * de livrer. Un tour qui n'a rien touché — une PR sur du travail poussé au tour
 * précédent — passe du premier coup : il n'y a rien de ce tour à vérifier.
 */
export function gateCreatePr<A, R extends { result: unknown; success: boolean }>(
  handler: (args: A) => Promise<R>,
  hook: Pick<DeliveryGate, "checkBeforeSubmit">,
  remainingMs: () => number,
): (args: A) => Promise<{ result: unknown; success: boolean; followUp?: string }> {
  return async (args) => {
    const checks = await hook.checkBeforeSubmit(remainingMs()).catch(() => null);
    if (!checks) return await handler(args);
    // Les contrôles partent en `followUp`, PAS dans le résultat : un résultat de
    // tool est capé à `TOOL_RESULT_MAX_CHARS` avec le milieu élidé, et un diff
    // amputé de son milieu ne se relit pas — c'est exactement la relecture qu'on
    // essaie de faire avoir lieu. Le résultat, lui, ne dit que le fait.
    //
    // `success: true` : rien n'a échoué. Le modèle a demandé une livraison, le
    // harness lui rend d'abord ce qu'il livre — un refus le pousserait à
    // reformuler ses arguments plutôt qu'à lire.
    return {
      result: {
        opened: false,
        note: "Nothing has been pushed and no pull request has been opened yet: the harness is handing you this turn's checks first — type errors, failing tests and the diff. Read them, fix what you find, then call create_pr again — the next call goes through.",
      },
      success: true,
      followUp: checks,
    };
  };
}
