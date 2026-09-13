import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106760000_numo_surface_conversations.sql"),
);

describe("Numo shared-surface conversation migration", () => {
  it("maps every supported shared surface to one actor-private conversation", () => {
    expect(sql).toContain("create table public.numo_surface_threads");
    for (const surface of [
      "issue_comment",
      "objective_comment",
      "page_comment",
      "feedback_comment",
      "pull_request_comment",
    ]) {
      expect(sql).toContain(`'${surface}'`);
    }
    expect(sql).toContain("unique (surface, source_thread_id, actor_id)");
    expect(sql).toContain("constraint numo_surface_threads_conversation_unique unique (conversation_id)");
  });

  it("deduplicates source events while retaining explicit response destinations", () => {
    expect(sql).toContain("create table public.numo_surface_events");
    expect(sql).toContain("constraint numo_surface_events_source_unique unique (thread_id, source_event_id)");
    expect(sql).toContain("destination jsonb not null");
    expect(sql).toContain("turn_id uuid references public.numo_assistant_turns(id)");
  });

  it("keeps mappings and private delivery metadata server-only", () => {
    expect(sql).toContain("alter table public.numo_surface_threads enable row level security");
    expect(sql).toContain("alter table public.numo_surface_events enable row level security");
    expect(sql).toContain("revoke all on public.numo_surface_threads, public.numo_surface_events from public, anon, authenticated");
    expect(sql).toContain("grant all on public.numo_surface_threads, public.numo_surface_events to service_role");
  });
});
