import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationType } from "@/lib/types";
import {
  categoryOfNotification,
  resolveNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notification-prefs";
import { afterOrNow } from "@/lib/server/after-safe";
import { isPushConfigured } from "@/lib/server/push/vapid";
import { buildPushPayload, loadPushContext } from "@/lib/server/push/payload";
import { sendPushToUser } from "@/lib/server/push/send";

export interface NotificationRow {
  user_id: string;
  project_id: string | null;
  type: NotificationType;
  issue_id: string | null;
  /** Set instead of issue_id when the notification points at an objective. */
  objective_id?: string | null;
  /** Set instead of issue_id/objective_id for a feedback-post notification. */
  feedback_post_id?: string | null;
  /** Set instead of the three above for a ROUTINE notification (MIN-185) — a
      scheduled run has no ticket, and its executions live in the routine. */
  routine_id?: string | null;
  /** Set instead of all the above for a PULL REQUEST notification: elle se lit
      sur la page Pull requests, et n'a pas forcément de ticket. */
  pull_request_id?: string | null;
  comment_id?: string | null;
  actor_id: string | null;
  /** L'action est passée par le serveur MCP : l'acteur affiché dans l'inbox est
      l'AGENT porté par `api_key_id`, pas le propriétaire de la clé. Même
      vocabulaire que `issue_events` (lib/server/issue-events.ts). */
  via_mcp?: boolean;
  /** La clé API derrière une action MCP — son agent/nom donne logo et libellé. */
  api_key_id?: string | null;
  /** L'affectation vient de Smart Assign (`actor_id` null) : l'inbox nomme la
      fonctionnalité au lieu de dire « Quelqu'un ». */
  via_smart_assign?: boolean;
  /** La ligne vient d'une automatisation de projet (MIN-147) — même raison que
      le drapeau ci-dessus : sans lui, l'inbox dit « Quelqu'un ». */
  via_automation?: boolean;
}

/** The agent types displace each other: one live agent notification per issue.
 *  `routine_done` en fait partie : c'est la fin de passage d'une routine, elle
 *  se substitue au « terminé » ou à l'« échec » du passage précédent — sinon
 *  une routine quotidienne empile une ligne par matin. */
const AGENT_TYPES: readonly NotificationType[] = [
  "agent_done",
  "agent_question",
  "agent_failed",
  "routine_done",
];

const siblingTypes = (type: NotificationType): readonly NotificationType[] =>
  AGENT_TYPES.includes(type) ? AGENT_TYPES : [type];

export async function insertNotifications(
  service: SupabaseClient,
  rows: NotificationRow[],
  opts: { replaceUnread?: boolean } = {}
): Promise<void> {
  if (rows.length === 0) return;

  // Per-recipient preference filter (MIN-82): a category switched off in the
  // account settings drops the row here, at the single insertion point every
  // producer funnels through. Fail-open — a prefs read error never censors.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const prefsById = new Map<string, NotificationPrefs>();
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const { data } = await service.auth.admin.getUserById(uid);
        prefsById.set(
          uid,
          resolveNotificationPrefs(
            (data?.user?.user_metadata ?? null) as Record<string, unknown> | null
          )
        );
      } catch (e) {
        console.error("[notifications] prefs read failed:", (e as Error).message);
      }
    })
  );
  const kept = rows.filter((r) => {
    const prefs = prefsById.get(r.user_id);
    // La LIGNE, pas seulement son type : une routine emprunte les types de
    // l'agent, et seul son `routine_id` la range sous la bonne bascule.
    return !prefs || prefs[categoryOfNotification(r)];
  });
  if (kept.length === 0) return;

  // replaceUnread: the fresh notification displaces its unread predecessor for
  // the same recipient/target (agent runs — a long session must not stack one
  // row per turn). Best-effort: a failed delete only leaves a duplicate.
  if (opts.replaceUnread) {
    await Promise.all(
      kept.map((r) => {
        let del = service
          .from("notifications")
          .delete()
          .eq("user_id", r.user_id)
          .in("type", siblingTypes(r.type) as string[])
          .is("read_at", null);
        del = r.issue_id ? del.eq("issue_id", r.issue_id) : del.is("issue_id", null);
        // Une notification de ROUTINE (MIN-185) n'a pas de ticket : sans ce
        // second filtre, le `issue_id is null` ci-dessus déplacerait la ligne
        // de TOUTES les routines du compte — deux routines en échec le même
        // matin n'en laisseraient qu'une, et l'autre disparaîtrait sans avoir
        // été lue. Chaque routine déplace la sienne, et elle seule.
        del = r.routine_id ? del.eq("routine_id", r.routine_id) : del.is("routine_id", null);
        return del;
      })
    );
  }

  const { error } = await service.from("notifications").insert(kept);
  if (error) {
    console.error("[notifications] insert failed:", error.message);
    return;
  }

  // Web Push (MIN-183) : les mêmes lignes partent en notification système, sur
  // les appareils que le destinataire a enregistrés. Ici, et pas ailleurs, pour
  // deux raisons :
  //   • c'est le SEUL point d'insertion — treize producteurs y convergent, donc
  //     brancher ici couvre tout ce qui tombe dans l'inbox, aujourd'hui et
  //     demain, sans qu'aucun d'eux n'ait à le savoir ;
  //   • le filtre de préférences (MIN-82) est déjà passé sur `kept`. Une seule
  //     bascule gouverne les deux surfaces, il n'y a rien à refiltrer — et donc
  //     aucun second filtre à tenir en phase avec le premier.
  //
  // Après l'insert et SEULEMENT s'il a réussi : une notification qu'on n'a pas
  // su écrire ne doit pas sonner sur un téléphone en laissant l'inbox vide.
  //
  // `afterOrNow` est indispensable : la moitié des producteurs tournent hors
  // requête (cascades d'automatisations, fin de run d'agent, crons). Un `void`
  // détaché mourrait avec la réponse, en « TypeError: fetch failed » (cf.
  // lib/server/after-safe.ts).
  pushNotifications(service, kept);
}

/** Le volet push d'`insertNotifications`, isolé pour se lire seul. Best-effort
    de bout en bout : rien de ce qui suit ne remonte à l'appelant. */
function pushNotifications(service: SupabaseClient, kept: NotificationRow[]): void {
  if (!isPushConfigured()) return;
  afterOrNow(async () => {
    const ctx = await loadPushContext(service, kept);
    // Séquentiel par destinataire : `sendPushToUser` parallélise déjà par
    // appareil, et un insert vise rarement plus d'une poignée de personnes.
    for (const row of kept) {
      await sendPushToUser(service, row.user_id, (locale) =>
        buildPushPayload(ctx, row, locale)
      );
    }
  });
}

/** The set of userIds that can access a project (owner + members). */
export async function projectMemberIds(
  service: SupabaseClient,
  projectId: string
): Promise<Set<string>> {
  const [{ data: proj }, { data: members }] = await Promise.all([
    service.from("projects").select("owner_id").eq("id", projectId).maybeSingle(),
    service.from("project_members").select("user_id").eq("project_id", projectId),
  ]);
  const set = new Set<string>();
  if (proj?.owner_id) set.add(proj.owner_id as string);
  for (const m of members ?? []) set.add(m.user_id as string);
  return set;
}
