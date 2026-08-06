import "server-only";

import { createTranslator } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { displayName } from "@/lib/display-name";
import { mcpActorLabel } from "@/lib/mcp-agents";
import {
  notificationTargetPath,
  NOTIFICATION_LINE_KEYS,
} from "@/lib/notification-target";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { resolveApiKeyActors, type ApiKeyActor } from "@/lib/server/api-key-actors";
import type { NotificationRow } from "@/lib/server/notifications";

/**
 * Ce que dit une notification poussée (MIN-183) — les MÊMES mots que la ligne
 * d'inbox correspondante.
 *
 * C'est le point de la chose : deux surfaces, une seule formulation. D'où la
 * réutilisation des clés du namespace `Inbox` via `NOTIFICATION_LINE_KEYS`, et
 * du vocabulaire d'acteur de la timeline (Smart Assign nommé, un agent MCP
 * nommé, jamais « Quelqu'un » quand on sait qui c'est).
 *
 * ## Pourquoi `createTranslator` et pas `getTranslations`
 *
 * `getTranslations` exige un contexte de REQUÊTE. La moitié des producteurs de
 * notifications n'en ont pas : une cascade d'automatisations, un run d'agent qui
 * se termine, un cron de feedback. `createTranslator` sur les catalogues
 * importés statiquement marche partout — c'est déjà la recette des tests
 * (lib/describe-event-smart-assign.test.ts).
 *
 * Et la langue n'est pas celle de la requête de toute façon : c'est celle de
 * l'ABONNEMENT, capturée par appareil au moment où on s'y abonne. Le cookie
 * `NEXT_LOCALE` de quelqu'un d'autre est illisible depuis un job de fond.
 *
 * ## Hydratation en LOT
 *
 * `loadPushContext` fait UNE passe de lecture pour tout le lot inséré ;
 * `buildPushPayload` est ensuite pur. Un insert est souvent multi-destinataires
 * (une mention de trois personnes dans un commentaire) et chaque destinataire
 * peut avoir plusieurs appareils dans plusieurs langues : hydrater par ligne et
 * par langue serait le même N+1, répété.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Chemin relatif — le service worker le résout sur son origine. */
  url: string;
  /** Regroupement côté navigateur : une rafale sur la même cible REMPLACE au
   *  lieu d'empiler. Écho de `replaceUnread` côté inbox. */
  tag: string;
}

export type PushLocale = "fr" | "en";

const CATALOGS: Record<PushLocale, typeof en> = { en, fr: fr as typeof en };

/** Normalise une langue stockée (`"fr-FR"`, `"FR"`, `null`) vers un catalogue. */
export function toPushLocale(raw: string | null | undefined): PushLocale {
  return raw?.trim().toLowerCase().startsWith("fr") ? "fr" : "en";
}

export interface PushContext {
  issues: Map<string, { number: number; title: string }>;
  objectives: Map<string, string>;
  feedbackPosts: Map<string, string>;
  projectKeys: Map<string, string>;
  actorNames: Map<string, string>;
  apiKeyActors: Map<string, ApiKeyActor>;
}

/** Contexte vide — sert de valeur de départ et de repli. */
export function emptyPushContext(): PushContext {
  return {
    issues: new Map(),
    objectives: new Map(),
    feedbackPosts: new Map(),
    projectKeys: new Map(),
    actorNames: new Map(),
    apiKeyActors: new Map(),
  };
}

/**
 * Une passe de lecture pour tout le lot : titres des cibles (en écartant les
 * corbeillés — MIN-133 : la notification survit à la mise en corbeille de sa
 * cible), clés de projet, noms d'acteurs.
 */
export async function loadPushContext(
  service: SupabaseClient,
  rows: readonly NotificationRow[]
): Promise<PushContext> {
  const ctx = emptyPushContext();
  if (rows.length === 0) return ctx;

  const ids = (pick: (r: NotificationRow) => string | null | undefined): string[] => [
    ...new Set(rows.map(pick).filter((v): v is string => !!v)),
  ];
  const issueIds = ids((r) => r.issue_id);
  const objectiveIds = ids((r) => r.objective_id);
  const feedbackIds = ids((r) => r.feedback_post_id);
  const projectIds = ids((r) => r.project_id);
  const actorIds = ids((r) => r.actor_id);
  const keyIds = ids((r) => r.api_key_id);

  const [issues, objectives, feedback, projects, actors, keyActors] = await Promise.all([
    issueIds.length
      ? service
          .from("issues")
          .select("id, number, title")
          .in("id", issueIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; number: number; title: string }[] }),
    objectiveIds.length
      ? service
          .from("objectives")
          .select("id, name")
          .in("id", objectiveIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    feedbackIds.length
      ? service
          .from("feedback_posts")
          .select("id, title")
          .in("id", feedbackIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    projectIds.length
      ? service.from("projects").select("id, key").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; key: string }[] }),
    fetchAuthUsersById(service, actorIds),
    keyIds.length
      ? resolveApiKeyActors(keyIds)
      : Promise.resolve(new Map<string, ApiKeyActor>()),
  ]);

  for (const i of issues.data ?? []) {
    ctx.issues.set(i.id, { number: i.number, title: i.title });
  }
  for (const o of objectives.data ?? []) ctx.objectives.set(o.id, o.name);
  for (const f of feedback.data ?? []) ctx.feedbackPosts.set(f.id, f.title);
  for (const p of projects.data ?? []) ctx.projectKeys.set(p.id, p.key);
  for (const [id, user] of actors) {
    // Repli VIDE plutôt que « User » : le libellé de repli est traduit, et sa
    // langue n'est connue qu'à la construction de la charge utile, plus bas.
    ctx.actorNames.set(id, displayName(toNamed(user), ""));
  }
  ctx.apiKeyActors = keyActors;

  return ctx;
}

/**
 * La charge utile d'une ligne, dans la langue d'un appareil — ou `null` quand
 * la cible n'est plus là (corbeille) ou que la ligne ne mène nulle part : mieux
 * vaut ne rien pousser qu'ouvrir un écran vide.
 */
export function buildPushPayload(
  ctx: PushContext,
  row: NotificationRow,
  locale: PushLocale
): PushPayload | null {
  const url = notificationTargetPath(row);
  if (!url) return null;

  const messages = CATALOGS[locale];
  const t = createTranslator({ locale, messages, namespace: "Inbox" });
  const tTimeline = createTranslator({ locale, messages, namespace: "Timeline" });

  // Le titre, c'est DE QUOI on parle — la première ligne de l'inbox. La
  // référence du ticket devant : c'est elle qu'on reconnaît d'un coup d'œil dans
  // une bannière système, où il n'y a de place pour rien d'autre.
  let title: string;
  if (row.objective_id) {
    const name = ctx.objectives.get(row.objective_id);
    if (!name) return null;
    title = name;
  } else if (row.feedback_post_id) {
    const postTitle = ctx.feedbackPosts.get(row.feedback_post_id);
    if (!postTitle) return null;
    title = postTitle;
  } else if (row.issue_id) {
    const issue = ctx.issues.get(row.issue_id);
    if (!issue) return null;
    const key = row.project_id ? ctx.projectKeys.get(row.project_id) : null;
    title = key ? `${key}-${issue.number} · ${issue.title}` : issue.title;
  } else {
    return null;
  }

  // Le nom de l'acteur, dans les termes de l'inbox et de la timeline : Smart
  // Assign se nomme, un agent MCP se nomme, et « Quelqu'un » ne sert que quand
  // on ne sait vraiment pas.
  let actor: string;
  if (row.via_smart_assign) {
    actor = "Smart Assign";
  } else if (row.via_mcp) {
    const keyActor = row.api_key_id ? ctx.apiKeyActors.get(row.api_key_id) : null;
    actor = mcpActorLabel(keyActor?.agent, keyActor?.name, tTimeline("mcpFallback"));
  } else {
    actor = ctx.actorNames.get(row.actor_id ?? "")?.trim() || t("someone");
  }

  return {
    title,
    body: t(NOTIFICATION_LINE_KEYS[row.type], { actor }),
    url,
    tag: url,
  };
}
