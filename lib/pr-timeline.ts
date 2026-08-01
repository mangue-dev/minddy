/**
 * L'ACTIVITÉ d'une pull request — tout ce qui lui est arrivé et qui n'est pas un
 * message : reviews soumises, commits poussés, labels, assignations, demandes de
 * review, renommages, passages brouillon ↔ prête, fermeture, réouverture, merge.
 *
 * Volontairement PUR et partagé client/serveur, comme `pr-review-threads` : les
 * deux forges décrivent ces faits dans des formes très différentes (événements
 * typés côté GitHub, notes système en anglais côté GitLab), et c'est ici que la
 * traduction en un vocabulaire unique se fait — une fois, pas dans chaque vue.
 *
 * Ce qui n'entre PAS dans cette liste : les messages du fil, déjà servis par
 * `listPullRequestComments`. Les rendre ici les compterait deux fois.
 */

import { mergeCommitAuthors, type CommitAuthor } from "./commit-authors";

/**
 * Les faits que minddy sait nommer. Un événement que la forge décrit mais que
 * cette liste ne couvre pas se range sous `system` : il garde son texte d'origine
 * plutôt que de disparaître — mieux vaut une phrase de GitLab qu'un trou dans
 * l'activité (c'est aussi le repli de toutes les notes système qu'aucun motif ne
 * reconnaît).
 *
 * `reviewed` est le seul qui porte du CONTENU : une review soumise a un verdict
 * ET, souvent, un corps. Elle se rend comme un message, pas comme une ligne.
 */
export type PrTimelineKind =
  | "reviewed"
  | "review_dismissed"
  | "review_requested"
  | "review_request_removed"
  | "committed"
  | "force_pushed"
  | "branch_deleted"
  | "branch_restored"
  | "labeled"
  | "unlabeled"
  | "assigned"
  | "unassigned"
  | "renamed"
  | "milestoned"
  | "demilestoned"
  | "ready_for_review"
  | "converted_to_draft"
  | "merged"
  | "closed"
  | "reopened"
  | "referenced"
  | "cross_referenced"
  | "locked"
  | "unlocked"
  | "auto_merge_enabled"
  | "auto_merge_disabled"
  | "system";

/** Verdict d'une review soumise — le vocabulaire de `reviewed`. */
export type PrReviewState = "approved" | "changes_requested" | "commented" | "dismissed";

/**
 * Un fait de l'activité de la PR, forge-agnostique.
 *
 * `id` est une CHAÎNE et non un nombre : GitHub numérote ses événements, GitLab
 * ses notes, et les commits n'ont qu'un SHA — l'unicité s'obtient en préfixant
 * (`event:123`, `note:45`, `commit:abc…`). Elle ne sert qu'à la clé de rendu et
 * à l'appariement des reviews avec leurs commentaires de ligne.
 *
 * Tous les champs de détail sont optionnels : chaque `kind` n'en remplit qu'une
 * poignée, et une forge qui ne sait pas remplir un champ le laisse absent plutôt
 * que d'inventer une valeur.
 */
export interface PrTimelineEvent {
  id: string;
  kind: PrTimelineKind;
  /** Qui a fait le geste. Null quand la forge ne le dit pas (certains automatismes). */
  actor: { login: string; avatar_url: string | null } | null;
  /**
   * TOUS les auteurs, quand le fait en a plusieurs (MIN-159) — un commit
   * co-signé, une poussée repliée. `actor` reste le premier d'entre eux : les
   * rendus qui n'empilent pas d'avatars continuent de marcher.
   */
  actors?: CommitAuthor[];
  /** ISO 8601. Null pour un fait sans date — il se range alors en fin de fil. */
  createdAt: string | null;
  /** Verdict — `reviewed` seulement. */
  reviewState?: PrReviewState;
  /** Corps d'une review, ou texte brut d'une note système (`system`). */
  body?: string;
  /** Id de la review chez la forge — la clé qui rattache ses commentaires de ligne. */
  reviewId?: number;
  /** TOUTES les reviews repliées dans ce fait (`groupTimelineReviews`) : un point
      posé seul est une review à lui tout seul chez GitHub, et il en faut souvent
      une douzaine pour dire une seule chose. Rempli sur les `reviewed`, jamais
      ailleurs — l'appelant y ramasse les commentaires de ligne à afficher. */
  reviewIds?: number[];
  /** Nom du label — `labeled` / `unlabeled`. Couleur hex SANS `#`, quand connue. */
  label?: { name: string; color: string | null };
  /** Login concerné — assignation, demande de review, review écartée. */
  subject?: string | null;
  /** Titres avant / après — `renamed`. */
  from?: string | null;
  to?: string | null;
  /** SHA + première ligne du message — `committed`. */
  sha?: string | null;
  /** Nombre de commits poussés d'un coup, quand la forge le résume (GitLab). */
  commitCount?: number | null;
  /** Nom du jalon — `milestoned` / `demilestoned`. Nom de branche — `branch_*`. */
  name?: string | null;
  /** Ce que l'événement référence — `referenced` / `cross_referenced`. */
  reference?: string | null;
  /** Lien vers le fait chez la forge, quand elle en sert un. */
  url?: string | null;
}

/**
 * Les AUTEURS de chaque commit — que la timeline ne donne pas.
 *
 * Un événement `committed` ne porte que ce qui est écrit DANS le commit : UN nom
 * git (« mangué ») et un email. Deux choses lui manquent, et la liste des commits
 * — déjà chargée pour son onglet — les a toutes les deux :
 *  - le COMPTE derrière ce nom (« mangue-dev », son avatar), que la forge résout
 *    par email. Sans lui, l'activité affichait le `user.name` local et un avatar
 *    fabriqué à partir de ce nom, alors que la vraie photo était à un onglet ;
 *  - les CO-AUTEURS, que git ne met que dans les trailers du message. Un commit
 *    écrit avec un agent en a toujours un, et n'en montrer qu'un seul revenait à
 *    attribuer le travail à une seule personne.
 *
 * L'appariement se fait par SHA, la seule clé commune. Un commit absent de la
 * liste (elle est plafonnée, cf. `truncated`) garde son nom git : un nom vrai
 * mais partiel vaut mieux qu'un compte deviné.
 */
export function resolveCommitActors(
  events: PrTimelineEvent[],
  // `authors` est OPTIONNEL ici alors que la route le remplit toujours : un
  // onglet ouvert au moment d'un déploiement garde en cache la réponse de la
  // version d'avant, qui ne le portait pas. Un champ neuf lu sans garde fait
  // tomber la page entière pour un avatar — la tolérance se déclare donc dans le
  // type, à l'endroit où la donnée traverse le réseau.
  commits: Array<{ sha: string; authors?: CommitAuthor[] }>,
): PrTimelineEvent[] {
  if (commits.length === 0) return events;
  const bySha = new Map(
    commits.filter((c) => c.authors?.length).map((c) => [c.sha, c.authors as CommitAuthor[]]),
  );
  return events.map((event) => {
    if (event.kind !== "committed" || !event.sha) return event;
    const authors = bySha.get(event.sha);
    if (!authors?.length) return event;
    const [first] = authors;
    return {
      ...event,
      // `actor` reste l'auteur principal — c'est lui qui ouvre la phrase et qui
      // décide du regroupement des poussées.
      actor: { login: first.login ?? first.name, avatar_url: first.avatar_url },
      actors: authors,
    };
  });
}

/**
 * Un commit poussé se raconte « untel a poussé 3 commits », pas commit par
 * commit : GitHub émet un événement `committed` PAR COMMIT, et une PR de vingt
 * commits noierait tout le reste du fil.
 *
 * Le regroupement suit ce que GitHub affiche : commits CONSÉCUTIFS du même
 * auteur, non séparés par un autre fait. Deux poussées espacées d'une review
 * restent deux blocs — c'est l'ordre du fil qui raconte l'histoire, pas l'auteur.
 *
 * `commitCount` porte alors le total et `sha` le DERNIER commit du groupe (celui
 * vers lequel pointe le lien) ; les autres champs viennent du premier.
 */
export function groupTimelineCommits(events: PrTimelineEvent[]): PrTimelineEvent[] {
  const out: PrTimelineEvent[] = [];
  for (const event of events) {
    const previous = out[out.length - 1];
    if (
      event.kind === "committed" &&
      previous?.kind === "committed" &&
      // `?? null` : deux commits sans auteur connu se regroupent aussi, un commit
      // sans auteur ne se colle pas à un commit signé.
      (previous.actor?.login ?? null) === (event.actor?.login ?? null)
    ) {
      out[out.length - 1] = {
        ...previous,
        commitCount: (previous.commitCount ?? 1) + (event.commitCount ?? 1),
        sha: event.sha ?? previous.sha,
        url: event.url ?? previous.url,
        // Une poussée se signe de TOUS ceux qui ont écrit ses commits : le
        // co-auteur du troisième commit a autant poussé que l'auteur du premier.
        actors: mergeCommitAuthors([previous.actors ?? [], event.actors ?? []]),
        // La date du groupe est celle de sa fin : « a poussé 3 commits » se lit
        // au moment où le dernier est arrivé.
        createdAt: event.createdAt ?? previous.createdAt,
      };
      continue;
    }
    out.push(event);
  }
  return out;
}

/**
 * Un point posé seul sur une ligne de code est, chez GitHub, une REVIEW à lui
 * tout seul — mesuré : trois `POST pulls/{n}/comments` produisent trois
 * événements `reviewed` sans corps. C'est exactement la façon dont Numo dépose
 * ses trouvailles, une par appel : sans ce repli, une passe de douze points
 * ajouterait douze cartes « minddy-app[bot] a relu » au fil.
 *
 * On replie donc les reviews CONSÉCUTIVES, SANS CORPS et du MÊME auteur en une
 * seule — ce qu'une review soumise d'un bloc aurait produit, et ce que le fil
 * doit raconter : « untel a relu, voilà ses N points ».
 *
 * Ce qui ne se replie jamais : une review qui a un CORPS. Elle dit quelque
 * chose ; la fondre dans la suivante ferait disparaître son texte ou son verdict.
 */
export function groupTimelineReviews(events: PrTimelineEvent[]): PrTimelineEvent[] {
  const out: PrTimelineEvent[] = [];
  for (const event of events) {
    if (event.kind !== "reviewed") {
      out.push(event);
      continue;
    }
    const ids = event.reviewId != null ? [event.reviewId] : [];
    const previous = out[out.length - 1];
    const mergeable =
      !event.body &&
      previous?.kind === "reviewed" &&
      !previous.body &&
      (previous.actor?.login ?? null) === (event.actor?.login ?? null) &&
      // Un verdict ne se fond pas dans un autre : approuver puis commenter sont
      // deux faits, même à la seconde près.
      previous.reviewState === event.reviewState;
    if (mergeable) {
      out[out.length - 1] = {
        ...previous,
        reviewIds: [...(previous.reviewIds ?? []), ...ids],
        createdAt: event.createdAt ?? previous.createdAt,
      };
      continue;
    }
    out.push({ ...event, reviewIds: ids });
  }
  return out;
}

/**
 * Bruit de fond que GitHub lui-même n'affiche pas dans le fil d'une PR :
 * abonnements, mentions, épinglages. Les servir « parce que l'API les donne »
 * rendrait le fil ILLISIBLE — l'objectif est la complétude de ce qui s'est
 * PASSÉ, pas le journal de la base de données de la forge.
 */
const IGNORED_GITHUB_EVENTS = new Set([
  "subscribed",
  "unsubscribed",
  "mentioned",
  "pinned",
  "unpinned",
  "commented", // le fil des messages, déjà servi à part.
  "line-commented", // les commentaires de ligne, rattachés à leur review par son id.
  "commit-commented",
]);

/** `event` de GitHub → notre vocabulaire. `null` = à ignorer. */
const GITHUB_EVENT_KIND: Record<string, PrTimelineKind> = {
  reviewed: "reviewed",
  review_dismissed: "review_dismissed",
  review_requested: "review_requested",
  review_request_removed: "review_request_removed",
  committed: "committed",
  head_ref_force_pushed: "force_pushed",
  head_ref_deleted: "branch_deleted",
  head_ref_restored: "branch_restored",
  labeled: "labeled",
  unlabeled: "unlabeled",
  assigned: "assigned",
  unassigned: "unassigned",
  renamed: "renamed",
  milestoned: "milestoned",
  demilestoned: "demilestoned",
  ready_for_review: "ready_for_review",
  convert_to_draft: "converted_to_draft",
  merged: "merged",
  closed: "closed",
  reopened: "reopened",
  referenced: "referenced",
  "cross-referenced": "cross_referenced",
  locked: "locked",
  unlocked: "unlocked",
  auto_merge_enabled: "auto_merge_enabled",
  auto_merge_disabled: "auto_merge_disabled",
};

/** `state` d'une review GitHub → notre verdict. */
export function toReviewState(raw: string | null | undefined): PrReviewState {
  const state = (raw ?? "").toUpperCase();
  if (state === "APPROVED") return "approved";
  if (state === "CHANGES_REQUESTED") return "changes_requested";
  if (state === "DISMISSED") return "dismissed";
  return "commented";
}

/** Un événement de timeline GitHub, réduit aux champs que minddy lit. */
export interface RawGithubTimelineEvent {
  id?: number;
  event?: string;
  node_id?: string;
  created_at?: string | null;
  submitted_at?: string | null;
  actor?: { login?: string; avatar_url?: string | null } | null;
  user?: { login?: string; avatar_url?: string | null } | null;
  /** `committed` : l'auteur est DANS le commit, pas dans un compte de forge. */
  author?: { name?: string; date?: string } | null;
  committer?: { name?: string; date?: string } | null;
  sha?: string;
  message?: string;
  html_url?: string;
  url?: string;
  state?: string;
  body?: string | null;
  label?: { name?: string; color?: string | null } | null;
  assignee?: { login?: string } | null;
  requested_reviewer?: { login?: string } | null;
  requested_team?: { name?: string } | null;
  review_requester?: { login?: string; avatar_url?: string | null } | null;
  dismissed_review?: { review_id?: number; state?: string; dismissal_message?: string | null } | null;
  milestone?: { title?: string } | null;
  rename?: { from?: string; to?: string } | null;
  source?: { issue?: { number?: number; html_url?: string; title?: string } | null } | null;
}

/**
 * Timeline GitHub → activité minddy. Les événements inconnus ET non ignorés
 * disparaissent silencieusement : GitHub en ajoute régulièrement (projets,
 * déploiements, transferts), et un `kind` inventé ne se rendrait nulle part.
 *
 * `committed` est le cas tordu : ce n'est pas un événement d'issue mais un objet
 * COMMIT injecté dans le flux — pas d'`id`, pas d'`actor`, une date dans
 * `author.date` et un auteur qui n'est qu'un nom git. On le rend tel quel : le
 * nom du commit vaut mieux qu'un « quelqu'un ».
 */
export function fromGithubTimeline(raw: RawGithubTimelineEvent[]): PrTimelineEvent[] {
  const events: PrTimelineEvent[] = [];
  for (const e of raw) {
    const type = e.event ?? "";
    if (IGNORED_GITHUB_EVENTS.has(type)) continue;
    const kind = GITHUB_EVENT_KIND[type];
    if (!kind) continue;

    if (kind === "committed") {
      const sha = e.sha ?? "";
      if (!sha) continue;
      events.push({
        id: `commit:${sha}`,
        kind,
        // Le compte de forge n'est pas servi ici : seul le nom écrit dans le
        // commit l'est. `avatar_url: null` → l'avatar retombe sur la graine.
        actor: e.author?.name ? { login: e.author.name, avatar_url: null } : null,
        createdAt: e.author?.date ?? e.committer?.date ?? null,
        sha,
        commitCount: 1,
        body: (e.message ?? "").split("\n")[0] || undefined,
        url: e.html_url ?? null,
      });
      continue;
    }

    if (kind === "reviewed") {
      // Une review n'est pas un événement d'issue : son auteur est `user`, sa
      // date `submitted_at`, et son `id` EST l'id de la review — la clé par
      // laquelle ses commentaires de ligne la retrouvent.
      events.push({
        id: `review:${e.id ?? e.node_id ?? e.submitted_at ?? ""}`,
        kind,
        actor: e.user?.login
          ? { login: e.user.login, avatar_url: e.user.avatar_url ?? null }
          : null,
        createdAt: e.submitted_at ?? e.created_at ?? null,
        reviewState: toReviewState(e.state),
        reviewId: e.id,
        body: (e.body ?? "").trim() || undefined,
        url: e.html_url ?? null,
      });
      continue;
    }

    const actor = e.actor?.login
      ? { login: e.actor.login, avatar_url: e.actor.avatar_url ?? null }
      : null;
    const base: PrTimelineEvent = {
      id: `event:${e.id ?? e.node_id ?? `${type}:${e.created_at ?? ""}`}`,
      kind,
      actor,
      createdAt: e.created_at ?? null,
    };

    if (kind === "labeled" || kind === "unlabeled") {
      base.label = { name: e.label?.name ?? "", color: e.label?.color ?? null };
    } else if (kind === "assigned" || kind === "unassigned") {
      base.subject = e.assignee?.login ?? null;
    } else if (kind === "review_requested" || kind === "review_request_removed") {
      base.subject = e.requested_reviewer?.login ?? e.requested_team?.name ?? null;
    } else if (kind === "review_dismissed") {
      base.subject = e.dismissed_review?.state?.toLowerCase() ?? null;
      base.body = e.dismissed_review?.dismissal_message ?? undefined;
    } else if (kind === "renamed") {
      base.from = e.rename?.from ?? null;
      base.to = e.rename?.to ?? null;
    } else if (kind === "milestoned" || kind === "demilestoned") {
      base.name = e.milestone?.title ?? null;
    } else if (kind === "cross_referenced" || kind === "referenced") {
      const issue = e.source?.issue;
      base.reference = issue?.number ? `#${issue.number}` : null;
      base.name = issue?.title ?? null;
      base.url = issue?.html_url ?? null;
    } else if (kind === "merged" || kind === "closed") {
      base.sha = e.sha ?? null;
      base.url = e.html_url ?? null;
    }
    events.push(base);
  }
  return events;
}

/**
 * Notes système GitLab → activité minddy.
 *
 * GitLab ne type pas ses événements : il écrit une PHRASE en anglais dans une
 * note marquée `system` (« approved this merge request », « added 3 commits »).
 * Ces phrases sont stables et jamais localisées — les reconnaître donne le même
 * vocabulaire que GitHub, donc la même icône et le même texte traduit.
 *
 * Ce qu'aucun motif ne reconnaît reste sous `system`, avec la phrase de GitLab :
 * un fait dit en anglais vaut mieux qu'un fait perdu. C'est aussi le filet qui
 * encaisse les phrases que GitLab ajoutera après nous.
 */
const GITLAB_SYSTEM_PATTERNS: Array<{
  re: RegExp;
  kind: PrTimelineKind;
  /** Ce que les groupes capturés remplissent, dans l'ordre. */
  fill?: (event: PrTimelineEvent, m: RegExpMatchArray) => void;
}> = [
  { re: /^approved this merge request/i, kind: "reviewed", fill: (e) => (e.reviewState = "approved") },
  {
    re: /^unapproved this merge request/i,
    kind: "review_dismissed",
  },
  {
    re: /^requested review from @?([\w.\-]+)/i,
    kind: "review_requested",
    fill: (e, m) => (e.subject = m[1]),
  },
  {
    re: /^removed review request for @?([\w.\-]+)/i,
    kind: "review_request_removed",
    fill: (e, m) => (e.subject = m[1]),
  },
  {
    re: /^added (\d+) commits?/i,
    kind: "committed",
    fill: (e, m) => (e.commitCount = Number(m[1])),
  },
  { re: /^force[- ]pushed/i, kind: "force_pushed" },
  {
    re: /^(?:added|assigned) to @?([\w.\-]+)|^assigned to @?([\w.\-]+)/i,
    kind: "assigned",
    fill: (e, m) => (e.subject = m[1] ?? m[2] ?? null),
  },
  {
    re: /^unassigned @?([\w.\-]+)/i,
    kind: "unassigned",
    fill: (e, m) => (e.subject = m[1]),
  },
  {
    re: /^added ~\d+ label/i,
    kind: "labeled",
  },
  {
    re: /^removed ~\d+ label/i,
    kind: "unlabeled",
  },
  {
    // « changed title from **{-old-}** to **{+new+}** » : GitLab encadre la
    // partie retirée de `{- -}` et l'ajoutée de `{+ +}`, dans du gras markdown.
    re: /^changed title from \*\*(.+?)\*\* to \*\*(.+?)\*\*\s*$/i,
    kind: "renamed",
    fill: (e, m) => {
      e.from = stripGitlabDiffMarkers(m[1]);
      e.to = stripGitlabDiffMarkers(m[2]);
    },
  },
  { re: /^marked this merge request as \*\*ready\*\*/i, kind: "ready_for_review" },
  { re: /^marked this merge request as \*\*draft\*\*/i, kind: "converted_to_draft" },
  { re: /^merged$/i, kind: "merged" },
  { re: /^closed$/i, kind: "closed" },
  { re: /^reopened$/i, kind: "reopened" },
  { re: /^changed milestone to %(.+)$/i, kind: "milestoned", fill: (e, m) => (e.name = m[1]) },
  { re: /^removed milestone/i, kind: "demilestoned" },
  {
    re: /^mentioned in (?:merge request|issue|commit) (\S+)/i,
    kind: "cross_referenced",
    fill: (e, m) => (e.reference = m[1]),
  },
  { re: /^locked this merge request/i, kind: "locked" },
  { re: /^unlocked this merge request/i, kind: "unlocked" },
  {
    re: /^enabled an automatic merge|^enabled automatic (?:add to merge train|merge)/i,
    kind: "auto_merge_enabled",
  },
  { re: /^(?:aborted|canceled|cancelled) the automatic merge/i, kind: "auto_merge_disabled" },
];

/** `{-retiré-}` / `{+ajouté+}` : les marqueurs de diff que GitLab glisse dans ses phrases. */
function stripGitlabDiffMarkers(text: string): string {
  return text.replace(/\{[-+](.*?)[-+]\}/g, "$1").trim();
}

/**
 * Une phrase système de GitLab, prête à se lire en clair. Elle arrive en
 * markdown (`**gras**`, marqueurs de diff, liens) alors qu'elle se rend dans une
 * ligne de texte : sans ce nettoyage, l'activité afficherait ses astérisques.
 */
function plainSystemText(body: string): string {
  return stripGitlabDiffMarkers(body)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\[(.*?)\]\((?:.*?)\)/g, "$1")
    .trim();
}

/** Une note GitLab, réduite aux champs que la timeline lit. */
export interface RawGitlabSystemNote {
  id: number;
  body?: string;
  system?: boolean;
  author?: { username?: string; avatar_url?: string | null } | null;
  created_at: string;
}

export function fromGitlabSystemNotes(
  notes: RawGitlabSystemNote[],
  noteUrl: (noteId: number) => string,
): PrTimelineEvent[] {
  const events: PrTimelineEvent[] = [];
  for (const note of notes) {
    if (!note.system) continue;
    const body = (note.body ?? "").trim();
    if (!body) continue;
    const actor = note.author?.username
      ? { login: note.author.username, avatar_url: note.author.avatar_url ?? null }
      : null;
    const event: PrTimelineEvent = {
      id: `note:${note.id}`,
      kind: "system",
      actor,
      createdAt: note.created_at,
      url: noteUrl(note.id),
    };
    const match = GITLAB_SYSTEM_PATTERNS.find((p) => p.re.test(body));
    if (match) {
      event.kind = match.kind;
      match.fill?.(event, body.match(match.re) as RegExpMatchArray);
    } else {
      // Le repli garde la phrase de GitLab — c'est elle qui portera le sens.
      event.body = plainSystemText(body);
    }
    events.push(event);
  }
  return events;
}

/**
 * Ordre du fil : du plus ANCIEN au plus récent, comme les deux forges et comme
 * le composer en bas de la vue. Les faits sans date se rangent à la FIN — ils
 * sont rares (un commit sans date d'auteur) et les mettre au début ferait ouvrir
 * la conversation sur un orphelin.
 */
export function sortTimelineOlderFirst<T extends { createdAt: string | null; id: string }>(
  entries: T[],
): T[] {
  return [...entries].sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.id.localeCompare(b.id);
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
