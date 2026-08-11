import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  insertNotifications,
  projectMemberIds,
  type NotificationRow,
} from "@/lib/server/notifications";
import { normalizeQuote } from "@/lib/page-comments";

/**
 * Le noyau des COMMENTAIRES DE PAGE (MIN-282) — le jumeau d'add-comment.ts, pour
 * la quatrième surface.
 *
 * Ce qu'il partage avec les trois autres, mot pour mot : les réponses ramenées
 * sur la RACINE du fil (profondeur ≤ 1), l'accès contrôlé ICI parce que
 * l'écriture passe par le client service, et les notifications posées par le
 * point d'insertion commun (lib/server/notifications.ts, où vit le filtre de
 * préférences de MIN-82).
 *
 * Ce qu'il ajoute, et qui n'existe que sur une page :
 *  - l'ANCRE (`block_id`) et l'extrait figé (`quote`) ;
 *  - la RÉSOLUTION d'un fil, ouverte à toute l'équipe.
 *
 * Ce qu'il n'a PAS, volontairement : les pièces jointes. Elles pendent à un
 * ticket, à un objectif ou à un retour (`attachments_parent_ck`), et une
 * cinquième branche pour un fil de doc n'a jamais été demandée — le document
 * lui-même accepte déjà les images et les fichiers (MIN-280).
 */

export type PageCommentResult =
  | { ok: true; comment: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      /** Clé du namespace i18n `ApiErrors`. */
      errorKey:
        | "commentEmpty"
        | "pageNotFound"
        | "commentNotFound"
        | "databaseError";
    };

/** Même plafond que les trois autres fils (MIN-118). */
const MAX_COMMENT_LENGTH = 65_536;

/** Ce qu'une lecture rend : tout, la ligne est courte et sans secret. */
const COLUMNS = "*";

export async function addPageComment({
  pageId,
  actorId,
  body,
  blockId = null,
  quote = null,
  parentId = null,
  mentionedUserIds = [],
  viaAssistant = false,
  mcpKeyId = null,
}: {
  pageId: string;
  actorId: string;
  body: string;
  /** L'ancre : le bloc commenté. Null = un commentaire sur la page. */
  blockId?: string | null;
  /** L'extrait sélectionné au moment du commentaire, figé avec lui. */
  quote?: string | null;
  parentId?: string | null;
  mentionedUserIds?: string[];
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
}): Promise<PageCommentResult> {
  const text = body.trim().slice(0, MAX_COMMENT_LENGTH);
  if (!text) return { ok: false, status: 400, errorKey: "commentEmpty" };

  const service = getServiceClient();

  // La page résout le projet pour le contrôle d'accès, et porte l'auteur qu'on
  // prévient plus bas. Corbeillée, elle ne se commente plus : c'est le pendant
  // de la RLS, qui masque déjà ses fils.
  const { data: page } = await service
    .from("pages")
    .select("project_id, created_by")
    .is("deleted_at", null)
    .eq("id", pageId)
    .maybeSingle();
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };

  const projectId = page.project_id as string;
  const access = await getProjectAccess(actorId, projectId);
  if (!access) return { ok: false, status: 404, errorKey: "pageNotFound" };

  // Réponses : le `parent_id` stocké est TOUJOURS la racine du fil, et cette
  // racine doit appartenir à cette page.
  let rootId: string | null = null;
  let rootBlockId: string | null = null;
  const threadAuthorIds: (string | null)[] = [];
  if (parentId) {
    const { data: parent } = await service
      .from("page_comments")
      .select("id, parent_id, page_id, author_id, block_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent || parent.page_id !== pageId) {
      return { ok: false, status: 404, errorKey: "commentNotFound" };
    }
    rootId = (parent.parent_id as string | null) ?? (parent.id as string);
    threadAuthorIds.push(parent.author_id as string | null);
    rootBlockId = (parent.block_id as string | null) ?? null;
    if (parent.parent_id) {
      const { data: root } = await service
        .from("page_comments")
        .select("author_id, block_id")
        .eq("id", rootId)
        .maybeSingle();
      threadAuthorIds.push((root?.author_id as string | null) ?? null);
      rootBlockId = (root?.block_id as string | null) ?? null;
    }
  }

  // Une RÉPONSE n'a pas d'ancre à elle : elle hérite de celle de son fil. Sans
  // cette règle, répondre depuis un composeur qui connaît la sélection courante
  // ancrerait la réponse sur un AUTRE bloc que la question.
  const anchor = rootId ? rootBlockId : (blockId || null);

  const { data, error } = await service
    .from("page_comments")
    .insert({
      page_id: pageId,
      project_id: projectId,
      block_id: anchor,
      quote: rootId ? null : normalizeQuote(quote),
      body: text,
      author_id: actorId,
      parent_id: rootId,
      via_assistant: viaAssistant,
      via_mcp: !!mcpKeyId,
      api_key_id: mcpKeyId,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    console.error("[page-comments] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // Notifications. Deux types, et ils ne disent pas la même chose :
  //  - `page_mention` : on m'a cité. Le type de MIN-278, celui-là même que pose
  //    une citation dans le CORPS de la page — même phrase, même destination,
  //    et donc la même bascule de préférences.
  //  - `page_comment` : on a commenté une page que j'ai écrite, ou un fil auquel
  //    j'ai participé. Le pendant de `comment` sur un ticket.
  // Jamais les deux pour la même personne : une citation dit déjà tout.
  const valid = await projectMemberIds(service, projectId);
  const mentionSet = new Set(
    mentionedUserIds.filter(
      (uid) => typeof uid === "string" && uid !== actorId && valid.has(uid)
    )
  );
  const commentSet = new Set<string>();
  for (const uid of [...threadAuthorIds, page.created_by] as (string | null)[]) {
    if (uid && uid !== actorId && valid.has(uid) && !mentionSet.has(uid)) {
      commentSet.add(uid);
    }
  }

  const actorSource = mcpKeyId
    ? { via_mcp: true, api_key_id: mcpKeyId }
    : viaAssistant
      ? { via_assistant: true }
      : {};
  const target = { page_id: pageId, block_id: anchor };
  const rows: NotificationRow[] = [
    ...[...mentionSet].map((uid) => ({
      user_id: uid,
      project_id: projectId,
      type: "page_mention" as const,
      issue_id: null,
      ...target,
      actor_id: actorId,
      ...actorSource,
    })),
    ...[...commentSet].map((uid) => ({
      user_id: uid,
      project_id: projectId,
      type: "page_comment" as const,
      issue_id: null,
      ...target,
      actor_id: actorId,
      ...actorSource,
    })),
  ];
  await insertNotifications(service, rows);

  return { ok: true, comment: data as Record<string, unknown> };
}

/**
 * RÉSOUDRE un fil, ou le rouvrir.
 *
 * La résolution vit sur la RACINE et sur elle seule — un fil se clôt entier.
 * Résoudre depuis une réponse remonte donc à sa racine plutôt que d'échouer :
 * c'est le même geste vu d'un autre message.
 *
 * Ouvert à toute l'équipe, pas au seul auteur : un fil qu'on ne peut clore que
 * si son auteur revient n'est pas un fil. La policy `page_comments_update` dit
 * la même chose, et cette fonction passe par le client de SESSION — la RLS est
 * le contrôle d'accès, il n'y a rien à refaire ici.
 */
export async function resolvePageThread(
  client: SupabaseClient,
  {
    commentId,
    actorId,
    resolved,
  }: { commentId: string; actorId: string; resolved: boolean }
): Promise<PageCommentResult> {
  const { data: comment, error: readError } = await client
    .from("page_comments")
    .select("id, parent_id")
    .eq("id", commentId)
    .maybeSingle();
  if (readError) {
    console.error("[page-comments] resolve read failed:", readError.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!comment) return { ok: false, status: 404, errorKey: "commentNotFound" };

  const rootId = (comment.parent_id as string | null) ?? (comment.id as string);
  const { data, error } = await client
    .from("page_comments")
    .update({
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? actorId : null,
    })
    .eq("id", rootId)
    .select(COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[page-comments] resolve failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) return { ok: false, status: 404, errorKey: "commentNotFound" };
  return { ok: true, comment: data as Record<string, unknown> };
}

/**
 * Les fils OUVERTS d'une page, en markdown compact — ce que lit un agent.
 *
 * Rendu par `minddy_get_page` et par l'outil de lecture de Numo : un agent qui
 * relit une spec doit voir les objections en cours, c'est souvent là qu'est la
 * vraie contrainte. Les fils RÉSOLUS n'y sont pas — un débat clos est du bruit
 * pour qui vient écrire.
 */
export async function openPageThreadsForAgent(
  client: SupabaseClient,
  pageId: string,
  names: (userId: string | null) => string
): Promise<
  {
    quote: string | null;
    block_id: string | null;
    messages: { author: string; body: string; at: string }[];
  }[]
> {
  const { data } = await client
    .from("page_comments")
    .select("id, parent_id, block_id, quote, body, author_id, resolved_at, created_at")
    .eq("page_id", pageId)
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  const roots = rows.filter((r) => !r.parent_id && !r.resolved_at);
  return roots.map((root) => ({
    quote: (root.quote as string | null) ?? null,
    block_id: (root.block_id as string | null) ?? null,
    messages: [root, ...rows.filter((r) => r.parent_id === root.id)].map((r) => ({
      author: names(r.author_id as string | null),
      body: r.body as string,
      at: r.created_at as string,
    })),
  }));
}
