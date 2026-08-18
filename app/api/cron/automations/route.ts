import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import {
  cancelPendingChain,
  duePendingChains,
  lastRunOfChain,
  staleRunningChains,
} from "@/lib/server/automations/chain";
import { activeRunForChain } from "@/lib/server/agent/runs";
import { haltChain } from "@/lib/server/automations/report";
import { runAutomations } from "@/lib/server/automations/engine";
import type { AutomationSource } from "@/lib/automations";
import type { IssueStatus } from "@/lib/issue-constants";

/**
 * The CHAIN ​​SWEEPER on borrowed time (MIN-147).
 *
 * A channel opened by a status change waits a few minutes before
 * to start: time to change your mind, to copy the prompt to do so
 * yourself, or to reclassify the ticket. No one can keep this expectation in
 * the window of a `after()` — hence this cron.
 *
 * SEPARATE route of `agent-drain` on purpose: this one has a budget of 800 s, serves
 * dispatcher to preview deployments and must not see its window nibbled
 * by a job that has nothing to do with it. Here, each awakening is short — the engine does not
 * just throws a run and returns the hand.
 *
 * It is `runAutomations` which really decides: it re-checks that the condition
 * having opened the chain still holds (is the ticket still in this
 * status?) and cancels it otherwise. The sweeper just rings the doorbell.
 */

export const runtime = "nodejs";
/** A wake-up = a run launch, never its execution (it's the drain that has it). */
export const maxDuration = 300;

/** Enough to absorb a gust, little enough to fit in the window. */
const SWEEP_LIMIT = 50;

/**
 * After this delay, a suspended channel no longer makes sense: the world has changed
 * since the gesture that opened it. Without this expiry, a chain that the
 * engine refuses to start (manual run that never ends, project trashed)
 * remained `pending` FOREVER — and, the queue being sorted by seniority, a
 * fifty of them was enough to occupy 100% of each scan and to
 * starve all automation from the platform.
 */
const PENDING_MAX_LATENESS_MS = 60 * 60_000;

/**
 * After this silence, a `running` string is ABANDONED: its end hook
 * run was lost (frozen function, interspersed manual run which does not carry
 * `chain_id`, exception after advancement). Nothing else woke her, and
 * because `running` is part of the unique index, its ticket could never be
 * automated again.
 *
 * Far beyond the latency of a hook: we only catch up with what is
 * obviously dead. Catch-up is risk-free — it’s compare-and-set
 * of `advanceChain` which cuts at the end, so a merely slow event cannot
 * produce a duplicate launch.
 */
const RUNNING_STALE_MS = 15 * 60_000;

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const due = await duePendingChains(SWEEP_LIMIT);
  let expired = 0;
  let revived = 0;

  // In SERIES: two related chains almost always belong to the same project,
  // and each throws a run. Parallelizing them would only disrupt the quota
  // and the drain queue to save a few hundred milliseconds.
  let started = 0;
  for (const chain of due) {
    // Too late, or without an event set aside (handwritten line):
    // in both cases it will never start — we don't know WHY it
    // was opened, or the world has changed too much since then. We remove it from the line
    // rather than rereading it over and over again.
    const lateness = Date.now() - Date.parse(chain.not_before ?? chain.created_at);
    if (!chain.pending_event?.to || lateness > PENDING_MAX_LATENESS_MS) {
      await cancelPendingChain(chain.id, "expired").catch(() => null);
      expired++;
      continue;
    }
    try {
      await runAutomations({
        issueId: chain.issue_id,
        projectId: chain.project_id,
        chainId: chain.id,
        startPending: true,
        event: {
          type: "status_changed",
          from: null,
          to: chain.pending_event.to as IssueStatus,
          source: chain.pending_event.source as AutomationSource,
        },
      });
      started++;
    } catch (err) {
      // A chain that explodes must not carry away the following ones.
      console.error("[automations-cron] chain failed:", chain.id, (err as Error).message);
    }
  }

  // ── The net of ABANDONED chains ──────────────────────────────────────
  // A `running` string that no run carries anymore: we replay the end of its
  // last run, exactly what the “Continue” button does.
  for (const chain of await staleRunningChains(
    new Date(Date.now() - RUNNING_STALE_MS).toISOString(),
  )) {
    try {
      if (await activeRunForChain(chain.id)) continue; // it is still working
      const last = await lastRunOfChain(chain.id);
      if (!last) {
        // Advanced then never launched (exception between the two): nothing to replay.
        await haltChain(chain, "stalled");
        revived++;
        continue;
      }
      await runAutomations({
        issueId: chain.issue_id,
        projectId: chain.project_id,
        chainId: chain.id,
        event: {
          type: "run_finished",
          intent: last.intent ?? "implement",
          outcome: last.status === "completed" ? "ok" : "failed",
        },
      });
      revived++;
    } catch (err) {
      console.error("[automations-cron] revive failed:", chain.id, (err as Error).message);
    }
  }

  return NextResponse.json({ ok: true, due: due.length, started, expired, revived });
}

export const GET = handle;
export const POST = handle;
