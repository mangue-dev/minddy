import { describe, expect, it } from "vitest";
import { canonicalSql, readBaseline } from "@/test/sql-migrations";

const sql = canonicalSql(readBaseline());

describe("agent conversation migration", () => {
  it("separe identite, contextes, tours, messages et lectures", () => {
    for (const table of [
      "agent_conversations",
      "agent_conversation_contexts",
      "agent_runtime_sessions",
      "agent_artifacts",
      "agent_turns",
      "agent_messages",
      "agent_conversation_reads",
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
    }
  });

  it("ne distribue plus le verrou qui faisait du ticket une identite d'execution", () => {
    expect(sql).not.toContain("idx_agent_runs_active_issue");
  });

  it("conserve un verrou propre aux passages d'une meme chaîne", () => {
    expect(sql).toContain("create unique index idx_agent_runs_active_chain");
    expect(sql).toMatch(/on public\.agent_runs using btree \(chain_id\)/);
  });

  it("utilise une visibilite explicite dans les policies", () => {
    expect(sql).toContain("array['private'::text, 'project'::text]");
    expect(sql).toMatch(/c\.visibility = 'project'::text\) or \(c\.owner_id = \( select auth\.uid\(\)/);
  });

  it("interdit de rattacher un run ou une notification au mauvais projet", () => {
    expect(sql).toContain("foreign key (conversation_id, project_id)");
    expect(sql).toContain("foreign key (agent_conversation_id, project_id)");
    expect(sql).toContain("references public.agent_conversations(id, project_id)");
  });

  it("maintient la date d'activite de la conversation", () => {
    expect(sql).toContain("create or replace trigger agent_conversations_set_updated_at");
    expect(sql).toContain("execute function public.set_updated_at()");
    expect(sql).toContain("after insert or update of title, issue_id, pull_request_id, status, completed_at");
    expect(sql.match(/update public\.agent_conversations/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("crée le prompt initial une seule fois, à l'insertion du run", () => {
    expect(sql).toContain("create or replace trigger trg_agent_run_create_turn after insert on public.agent_runs");
    expect(sql).toContain("'initial_prompt', new.created_at");
  });

  it("rattache au nouveau tour un steering arrive pendant la fin du precedent", () => {
    expect(sql).toContain("returning id into new_turn_id");
    expect(sql).toContain("qm.run_id = new.id and qm.consumed_at is null");
    expect(sql).toContain("set turn_id = new_turn_id");
  });
});
