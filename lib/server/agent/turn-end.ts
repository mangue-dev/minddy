import {
  typeErrorsForTurn,
  TYPECHECK_MIN_BUDGET_MS,
  testFailuresForTurn,
  TEST_MIN_BUDGET_MS,
} from "./diagnostics";
import {
  formatSelfReview,
  overwriteSitesForTurn,
  SELF_REVIEW_MIN_BUDGET_MS,
} from "./self-review";
import { planReviewForTurn, PLAN_REVIEW_MIN_BUDGET_MS } from "./plan-review";
import { planClosureForTurn, PLAN_CLOSURE_MIN_BUDGET_MS } from "./plan-closure";
import { turnDiff, type RepoHost } from "./repo-host";
import type { PlanWriteSink } from "./plan-closure";
import type { PlatformToolHandler } from "./exec-tool";
import type { EmitAgentEvent } from "./agent-loop";

/**
 * LE DERNIER MOT DU HARNESS — les contrôles de fin de tour, et le budget de
 * chacun (MIN-240, puis MIN-251 pour la suite de tests).
 *
 * CE QUE CE MODULE CORRIGE. Les blocs sont chaînés au `??` : le premier qui
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
 * OÙ CHAQUE CONTRÔLE TOMBE, ET POURQUOI ÇA COMPTE (MIN-256). Un bloc de FIN DE
 * TOUR arrive après que le modèle a écrit sa réponse : le tour repart, il répond
 * une seconde fois, et c'est cette réponse-là que l'utilisateur lit. D'où deux
 * règles qui gouvernent tout ce module.
 *
 * La première : un contrôle qui peut s'accrocher à un GESTE s'y accroche, parce
 * qu'il ne coûte alors aucune réponse de plus — le modèle le traite en cours de
 * route et écrit un seul message final, celui qui raconte le tour. C'est
 * `gateCreatePr` (le diff sur `create_pr`) et `gateWritePlan` (le plan sur
 * `write_issue_plan`). Ne restent en fin de tour que les contrôles qui ont besoin
 * de savoir qu'aucune édition ne vient plus : type-check, tests, relecture du diff.
 *
 * La seconde : ce qui sort quand même par la fin de tour part avec
 * `REENTRY_REPLY_RULE`, qui dit au modèle que sa prochaine réponse REMPLACE la
 * précédente aux yeux de l'utilisateur. Sans elle il répondait au contrôle
 * (« j'ai vérifié, le plan tient »), et le vrai résumé du tour restait enterré
 * dans la trace.
 *
 * LA SUITE DE TESTS, ET CE QU'ELLE RÉPARE (MIN-251). Le harness lançait `tsc` tout
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

/**
 * LA RÈGLE QUI ACCOMPAGNE TOUTE RÉINJECTION DE FIN DE TOUR (MIN-256).
 *
 * Un bloc de fin de tour arrive APRÈS que le modèle a écrit sa réponse. Le tour
 * repart, il répond une seconde fois — et c'est cette seconde réponse que
 * l'utilisateur lit, la première étant redescendue au rang d'étape dans le fil.
 * Or les blocs demandaient « if it is all correct, just reply », c'est-à-dire de
 * répondre AU CONTRÔLE. Le message visible d'un run de plan devenait « j'ai
 * vérifié, le plan tient, je l'ai mis à jour » : l'utilisateur ne comprend pas
 * de quoi on lui parle, et doit remonter la trace pour retrouver le vrai résumé.
 *
 * Le harness ne peut pas fabriquer ce résumé à la place du modèle — mais il peut
 * dire ce qu'il attend, et c'est la même phrase pour tous les blocs. Elle est
 * donc posée ICI, une fois, sur le chemin de la réinjection, plutôt que recopiée
 * dans chaque formateur : un bloc de plus l'héritera sans qu'on y pense.
 *
 * Elle ne va PAS sur le chemin des tools (`gateCreatePr`, `gateWritePlan`), et
 * c'est tout l'intérêt de ce chemin-là : le modèle n'y a pas encore répondu, sa
 * réponse à venir est déjà la seule.
 */
export const REENTRY_REPLY_RULE = `One last thing about the reply itself: it is the ONLY message the user will see — the one you wrote a moment ago has become a step in the trace. So do not reply about this check. Reply about the TURN: what you did, the files you touched, how you verified it. If this check changed nothing, say what you did anyway, exactly as you would have.`;

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
  /**
   * Le contrôle du plan RÉCLAMÉ SUR LE GESTE, pour `write_issue_plan` (cf.
   * `gateWritePlan`). Même verrou partagé que le bloc de fin de tour, donc la
   * question n'est jamais posée deux fois. `null` = rien à dire, ou déjà dit.
   */
  checkPlanAfterWrite: (budgetMs: number) => Promise<string | null>;
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
   *  réponse, pas commenter chaque correctif qui suit. Idem pour le contrôle de
   *  plan — il pose une question, il ne commente pas la réponse. */
  let selfReviewed = false;
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
   * self-review.ts). Commandes git en LECTURE SEULE — l'index n'est jamais
   * touché, la fin de tour reste seule à stager.
   *
   * Le diff est suivi, depuis MIN-252, des autres écritures des états qu'il
   * écrit — des `git grep`, donc toujours en lecture seule, et toujours
   * best-effort : leur panne coûte le second bloc, jamais la relecture.
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
    const overwrites = await overwriteSitesForTurn(host, diff).catch(() => []);
    const block = formatSelfReview({ diff, porcelain, overwrites });
    // `at` distingue les deux moments où la MÊME relecture peut tomber (MIN-247).
    // Sans lui, la mesure ne pourrait pas dire combien de PR sont passées par la
    // porte plutôt que par la fin de tour — ni si la porte se déclenche.
    // `overwrites` compte les SYMBOLES rapportés : c'est lui qui dira si le bloc
    // de MIN-252 parle, et à quelle fréquence.
    await emit("status", {
      phase: "self_review",
      at,
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
  const planBlock = async (
    budgetMs: number,
    at: "turn_end" | "write_plan" = "turn_end",
  ): Promise<string | null> => {
    const floor = Math.max(PLAN_REVIEW_MIN_BUDGET_MS, PLAN_CLOSURE_MIN_BUDGET_MS);
    if (planChecked || !planWrites.wrote || budgetMs < floor) return null;
    planChecked = true;
    const startedAt = Date.now();
    const [review, closure] = await Promise.all([
      planReviewForTurn(host, planWrites.markdown).catch(() => null),
      planClosureForTurn(host, planWrites.markdown).catch(() => null),
    ]);
    const block = [review, closure].filter(Boolean).join("\n\n---\n\n") || null;
    // `at` distingue les deux moments, comme pour l'auto-relecture : sans lui, la
    // mesure ne dirait pas si le contrôle tombe bien sur le geste — donc si le
    // tour a cessé de payer une réponse de plus pour lui.
    await emit("status", {
      phase: "plan_check",
      at,
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
    checkPlanAfterWrite: async (budgetMs: number) => await planBlock(budgetMs, "write_plan"),
    /**
     * L'ORDRE PORTE DU SENS. Les erreurs de typage passent avant tout le reste :
     * elles sont concrètes et bloquantes, et servir quoi que ce soit par-dessus un
     * dépôt qui ne compile pas noierait le seul signal qui compte — des échecs de
     * test sur un dépôt qui ne compile pas ne se lisent même pas. Les tests passent
     * ensuite, avant la relecture : un échec est un fait, un diff est une question.
     * Le contrôle du plan ferme la marche, et il n'arrive normalement JAMAIS
     * jusqu'ici : `gateWritePlan` l'a déjà servi sur le geste. Il reste en dernier
     * recours, pour le tour qui écrit un plan sans budget à ce moment-là.
     *
     * Chaque bloc a son propre budget, donc un tour MIXTE (des éditions ET un plan)
     * les voit tous. C'est ce qui n'arrivait jamais avant MIN-240.
     *
     * `REENTRY_REPLY_RULE` est collée au bloc qui sort, quel qu'il soit : ce qui
     * suit une réinjection est la réponse que l'utilisateur lira (MIN-256).
     */
    run: async ({ budgetMs }) => {
      noteEdits();
      const block =
        (await typeCheckBlock(budgetMs)) ??
        (await testBlock(budgetMs)) ??
        (await selfReviewBlock(budgetMs)) ??
        (await planBlock(budgetMs));
      return block ? `${block}\n\n${REENTRY_REPLY_RULE}` : null;
    },
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
  hook: Pick<TurnEndHook, "checkPlanAfterWrite">,
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
