import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalSql, migrationFiles, readMigration } from "@/test/sql-migrations";
import { NUMO_TURN_EXITS, NUMO_TURN_STATUSES_WITH_DEADLINE } from "./turn-lifecycle";

/** The last migration that (re)defines a function: the one the database runs. */
function latestDefinition(name: string): string {
  const pattern = new RegExp(`create (or replace )?function public\\.${name}\\(`);
  const file = migrationFiles().filter((candidate) =>
    pattern.test(canonicalSql(readMigration(candidate)))).at(-1);
  if (!file) throw new Error(`No migration defines ${name}`);
  const sql = canonicalSql(readMigration(file));
  const start = sql.search(pattern);
  const end = sql.indexOf("$$;", sql.indexOf("$$", start) + 2);
  return sql.slice(start, end);
}

const recovery = latestDefinition("recover_stale_numo_turns");
const claim = latestDefinition("claim_numo_turn");
const toolClaim = latestDefinition("claim_numo_tool_operation");
const protectedToolClaim = latestDefinition("claim_numo_tool_operation_protected");
const turnsSource = readFileSync(join(process.cwd(), "lib/server/numo/turns.ts"), "utf8");
const drain = turnsSource.slice(turnsSource.indexOf("export async function drainNumoTurns"));

describe("Numo turn lifecycle contract (MIN-1011)", () => {
  it("gives every non-terminal status an automatic exit or a reason to stay open", () => {
    for (const [status, exit] of Object.entries(NUMO_TURN_EXITS)) {
      if (["completed", "failed", "stopped"].includes(status)) {
        expect(exit.kind, status).toBe("terminal");
        continue;
      }
      expect(exit.kind, status).not.toBe("terminal");
      if (exit.kind === "automatic") expect(exit.withinMinutes).toBeLessThanOrEqual(10);
    }
    // Only a question may wait for a person, and it never blocks the conversation.
    expect(Object.entries(NUMO_TURN_EXITS).filter(([, exit]) => exit.kind === "open")
      .map(([status]) => status)).toEqual(["waiting_input"]);
  });

  it("has the drain claim the queued and retryable turns", () => {
    expect(drain).toContain('.in("status", ["queued", "retryable"])');
    expect(claim).toContain("status = 'queued'");
    expect(claim).toContain("p_allow_retryable and status = 'retryable'");
    expect(drain).toContain("allowRetryable: true");
  });

  it("recovers stale leases and the turns parked on an interrupted call", () => {
    expect(recovery).toContain("where status in ('running', 'stopping') and claimed_at < now() - interval '6 minutes'");
    expect(recovery).toContain("when v_turn.status = 'stopping' then 'stopped' else 'retryable'");
    expect(recovery).toContain("where status = 'reconciling'");
    expect(recovery).toContain("set status = 'retryable', not_before = now()");
  });

  it("ends the questions nobody will answer, without touching the conversation", () => {
    expect(recovery).toContain("where waiting.status = 'waiting_input'");
    expect(recovery).toContain("(later.created_at, later.id) > (waiting.created_at, waiting.id)");
    expect(recovery).toContain("waiting.updated_at < now() - interval '7 days'");
    expect(recovery).toContain("from public.numo_routine_occurrences as occurrence");
    const questions = recovery.slice(recovery.indexOf("where waiting.status = 'waiting_input'") - 200);
    expect(questions).not.toContain("update public.conversations");
  });

  it("settles an interrupted call inside the resuming job instead of parking the turn", () => {
    for (const sql of [toolClaim, protectedToolClaim]) {
      expect(sql).toContain("p_resolve_ambiguous boolean default false");
      const resolve = sql.slice(sql.indexOf("if p_resolve_ambiguous then"));
      const resolved = resolve.slice(0, resolve.indexOf("end if;"));
      expect(resolved).toMatch(/'action', ?'resolve'/);
      expect(resolved).not.toContain("reconciling");
    }
    expect(turnsSource.match(/p_resolve_ambiguous: true/g)).toHaveLength(2);
  });

  it("alerts on the statuses that have a deadline, and only those", () => {
    expect(NUMO_TURN_STATUSES_WITH_DEADLINE.toSorted()).toEqual(
      ["queued", "reconciling", "retryable", "running", "stopping"],
    );
    expect(drain).toContain("await reportStuckNumoTurns(service)");
  });
});
