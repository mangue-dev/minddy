import {
  typeErrorsForTurn,
  TYPECHECK_MIN_BUDGET_MS,
  testFailuresForTurn,
  TEST_MIN_BUDGET_MS,
} from "./diagnostics";
import { formatSelfReview, SELF_REVIEW_MIN_BUDGET_MS } from "./self-review";
import { planReviewForTurn, PLAN_REVIEW_MIN_BUDGET_MS } from "./plan-review";
import { planClosureForTurn, PLAN_CLOSURE_MIN_BUDGET_MS } from "./plan-closure";
import { turnDiff, type RepoHost } from "./repo-host";
import type { PlanWriteSink } from "./plan-closure";
import type { EmitAgentEvent } from "./agent-loop";

/**
 * LE DERNIER MOT DU HARNESS — les cinq contrôles de fin de tour, et le budget de
 * chacun (MIN-240, puis MIN-251 pour le cinquième).
 *
 * CE QUE CE MODULE CORRIGE. Les quatre blocs sont chaînés au `??` : le premier qui
 * a quelque chose à dire rend son message, la boucle le ré-injecte et rappelle le
 * crochet. Mais la boucle ne rappelait que `MAX_TURN_END_REENTRIES` fois, et cette
 * constante valait DEUX. Sur un tour qui édite du code ET écrit un plan, le
 * type-check prenait la première relance, l'auto-relecture la seconde, et les deux
 * crochets de plan n'étaient **jamais appelés une seule fois** — morts exactement
 * sur les tours où ils servent.
 *
 * Le plafond comptait des RELANCES, la chaîne compte des BLOCS. Porter la constante
 * à quatre n'aurait pas suffi : un tour qui édite, corrige, réédite consomme quatre
 * relances en type-checks et affame les mêmes crochets. Ce qui manquait est plus
 * simple — **la politique appartient au crochet**, pas à un compteur de la boucle
 * qui ne sait pas ce qu'il compte. Chaque bloc porte donc son propre budget ici, et
 * le plafond de la boucle redevient ce que son commentaire dit : un garde-fou
 * anti-runaway, jamais la contrainte qui mord.
 *
 * Trois des quatre blocs étaient déjà bornés à un passage par leur verrou. Le seul
 * qui ne l'était pas est le type-check — c'est LUI que `MAX_TURN_END_REENTRIES`
 * bornait en réalité, et c'est pour ça qu'il faut le lui rendre explicitement.
 *
 * UN SEUL EXEMPLAIRE, ET C'EST LE POINT. Ces quatre blocs vivaient copiés à
 * l'identique dans `execute.ts` et dans `vm/turn.ts`, alors que le code affirmait
 * lui-même que « la garantie ne doit pas dépendre de `loop_in_vm` ». Un invariant
 * tenu par copier-coller est un invariant qui dérive — et un bug de budget comme
 * celui-ci se serait corrigé d'un seul côté.
 *
 * LE CINQUIÈME BLOC, ET CE QU'IL RÉPARE (MIN-251). Le harness lançait `tsc` tout
 * seul et ne lançait jamais les tests. Ce qu'il FAIT enseigne plus fort que ce que
 * le prompt DIT : la seule vérification que l'agent voyait s'exécuter à sa place,
 * tour après tour, portait sur les types — il en a tiré la conclusion logique
 * (« *that's working as expected since type checks are passing* », sur une feature
 * qui ne marchait pas). `testBlock` applique à la suite de tests exactement le
 * geste du type-check, et aligne enfin ce que le harness récompense sur ce que le
 * prompt demande.
 */

/**
 * Passages de type-check qu'un tour s'accorde. DEUX, et c'est l'intention d'origine
 * (MIN-110) : le premier fait corriger, le second vérifie le correctif — puis le
 * tour se termine, erreurs restantes ou non. Un dépôt qui ne compile toujours pas
 * au troisième passage ne compilera pas au huitième, et chaque passage se paie en
 * appel modèle.
 */
export const MAX_TYPE_CHECK_PASSES = 2;

export interface TurnEndDeps {
  host: RepoHost;
  emit: EmitAgentEvent;
  /** Fichiers édités depuis le dernier type-check. VIDÉ par le type-check. */
  editedPaths: Set<string>;
  /** Le plan écrit ce tour, noté au passage des tools ticket (`watchPlanWrites`). */
  planWrites: PlanWriteSink;
  /** Baseline du diff du tour (`lastFilesSha` du checkpoint, ou la tête d'origine). */
  filesFromSha: string;
  /** Graine du verrou « le dépôt a été touché » — vient du checkpoint. */
  repoTouched: boolean;
  /** Préfixe des logs du moteur appelant (`[agent-vm]`, `[agent-execute]`). */
  logPrefix: string;
}

export interface TurnEndHook {
  /** Le crochet, tel que la boucle l'appelle (`params.onTurnEnd`). */
  run: (opts: { budgetMs: number }) => Promise<string | null>;
  /**
   * L'auto-relecture RÉCLAMÉE PAR AVANCE, pour `create_pr` (cf. `gateCreatePr`).
   * Consomme le MÊME verrou que le bloc de fin de tour : ce qui est relu ici ne
   * sera pas re-demandé après. `null` = rien à relire, ou déjà relu.
   */
  reviewBeforeSubmit: (budgetMs: number) => Promise<string | null>;
  /** `repoTouched` À JOUR — l'appelant l'écrit au checkpoint. */
  repoTouched: () => boolean;
  /**
   * Note les éditions en attente comme « dépôt touché », HORS crochet : l'appelant
   * le fait une dernière fois avant le push, là où le crochet peut n'avoir jamais
   * été atteint (tour interrompu, suspendu).
   */
  noteEdits: () => void;
}

/**
 * Le crochet de fin de tour d'un chunk (fonction) ou d'un tour (microVM). Tout son
 * état est PAR CHUNK et ne voyage pas dans le checkpoint — sauf `repoTouched`, qui
 * porte sur le TOUR et arrive donc semé.
 */
export function makeTurnEndHook(deps: TurnEndDeps): TurnEndHook {
  const { host, emit, editedPaths, planWrites, filesFromSha, logPrefix } = deps;

  /** Le tour a-t-il édité le dépôt ? Verrou LATCHÉ, là où `editedPaths` se vide à
   *  chaque type-check : après une relance, le tour a toujours édité, même si le
   *  modèle n'a plus rien touché depuis. */
  let repoTouched = deps.repoTouched;
  /** Passages de type-check consommés (cf. `MAX_TYPE_CHECK_PASSES`). */
  let typeChecks = 0;
  /** La suite de tests ne passe qu'UNE fois par tour : à ~60 s le passage, un
   *  second tuerait le budget du chunk, et un tour qui boucle sur ses tests est un
   *  tour qui ne répond jamais. Le premier passage suffit à mettre l'échec sous
   *  les yeux du modèle — c'est tout ce que ce bloc doit garantir. */
  let tested = false;
  /** L'auto-relecture ne passe qu'UNE fois : elle fait relire le tour avant la
   *  réponse, pas commenter chaque correctif qui suit. Idem pour les deux crochets
   *  de plan — ils posent une question, ils ne commentent pas la réponse. */
  let selfReviewed = false;
  let planReviewed = false;
  let planClosed = false;

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
    if (typeChecks >= MAX_TYPE_CHECK_PASSES) return null;
    if (editedPaths.size === 0 || budgetMs < TYPECHECK_MIN_BUDGET_MS) return null;
    typeChecks++;
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
   * Suite de tests de fin de tour (MIN-251). Même geste que le type-check, mêmes
   * gardes : un seul passage, rien sans édition, rien sans budget — et le même
   * best-effort de bout en bout (pas de script `test`, pas de binaire installé,
   * runner en panne → silence, jamais un tour bloqué).
   *
   * Le verrou est `repoTouched`, pas `editedPaths` : le type-check vide cette liste
   * en passant, et il passe AVANT. Un tour qui a édité doit voir ses tests, même
   * quand le modèle n'a plus rien touché depuis le check.
   */
  const testBlock = async (budgetMs: number): Promise<string | null> => {
    if (tested || !repoTouched || budgetMs < TEST_MIN_BUDGET_MS) return null;
    tested = true;
    const startedAt = Date.now();
    const block = await testFailuresForTurn(host).catch((err) => {
      console.error(`${logPrefix} turn-end tests failed:`, (err as Error).message);
      return null;
    });
    // Event `status` (neutre : invisible dans le fil, comptable en base) — c'est lui
    // qui répondra à « combien de tours se terminent en rouge ? ». `failuresShown`
    // compte les échecs SERVIS (le bloc est capé) : ce que le modèle a lu, pas ce
    // que le runner a trouvé.
    await emit("status", {
      phase: "tests",
      durationMs: Date.now() - startedAt,
      failuresShown: block ? block.split("\n").filter((l) => l.startsWith("FAIL ")).length : 0,
    });
    return block;
  };

  /**
   * Auto-relecture : le diff du tour, injecté avant que l'agent ne réponde (cf.
   * self-review.ts). Deux commandes git en LECTURE SEULE — l'index n'est jamais
   * touché, la fin de tour reste seule à stager.
   */
  const selfReviewBlock = async (
    budgetMs: number,
    at: "turn_end" | "create_pr" = "turn_end",
  ): Promise<string | null> => {
    if (selfReviewed || !repoTouched || budgetMs < SELF_REVIEW_MIN_BUDGET_MS) return null;
    selfReviewed = true;
    const startedAt = Date.now();
    const { diff, porcelain } = await turnDiff(host, filesFromSha).catch(() => ({
      diff: "",
      porcelain: "",
    }));
    const block = formatSelfReview({ diff, porcelain });
    // `at` distingue les deux moments où la MÊME relecture peut tomber (MIN-247).
    // Sans lui, la mesure ne pourrait pas dire combien de PR sont passées par la
    // porte plutôt que par la fin de tour — ni si la porte se déclenche.
    await emit("status", {
      phase: "self_review",
      at,
      durationMs: Date.now() - startedAt,
      chars: block?.length ?? 0,
    });
    return block;
  };

  /**
   * Auto-relecture du plan écrit ce tour (MIN-237) : le document revient au modèle
   * comme son diff lui revient, avec les questions qu'un relecteur poserait. Muet
   * tant qu'aucun `write_issue_plan` n'a réussi, donc gratuit sur l'écrasante
   * majorité des tours. Le déclencheur est le TOOL, pas `run.intent === "plan"` : le
   * cas courant est un run ordinaire à qui on demande un plan en cours de route.
   */
  const planReviewBlock = async (budgetMs: number): Promise<string | null> => {
    if (planReviewed || !planWrites.wrote || budgetMs < PLAN_REVIEW_MIN_BUDGET_MS) return null;
    planReviewed = true;
    const startedAt = Date.now();
    const block = await planReviewForTurn(host, planWrites.markdown).catch(() => null);
    await emit("status", {
      phase: "plan_review",
      durationMs: Date.now() - startedAt,
      chars: block?.length ?? 0,
    });
    return block;
  };

  /**
   * Contrôle de CLÔTURE du plan (MIN-236) : les identifiants du plan sont grepés
   * pour de vrai, et les fichiers qui les contiennent sans être nommés reviennent au
   * modèle. Passe APRÈS la relecture, d'où le rejeu des `edit_issue_text` dans le
   * sink : ce qui est grepé, c'est le plan tel que la relecture l'a laissé.
   */
  const planClosureBlock = async (budgetMs: number): Promise<string | null> => {
    if (planClosed || !planWrites.wrote || budgetMs < PLAN_CLOSURE_MIN_BUDGET_MS) return null;
    planClosed = true;
    const startedAt = Date.now();
    const block = await planClosureForTurn(host, planWrites.markdown).catch(() => null);
    await emit("status", {
      phase: "plan_closure",
      durationMs: Date.now() - startedAt,
      chars: block?.length ?? 0,
    });
    return block;
  };

  return {
    repoTouched: () => repoTouched,
    noteEdits,
    reviewBeforeSubmit: async (budgetMs: number) => {
      noteEdits();
      return await selfReviewBlock(budgetMs, "create_pr");
    },
    /**
     * L'ORDRE PORTE DU SENS. Les erreurs de typage passent avant tout le reste :
     * elles sont concrètes et bloquantes, et servir quoi que ce soit par-dessus un
     * dépôt qui ne compile pas noierait le seul signal qui compte — des échecs de
     * test sur un dépôt qui ne compile pas ne se lisent même pas. Les tests passent
     * ensuite, avant la relecture : un échec est un fait, un diff est une question.
     * La relecture du plan passe
     * avant sa clôture : le modèle corrige son plan, et le grep tourne ensuite sur
     * le plan corrigé — il ne rapportera pas comme oublié un fichier que la
     * relecture vient de faire nommer. L'inverse poserait deux fois la même question.
     *
     * Chaque bloc a son propre budget, donc un tour MIXTE (des éditions ET un plan)
     * les voit tous les cinq. C'est ce qui n'arrivait jamais avant MIN-240.
     */
    run: async ({ budgetMs }) => {
      noteEdits();
      return (
        (await typeCheckBlock(budgetMs)) ??
        (await testBlock(budgetMs)) ??
        (await selfReviewBlock(budgetMs)) ??
        (await planReviewBlock(budgetMs)) ??
        (await planClosureBlock(budgetMs))
      );
    },
  };
}

/**
 * LE PREMIER `create_pr` NE SOUMET PAS — il rend le diff (MIN-247, emprunté au
 * `review_on_submit` de SWE-agent).
 *
 * Le harness fait DÉJÀ relire son diff au modèle : c'est `selfReviewBlock`, et le
 * prompt l'annonce comme exécuté (« Self-review — the harness runs it, you don't »).
 * Mais il le fait en FIN DE TOUR, c'est-à-dire une fois que le modèle a rendu la
 * main — or `create_pr` pousse et ouvre la pull request AU MOMENT DE L'APPEL.
 * L'ordre réel était donc : PR ouverte, corps de PR rédigé, relecteur notifié,
 * *puis* relecture. Ce que la relecture attrape (l'erreur de JOINTURE entre deux
 * fichiers, cf. self-review.ts) arrivait après la livraison, pas avant.
 *
 * La porte ne rajoute pas un round : elle DÉPLACE celui qu'on paie déjà. La
 * relecture consomme le même verrou, donc la fin de tour ne repose pas la
 * question, et le second `create_pr` ouvre pour de bon. Un tour qui n'a rien
 * touché — une PR sur du travail poussé au tour précédent — passe du premier
 * coup : il n'y a pas de diff de ce tour à relire.
 */
export function gateCreatePr<A, R extends { result: unknown; success: boolean }>(
  handler: (args: A) => Promise<R>,
  hook: Pick<TurnEndHook, "reviewBeforeSubmit">,
  remainingMs: () => number,
): (args: A) => Promise<{ result: unknown; success: boolean; followUp?: string }> {
  return async (args) => {
    const review = await hook.reviewBeforeSubmit(remainingMs()).catch(() => null);
    if (!review) return await handler(args);
    // Le diff part en `followUp`, PAS dans le résultat : un résultat de tool est
    // capé à `TOOL_RESULT_MAX_CHARS` avec le milieu élidé, et un diff amputé de
    // son milieu ne se relit pas — c'est exactement la relecture qu'on essaie de
    // faire avoir lieu. Le résultat, lui, ne dit que le fait : rien n'est parti.
    //
    // `success: true` : rien n'a échoué. Le modèle a demandé une livraison, le
    // harness lui rend d'abord ce qu'il livre — un refus le pousserait à
    // reformuler ses arguments plutôt qu'à lire.
    return {
      result: {
        opened: false,
        note: "Nothing has been pushed and no pull request has been opened yet: the harness is handing you this turn's diff first. Read it, fix what you find, then call create_pr again — the next call goes through.",
      },
      success: true,
      followUp: review,
    };
  };
}
