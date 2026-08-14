import "server-only";

import { after } from "next/server";
import { createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventRow } from "@/lib/server/issue-events";
import { safeFetch } from "@/lib/server/safe-fetch";

/**
 * Webhooks sortants des intégrations (API Feedback). Branchés sur insertEvents
 * — l'entonnoir unique des événements d'issue — et livrés dans after() pour ne
 * jamais retarder la réponse. Best-effort : timeout 5s, une relance sur échec
 * réseau/5xx, dernière tentative mémorisée sur l'intégration pour l'UI.
 *
 * Signature : X-Minddy-Signature = sha256=HMAC_SHA256(corps, key_hash). Le
 * secret est l'empreinte sha256 hex de la clé API — le récepteur la recalcule
 * à partir de la clé qu'il détient déjà, minddy ne stockant jamais le clair.
 *
 * La livraison sort par `safeFetch` (MIN-341) : l'URL vient d'un utilisateur,
 * elle ne doit pas pouvoir viser le réseau interne ni le service de métadonnées
 * du cloud. Et ce qu'on garde de la réponse est un état, pas un code : le
 * détail HTTP d'un hôte arbitraire, rendu à qui a réglé le webhook, ferait de
 * la fonctionnalité un scanner de ports.
 */

export const WEBHOOK_EVENTS = [
  "issue.created",
  "issue.status_changed",
  "issue.updated",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const isWebhookEvent = (v: unknown): v is WebhookEvent =>
  typeof v === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(v);

export const WEBHOOK_SCOPES = ["integration", "all"] as const;
export type WebhookScope = (typeof WEBHOOK_SCOPES)[number];
export const isWebhookScope = (v: unknown): v is WebhookScope =>
  typeof v === "string" && (WEBHOOK_SCOPES as readonly string[]).includes(v);

const TIMEOUT_MS = 5000;
/** On ne lit rien de la réponse : de quoi voir les en-têtes, et on coupe. */
const MAX_RESPONSE_BYTES = 4096;

/**
 * Ce que l'UI et les agents apprennent d'une livraison : elle a été acceptée,
 * ou non. Rien de plus — pas le code, pas le message. Les lignes écrites avant
 * MIN-341 portent encore un code HTTP : elles sont ramenées ici, à la lecture,
 * plutôt que réécrites en base.
 */
export type WebhookDeliveryStatus = "ok" | "failed";

export function normalizeWebhookStatus(
  stored: string | null,
): WebhookDeliveryStatus | null {
  if (!stored) return null;
  return stored === "ok" || /^2\d\d$/.test(stored) ? "ok" : "failed";
}

interface Change {
  field: string;
  from?: string | null;
  to?: string | null;
}

/** Map an activity row to (webhook event, change entry) — null = not followed. */
function mapRow(row: EventRow): { event: WebhookEvent; change: Change | null } | null {
  if (row.type === "created") return { event: "issue.created", change: null };
  if (row.type === "updated") {
    const change: Change = { field: row.field ?? "unknown" };
    // description/plan record no diff — their change entry carries no values.
    if (row.field !== "description" && row.field !== "plan") {
      change.from = row.from_value ?? null;
      change.to = row.to_value ?? null;
    }
    return {
      event: row.field === "status" ? "issue.status_changed" : "issue.updated",
      change,
    };
  }
  if (row.type === "category_added" || row.type === "category_removed") {
    return {
      event: "issue.updated",
      change: { field: "categories", from: row.from_value ?? null, to: row.to_value ?? null },
    };
  }
  if (row.type === "sub_issue_added" || row.type === "sub_issue_removed") {
    return {
      event: "issue.updated",
      change: { field: "sub_issues", from: row.from_value ?? null, to: row.to_value ?? null },
    };
  }
  return null;
}

async function deliver(
  service: SupabaseClient,
  integration: { id: string; key_hash: string; webhook_url: string },
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", integration.key_hash)
    .update(body)
    .digest("hex");
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "minddy-webhooks",
    "X-Minddy-Event": event,
    "X-Minddy-Delivery": String(payload.delivery_id),
    "X-Minddy-Signature": `sha256=${signature}`,
  };

  let status: WebhookDeliveryStatus;
  // Aucune redirection : la charge est signée pour la destination que l'owner a
  // réglée, et un 302 la ferait partir ailleurs — vers un hôte que personne n'a
  // choisi, et qui n'aurait pas passé le contrôle d'adresse.
  const attempt = async () => {
    const res = await safeFetch(integration.webhook_url, {
      method: "POST",
      headers,
      body,
      maxBytes: MAX_RESPONSE_BYTES,
      onOverflow: "truncate",
      maxRedirects: 0,
      timeoutMs: TIMEOUT_MS,
    });
    return res.status;
  };
  try {
    let code = await attempt().catch(() => null);
    // Une relance immédiate sur échec réseau/timeout ou 5xx.
    if (code === null || code >= 500) {
      code = await attempt().catch(() => null);
    }
    status = code !== null && code >= 200 && code < 300 ? "ok" : "failed";
  } catch {
    status = "failed";
  }

  await service
    .from("integrations")
    .update({ webhook_last_status: status, webhook_last_at: new Date().toISOString() })
    .eq("id", integration.id)
    .then(({ error }) => {
      if (error) console.error("[webhooks] last_status update:", error.message);
    });
}

/**
 * Dispatch the webhooks matching a freshly-inserted batch of activity rows.
 * Synchronous no-op when nothing maps to a followed event; all queries and
 * deliveries otherwise run after the response via after().
 */
export function dispatchWebhooksForEvents(
  service: SupabaseClient,
  rows: EventRow[]
): void {
  const mapped = rows
    .map((row) => ({ row, hit: mapRow(row) }))
    .filter((m): m is { row: EventRow; hit: NonNullable<ReturnType<typeof mapRow>> } => !!m.hit);
  if (mapped.length === 0) return;

  const run = async () => {
    try {
      // Only issue-scoped rows reach here (insertEvents filters objective
      // events out), but the type is now nullable — narrow defensively.
      const issueIds = [
        ...new Set(
          mapped
            .map((m) => m.row.issue_id)
            .filter((id): id is string => typeof id === "string")
        ),
      ];
      const { data: issues } = await service
        .from("issues")
        .select("id, project_id, number, title, status, priority, effort, integration_id")
        .is("deleted_at", null)
        .in("id", issueIds);
      if (!issues?.length) return;
      const issueById = new Map(issues.map((i) => [i.id as string, i]));

      const projectIds = [...new Set(issues.map((i) => i.project_id as string))];
      // `kind = issues` : un webhook ne livre que des événements d'issue, et une
      // clé feedback n'en crée aucune. La règle est refusée à l'écriture
      // (lib/server/integrations.ts) ; on la tient aussi ici, pour qu'une
      // configuration antérieure à la règle cesse de partir.
      const { data: hooks } = await service
        .from("integrations")
        .select("id, project_id, name, key_hash, webhook_url, webhook_events, webhook_scope")
        .in("project_id", projectIds)
        .eq("kind", "issues")
        .not("webhook_url", "is", null)
        .is("revoked_at", null);
      if (!hooks?.length) return;

      const { data: projects } = await service
        .from("projects")
        .select("id, name, key")
        .in("id", projectIds);
      const projectById = new Map((projects ?? []).map((p) => [p.id as string, p]));

      // Groupement par (webhook, issue, event) : une seule livraison
      // issue.updated portant toutes les modifications d'un même save.
      const now = new Date().toISOString();
      const deliveries: Promise<void>[] = [];
      for (const hook of hooks) {
        const events = (hook.webhook_events ?? []) as string[];
        for (const issueId of issueIds) {
          const issue = issueById.get(issueId);
          if (!issue || issue.project_id !== hook.project_id) continue;
          if (hook.webhook_scope === "integration" && issue.integration_id !== hook.id) {
            continue;
          }
          const project = projectById.get(issue.project_id as string);
          const issuePayload = {
            id: issue.id,
            number: issue.number,
            identifier: project ? `${project.key}-${issue.number}` : String(issue.number),
            title: issue.title,
            status: issue.status,
            priority: issue.priority,
            effort: issue.effort,
            created_via_integration: issue.integration_id === hook.id,
          };
          const base = {
            timestamp: now,
            project: project
              ? { id: project.id, name: project.name, key: project.key }
              : { id: issue.project_id },
            integration: { id: hook.id, name: hook.name },
            issue: issuePayload,
          };

          const rowsForIssue = mapped.filter((m) => m.row.issue_id === issueId);
          for (const event of WEBHOOK_EVENTS) {
            if (!events.includes(event)) continue;
            const hits = rowsForIssue.filter((m) => m.hit.event === event);
            if (hits.length === 0) continue;
            const changes = hits
              .map((m) => m.hit.change)
              .filter((c): c is Change => !!c);
            const payload: Record<string, unknown> = {
              event,
              delivery_id: randomUUID(),
              ...base,
            };
            if (event === "issue.status_changed") payload.change = changes[0] ?? null;
            else if (event === "issue.updated") payload.changes = changes;
            deliveries.push(
              deliver(
                service,
                hook as { id: string; key_hash: string; webhook_url: string },
                event,
                payload
              )
            );
          }
        }
      }
      await Promise.all(deliveries);
    } catch (e) {
      console.error("[webhooks] dispatch failed:", (e as Error).message);
    }
  };

  try {
    after(run());
  } catch {
    // Hors requête (script, cron) : best-effort sans after().
    void run();
  }
}
