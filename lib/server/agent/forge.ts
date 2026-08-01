import "server-only";

import type { RepoProviderId } from "@/lib/repo-providers";
import * as github from "./pr";
import * as gitlab from "./mr";
import { GithubApiError } from "./pr";
import { GitlabApiError } from "./mr";
import type {
  PullRequestRef,
  PullRequestFile,
  PullRequestComment,
  PullRequestReviewComment,
  PullRequestReviewMessage,
  PullRequestReviewSummary,
  ReviewCommentReaction,
  ReviewReactionContent,
  ReviewSubmission,
  ReviewThreadState,
  ReviewVerdict,
} from "./pr";
import type { ChecksSummary } from "./checks-core";

/**
 * Abstraction provider des opérations PR/MR de l'agent (MIN-69). Chaque provider
 * expose la MÊME surface (les signatures de `pr.ts`, types neutres compris) ; les
 * appelants résolvent le client via `forgeFor(target.provider)` au lieu d'importer
 * `pr.ts` en direct. « PR » reste le vocabulaire neutre côté code — une merge
 * request GitLab est présentée sous les mêmes types (numéro = `iid`).
 *
 * Les modules concrets gardent chacun leur classe d'erreur (`GithubApiError` /
 * `GitlabApiError`, toutes deux porteuses d'un `status` HTTP) : `isForgeApiError`
 * est le test commun des routes. Pas de classe mère partagée — elle créerait un
 * cycle d'import (forge → pr → forge) piégeux à l'évaluation des modules.
 */

/** Erreur d'API provider (GitHub ou GitLab), toujours porteuse du status HTTP. */
export type ForgeApiError = GithubApiError | GitlabApiError;

export function isForgeApiError(err: unknown): err is ForgeApiError {
  return err instanceof GithubApiError || err instanceof GitlabApiError;
}

/** Méthodes de merge offertes par une forge (MIN-138). */
export type MergeMethod = "merge" | "squash" | "rebase";

/**
 * Surface commune des opérations PR/MR. Volontairement PLUS ÉTROITE que les
 * modules concrets : pas de `commitId` (chaque provider résout sa propre ancre
 * de review), pas de commentaire multi-lignes (option GitHub que GitLab
 * ignorerait en silence), pas de `findOpen*` (détail interne des `ensure*`).
 * N'élargir qu'avec une implémentation réelle des deux côtés.
 *
 * La méthode de merge, elle, a rejoint la surface (MIN-138) : elle a désormais
 * une implémentation réelle des deux côtés — mais pas le même MENU, d'où
 * `mergeMethods`, que l'UI lit pour ne proposer que ce que la forge sait faire.
 *
 * ## Qui signe quoi (MIN-144, MIN-145)
 *
 * **Un geste d'humain porte le nom de l'humain, un geste automatisé de minddy
 * porte le nom de minddy.** La forge ne tranche pas : elle écrit sous le `token`
 * qu'on lui passe. C'est donc l'APPELANT qui porte la règle, et cette table dit
 * laquelle des deux identités chaque geste doit lui donner — le garde-fou qui
 * manquait quand la réaction emoji est restée un an sur le mauvais compte.
 *
 * | Geste | Identité | Porteur |
 * | --- | --- | --- |
 * | `ensurePullRequest`, `reopenPullRequest` (execute.ts) | agent | `target.token` |
 * | `deleteBranch` (branch-cleanup.ts) | agent | `target.token` |
 * | commentaires de la review de Numo (pr-ai-review.ts) | agent | `scope.call` |
 * | `mergePullRequest`, `closePullRequest`, `markReadyForReview` | humain | `actorCall` |
 * | `submitReview` (le verdict de la personne) | humain | `actorCall` |
 * | `createPullRequestComment`, `createPullRequestReviewComment`, `replyToPullRequestReviewComment` depuis l'UI PR | humain | `actorCall` |
 * | `setReviewThreadResolved` | humain | `actorCall` |
 * | `setReviewCommentReaction`, `setConversationReaction` | humain | `actorCall` + `login` |
 *
 * Les trois méthodes de commentaire servent les DEUX identités : c'est le geste
 * qui décide, pas la méthode. Numo relit sous le bot ; la même méthode, appelée
 * depuis le panneau PR, part du compte de la personne.
 *
 * Les LECTURES, elles, restent toutes sur le token d'installation : tout membre
 * du projet minddy doit voir la PR sans compte git connecté. La seule exception
 * est `listReviewCommentReactions`, dont le résultat dépend de qui regarde.
 */
export interface Forge {
  provider: RepoProviderId;
  /** Méthodes de merge réellement offertes — GitLab fixe sa stratégie au niveau
      du projet, seul `squash` y est un paramètre de l'appel merge. */
  mergeMethods: readonly MergeMethod[];
  /** Noms des branches du dépôt (picker de branche de base au lancement). */
  listBranches(opts: { token: string; repoFullName: string }): Promise<string[]>;
  /** TOUTES les PR/MR du dépôt, tous états — le ménage des branches d'agent
      (MIN-102) a besoin des fermées pour choisir ET des ouvertes pour protéger.
      `truncated` : la pagination a été coupée, la liste n'est pas exhaustive. */
  listPullRequests(opts: {
    token: string;
    repoFullName: string;
  }): Promise<{ pulls: PullRequestRef[]; truncated: boolean }>;
  /** Supprime une branche distante. `"already-gone"` (et non une erreur) quand
      la référence n'existe déjà plus : rejouer un ménage n'est pas une panne. */
  deleteBranch(opts: {
    token: string;
    repoFullName: string;
    branch: string;
  }): Promise<"deleted" | "already-gone">;
  ensurePullRequest(opts: {
    token: string;
    repoFullName: string;
    head: string;
    base: string;
    title: string;
    body: string;
  }): Promise<PullRequestRef>;
  getPullRequest(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestRef>;
  listPullRequestFiles(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestFile[]>;
  /** Diff CUMULÉ de la branche de travail contre sa base — la vue diff d'une
      session SANS PR (mêmes fichiers/patches que listPullRequestFiles, depuis le
      merge base). 404 provider si la branche n'a pas (encore) été poussée.
      `url` : la page compare web du provider (liens « voir sur … »). */
  compareBranches(opts: {
    token: string;
    repoFullName: string;
    base: string;
    head: string;
  }): Promise<{ files: PullRequestFile[]; url: string | null }>;
  /** Merge base de deux BRANCHES — le pendant sans PR de getMergeBaseSha, base
      du dépliage de contexte de la vue diff d'une session sans PR. */
  getBranchesMergeBaseSha(opts: {
    token: string;
    repoFullName: string;
    base: string;
    head: string;
  }): Promise<string>;
  /** Base du diff servi : merge base VIVANT (GitHub, diff recalculé à la volée)
      ou `diff_refs.base_sha` PERSISTÉ (GitLab, diff figé au dernier push). */
  getMergeBaseSha(opts: {
    token: string;
    repoFullName: string;
    number: number;
    base: string;
    head: string;
  }): Promise<string>;
  getFileAtRef(opts: {
    token: string;
    repoFullName: string;
    path: string;
    ref: string;
  }): Promise<string | null>;
  mergePullRequest(opts: {
    token: string;
    repoFullName: string;
    number: number;
    /** Doit appartenir à `mergeMethods` — l'appelant valide, la forge n'invente pas. */
    method?: MergeMethod;
  }): Promise<void>;
  /**
   * Soumet une review formelle. `published: "comment"` en retour = la forge a
   * refusé de publier le verdict (auto-review) et il est parti en commentaire :
   * l'appelant doit le dire à l'utilisateur, et enregistrer le verdict RÉEL de
   * son côté. C'est le cas normal des PR de Numo, pas un cas dégradé.
   *
   * Un texte SANS verdict à porter — le verdict « commenter », ou le repli
   * ci-dessus — atterrit dans le FIL de la PR chez les deux providers, jamais
   * dans un événement de review : c'est le seul endroit que `listPullRequestComments`
   * relit, donc le seul où minddy saura le montrer (cf. `submitPullRequestReview`).
   */
  submitReview(opts: {
    token: string;
    repoFullName: string;
    number: number;
    verdict: ReviewVerdict;
    body: string;
  }): Promise<ReviewSubmission>;
  /** Décompte d'approbations, déjà réduit : la règle « dernier verdict par
      utilisateur » est un détail GitHub (GitLab tient la liste courante), elle
      n'a pas à remonter jusqu'aux appelants. */
  listReviews(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestReviewSummary>;
  /** Le TEXTE des reviews déjà soumises (MIN-141) — ce que le décompte ne dit
      pas, et que le fil de la PR ne porte pas (`pulls/{n}/reviews`). Vide côté
      GitLab, où il n'existe pas d'objet review : tout ce qui s'y écrit est une
      note, déjà servie par `listPullRequestComments`. */
  listReviewMessages(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestReviewMessage[]>;
  /** Checks CI. `number` ET `sha` sont demandés parce que les deux forges
      n'adressent pas la même chose : GitHub interroge le COMMIT de tête, GitLab
      les pipelines de la MR. Chaque implémentation ignore le champ qu'elle
      n'utilise pas (même arrangement que `getBranchesMergeBaseSha`). */
  listChecks(opts: {
    token: string;
    repoFullName: string;
    number: number;
    sha: string;
  }): Promise<ChecksSummary>;
  /** Brouillon → prêt pour la review. `nodeId` n'est lu que par GitHub (clé de
      la mutation GraphQL) ; GitLab retire le préfixe `Draft:` du titre. */
  markReadyForReview(opts: {
    token: string;
    repoFullName: string;
    number: number;
    nodeId?: string;
  }): Promise<void>;
  closePullRequest(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<void>;
  reopenPullRequest(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestRef>;
  listPullRequestComments(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestComment[]>;
  createPullRequestComment(opts: {
    token: string;
    repoFullName: string;
    number: number;
    body: string;
  }): Promise<PullRequestComment>;
  listPullRequestReviewComments(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<PullRequestReviewComment[]>;
  /** Ancre résolue PAR le provider : tête de PR relue à chaud (GitHub) ou
      diff_refs (GitLab). Ligne hors diff → erreur 422 (« lineNotInDiff »). */
  createPullRequestReviewComment(opts: {
    token: string;
    repoFullName: string;
    number: number;
    body: string;
    path: string;
    line: number;
    side: "LEFT" | "RIGHT";
  }): Promise<PullRequestReviewComment>;
  replyToPullRequestReviewComment(opts: {
    token: string;
    repoFullName: string;
    number: number;
    commentId: number;
    body: string;
  }): Promise<PullRequestReviewComment>;
  /**
   * État des FILS de review (MIN-139), à part de leurs commentaires parce que
   * les deux forges le servent ailleurs : GraphQL côté GitHub (la REST des
   * commentaires ignore jusqu'à l'existence du fil), les discussions déjà lues
   * côté GitLab. L'appariement se fait par `rootCommentId`, la clé de
   * `groupReviewThreads` — aucun appelant n'a à connaître ces chemins.
   *
   * Un appelant qui ne lit que les commentaires reste valide : les fils sont
   * alors d'état INCONNU, et l'UI n'y propose rien plutôt que d'annoncer
   * « ouvert » sans le savoir.
   */
  listReviewThreads(opts: {
    token: string;
    repoFullName: string;
    number: number;
  }): Promise<ReviewThreadState[]>;
  /** Résout / rouvre un fil. `threadId` vient de `listReviewThreads` et n'est
      lisible que par la forge qui l'a émis (node id GraphQL / id de discussion). */
  setReviewThreadResolved(opts: {
    token: string;
    repoFullName: string;
    number: number;
    threadId: string;
    resolved: boolean;
  }): Promise<void>;
  /**
   * Réactions emoji des commentaires de review (MIN-139), à part elles aussi :
   * GitHub les rend pour toute la PR d'un coup (GraphQL `reactionGroups`, avec le
   * « ai-je déjà réagi » que la REST tait), GitLab seulement note par note.
   *
   * D'où `commentIds`, que **GitHub ignore** : c'est GitLab qui en a besoin, et
   * l'appelant les a déjà sous la main puisqu'il vient de lire les commentaires.
   * Les lui redemander évite à l'implémentation GitLab une troisième traversée
   * des discussions.
   *
   * C'est la seule LECTURE dont le résultat dépend de qui regarde (MIN-145) :
   * `mine` veut dire « MOI, l'humain connecté, j'ai réagi » des deux côtés. Il ne
   * se lit pas dans les données, il se déduit du token qui lit — d'où
   * `viewerIsActor`, que l'appelant met à faux quand il retombe sur le token
   * d'installation. `mine` vaut alors false partout : le « viewer » est le bot,
   * et allumer ses chips ferait croire à chacun qu'il a posé une réaction que
   * personne n'a posée. Les COMPTES, eux, restent justes dans les deux cas.
   */
  listReviewCommentReactions(opts: {
    token: string;
    repoFullName: string;
    number: number;
    commentIds: number[];
    /** Le `token` ci-dessus est-il celui de l'acteur humain ? Sinon, `mine: false`. */
    viewerIsActor: boolean;
  }): Promise<ReviewCommentReaction[]>;
  /**
   * Pose (`on`) ou retire une réaction sur UN commentaire de review — geste
   * HUMAIN, donc token de l'acteur (cf. la table d'identité plus haut).
   *
   * `login` est le compte de cet acteur, et **GitLab l'ignore** : le retrait
   * GitHub doit retrouver LA réaction à supprimer parmi celles du commentaire
   * (la REST ne sait pas retirer « la mienne »), là où GitLab dérive la sienne du
   * token. Même arrangement que `commentIds`, que GitHub ignore.
   */
  setReviewCommentReaction(opts: {
    token: string;
    repoFullName: string;
    number: number;
    commentId: number;
    content: ReviewReactionContent;
    on: boolean;
    login: string | null;
  }): Promise<void>;
  /**
   * Réactions du FIL de conversation (MIN-147) : le corps de la PR — sous
   * `PR_BODY_COMMENT_ID` — et tous ses commentaires. Le pendant exact des deux
   * méthodes de review ci-dessus, sur l'autre surface : chez GitHub une PR est
   * une issue, et ni ses messages ni son corps ne vivent là où vivent les
   * commentaires de review.
   *
   * Côté GitLab il n'y a qu'une sorte de note, et les awards s'y adressent
   * pareil : les deux paires y sont littéralement la même implémentation.
   */
  listConversationReactions(opts: {
    token: string;
    repoFullName: string;
    number: number;
    commentIds: number[];
    viewerIsActor: boolean;
  }): Promise<ReviewCommentReaction[]>;
  setConversationReaction(opts: {
    token: string;
    repoFullName: string;
    number: number;
    commentId: number;
    content: ReviewReactionContent;
    on: boolean;
    login: string | null;
  }): Promise<void>;
}

const githubForge: Forge = {
  provider: "github",
  mergeMethods: ["squash", "merge", "rebase"],
  listBranches: github.listBranches,
  listPullRequests: github.listPullRequests,
  deleteBranch: github.deleteBranch,
  ensurePullRequest: github.ensurePullRequest,
  getPullRequest: github.getPullRequest,
  listPullRequestFiles: github.listPullRequestFiles,
  compareBranches: github.compareBranches,
  // Le compare GitHub est déjà branche-à-branche : la même fonction sert les
  // deux surfaces (le `number` de l'interface n'y est pas utilisé).
  getBranchesMergeBaseSha: github.getMergeBaseSha,
  getMergeBaseSha: github.getMergeBaseSha,
  getFileAtRef: github.getFileAtRef,
  mergePullRequest: github.mergePullRequest,
  submitReview: github.submitPullRequestReview,
  listReviews: github.listPullRequestReviews,
  listReviewMessages: github.listPullRequestReviewMessages,
  listChecks: github.listPullRequestChecks,
  // La mutation GraphQL n'adresse la PR que par son `node_id` : sans lui (une PR
  // lue par l'endpoint *list*, qui ne le sert pas), on refuse net plutôt que de
  // laisser GitHub répondre une erreur GraphQL opaque.
  markReadyForReview: async (opts) => {
    if (!opts.nodeId) {
      throw new GithubApiError("Pull request has no GraphQL id", 409);
    }
    return github.markPullRequestReadyForReview({ token: opts.token, nodeId: opts.nodeId });
  },
  closePullRequest: github.closePullRequest,
  reopenPullRequest: github.reopenPullRequest,
  listPullRequestComments: github.listPullRequestComments,
  createPullRequestComment: github.createPullRequestComment,
  listPullRequestReviewComments: github.listPullRequestReviewComments,
  // GitHub exige `commit_id` = la TÊTE de la PR, relue à chaud à chaque envoi
  // (entre l'ouverture de la vue et l'envoi, l'agent a pu pousser — cf. pr.ts).
  createPullRequestReviewComment: async (opts) => {
    const pr = await github.getPullRequest({
      token: opts.token,
      repoFullName: opts.repoFullName,
      number: opts.number,
    });
    if (!pr.headSha) {
      throw new GithubApiError("Pull request has no head commit", 409);
    }
    return github.createPullRequestReviewComment({ ...opts, commitId: pr.headSha });
  },
  replyToPullRequestReviewComment: github.replyToPullRequestReviewComment,
  listReviewThreads: github.listPullRequestReviewThreads,
  // Le fil s'adresse par son node id GraphQL, qui porte à lui seul le dépôt et
  // la PR : le triplet de l'interface n'a rien à y faire.
  setReviewThreadResolved: (opts) =>
    github.setPullRequestReviewThreadResolved({
      token: opts.token,
      threadId: opts.threadId,
      resolved: opts.resolved,
    }),
  // La requête part de la PR : les ids de commentaires ne lui servent à rien.
  listReviewCommentReactions: github.listPullRequestReviewCommentReactions,
  setReviewCommentReaction: (opts) =>
    github.setPullRequestReviewCommentReaction({
      token: opts.token,
      repoFullName: opts.repoFullName,
      commentId: opts.commentId,
      content: opts.content,
      on: opts.on,
      login: opts.login,
    }),
  // Une requête pour tout le fil, corps compris : les ids ne lui servent à rien.
  listConversationReactions: github.listPullRequestConversationReactions,
  setConversationReaction: github.setPullRequestConversationReaction,
};

const gitlabForge: Forge = {
  provider: "gitlab",
  // Pas de `rebase` : GitLab règle la stratégie au niveau du projet, seul le
  // squash est un paramètre de l'appel merge.
  mergeMethods: ["squash", "merge"],
  listBranches: gitlab.listBranches,
  listPullRequests: gitlab.listPullRequests,
  deleteBranch: gitlab.deleteBranch,
  ensurePullRequest: gitlab.ensureMergeRequest,
  getPullRequest: gitlab.getMergeRequest,
  listPullRequestFiles: gitlab.listMergeRequestChanges,
  compareBranches: gitlab.compareBranches,
  getBranchesMergeBaseSha: gitlab.getBranchesMergeBaseSha,
  getMergeBaseSha: gitlab.getMergeBaseSha,
  getFileAtRef: gitlab.getFileAtRef,
  mergePullRequest: gitlab.mergeMergeRequest,
  submitReview: gitlab.submitMergeRequestReview,
  listReviews: gitlab.listMergeRequestApprovals,
  listReviewMessages: gitlab.listMergeRequestReviewMessages,
  listChecks: gitlab.listMergeRequestChecks,
  markReadyForReview: gitlab.markMergeRequestReadyForReview,
  closePullRequest: gitlab.closeMergeRequest,
  reopenPullRequest: gitlab.reopenMergeRequest,
  listPullRequestComments: gitlab.listMergeRequestNotes,
  createPullRequestComment: gitlab.createMergeRequestNote,
  listPullRequestReviewComments: gitlab.listMergeRequestDiffComments,
  createPullRequestReviewComment: gitlab.createMergeRequestDiffComment,
  replyToPullRequestReviewComment: gitlab.replyToMergeRequestDiffComment,
  listReviewThreads: gitlab.listMergeRequestDiffThreads,
  setReviewThreadResolved: gitlab.setMergeRequestDiscussionResolved,
  listReviewCommentReactions: gitlab.listMergeRequestNoteAwards,
  setReviewCommentReaction: gitlab.setMergeRequestNoteAward,
  // Une note est une note : le fil de conversation et la review passent par les
  // MÊMES appels, `awardsUrl` faisant seule la part du corps de la MR.
  listConversationReactions: gitlab.listMergeRequestNoteAwards,
  setConversationReaction: gitlab.setMergeRequestNoteAward,
};

/** Client du provider — la valeur vient de `RepoCloneTarget.provider` (DB). */
export function forgeFor(provider: RepoProviderId): Forge {
  return provider === "gitlab" ? gitlabForge : githubForge;
}
