import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106340000_agent_lifecycle_concurrency.sql"),
);

describe("agent lifecycle concurrency migration", () => {
  it("keeps pull request observations monotonic and linking serialized", () => {
    expect(sql).toContain("create or replace function public.upsert_pull_request_monotonic");
    expect(sql).toContain("v_incoming_updated_at > v_current.updated_at");
    expect(sql).toContain("hashtextextended('issue:' || v_lock_issue_id::text, 459)");
    expect(sql).toContain("create or replace function public.link_pull_request_to_issue_atomic");
    expect(sql).toContain("return 'issue_already_linked'");
  });

  it("reserves the run-wide inline comment limit with one conditional update", () => {
    expect(sql).toContain("create or replace function public.reserve_agent_pr_inline_comment");
    expect(sql).toContain("pr_inline_comments_used = pr_inline_comments_used + 1");
    expect(sql).toContain("pr_inline_comments_used < p_limit");
  });

  it("serializes run creation with latest-run message insertion", () => {
    expect(sql).toContain("create trigger agent_runs_lock_anchor_on_insert");
    expect(sql.match(/'agent-run:' \|\| v_anchor, 459/g)).toHaveLength(2);
    const lock = sql.indexOf("pg_advisory_xact_lock", sql.indexOf("insert_latest_agent_run_message"));
    const latest = sql.indexOf("order by created_at desc, id desc", lock);
    const insert = sql.indexOf("insert into public.agent_run_messages", latest);
    expect(lock).toBeGreaterThan(0);
    expect(latest).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(latest);
  });

  it("copies run PR state from the locked current pull request row", () => {
    const fn = sql.indexOf("create or replace function public.sync_agent_runs_from_pull_request");
    const lock = sql.indexOf("for share", fn);
    const update = sql.indexOf("update public.agent_runs as run", lock);
    expect(fn).toBeGreaterThan(0);
    expect(lock).toBeGreaterThan(fn);
    expect(update).toBeGreaterThan(lock);
    expect(sql.slice(update)).toContain("set pr_state = v_pr.state");
  });
});
