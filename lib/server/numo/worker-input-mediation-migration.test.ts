import { describe, expect, it } from "vitest";

import { canonicalSql, readMigration } from "@/test/sql-migrations";

const sql = canonicalSql(
  readMigration("20270106730000_numo_worker_input_mediation.sql"),
);

function operation(name: string, next?: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = next ? sql.indexOf(`create or replace function public.${next}`, start) : sql.length;
  expect(start).toBeGreaterThan(0);
  return sql.slice(start, end < 0 ? sql.length : end);
}

describe("Numo worker input mediation migration", () => {
  it("captures worker questions as durable task-correlated pending input", () => {
    expect(sql).toContain("create table public.agent_run_input_requests");
    expect(sql).toContain("constraint agent_run_input_requests_identity_unique unique (run_id, question_id)");
    expect(sql).toContain("where status = 'pending'");
    const capture = operation("capture_agent_run_input_request", "cancel_agent_run_input_request");
    expect(capture).toContain("new.type not in ('needs_input', 'question')");
    expect(capture).toContain("new.payload ->> 'question_id'");
    expect(capture).toContain("new.payload -> 'questions'");
    expect(capture).toContain("on conflict (run_id, question_id) do nothing");
  });

  it("resumes only the exact active task and pending question", () => {
    const resume = operation("resume_numo_worker_input", "steer_numo_worker");
    expect(resume).toContain("v_turn.active_run_id is distinct from p_run_id");
    expect(resume).toContain("run_id = p_run_id and parent_numo_turn_id = p_parent_turn_id");
    expect(resume).toContain("and question_id = p_question_id");
    expect(resume).toContain("if v_input.status = 'answered' then return 'already'");
    expect(resume).toContain("if v_input.status <> 'pending' then return 'ignored'");
    expect(resume).toContain("v_run.status <> 'completed' or not v_run.awaiting_input");
    expect(resume).toContain("public.resume_latest_agent_run_with_message");
    expect(resume).toContain("set status = 'answered'");
  });

  it("isolates identical question identifiers belonging to different tasks", () => {
    expect(sql).toContain(
      "constraint agent_run_input_requests_identity_unique unique (run_id, question_id)",
    );
    const resume = operation("resume_numo_worker_input", "steer_numo_worker");
    expect(resume).toContain("v_turn.active_run_id is distinct from p_run_id");
    expect(resume).toContain("run_id = p_run_id and parent_numo_turn_id = p_parent_turn_id");
  });

  it("persists an answer and returns the parent to the same worker wait", () => {
    const resume = operation("resume_numo_worker_input", "steer_numo_worker");
    expect(sql).toContain("drop index public.assistant_messages_turn_user_unique");
    expect(resume).toContain("insert into public.assistant_messages");
    expect(resume).toContain("p_message_id, p_conversation_id, p_parent_turn_id, 'user'");
    expect(resume).toContain("'phase', 'worker_wait', 'active_run_id', p_run_id");
    expect(resume).toContain("where id = p_parent_turn_id and status = 'waiting_input'");
  });

  it("routes steering to only the active worker and interrupts its current round", () => {
    const steer = operation("steer_numo_worker", "request_numo_turn_stop");
    expect(steer).toContain("status in ('waiting_work', 'waiting_input')");
    expect(steer).toContain("v_turn.status = 'waiting_input'");
    expect(steer).toContain("'result', 'worker_input_pending'");
    expect(steer).toContain("id = v_turn.active_run_id and parent_numo_turn_id = v_turn.id");
    expect(steer).toContain("public.insert_latest_agent_run_message");
    expect(steer).toContain("insert into public.assistant_messages");
    expect(steer).toContain("set interrupt_requested = true");
    expect(steer).toContain("where id = v_run.id and status = 'running'");
  });

  it("cancels unanswered input on terminal runs and parent stops", () => {
    const cancel = operation("cancel_agent_run_input_request", "resume_numo_worker_input");
    expect(cancel).toContain("new.status in ('failed', 'canceled')");
    expect(cancel).toContain("new.status = 'completed' and not new.awaiting_input");
    const stop = operation("request_numo_turn_stop");
    expect(stop).toContain("set status = 'canceled'");
    expect(stop).toContain("parent_numo_turn_id = v_turn.id and status = 'pending'");
    expect(stop).toContain("set interrupt_requested = true");
  });

  it("keeps the decision journal server-written and owner-readable", () => {
    expect(sql).toContain("alter table public.agent_run_input_requests enable row level security");
    expect(sql).toContain(
      "where r.id = agent_run_input_requests.run_id and r.created_by = auth.uid()",
    );
    expect(sql).toContain("grant select on public.agent_run_input_requests to authenticated");
    expect(sql).toContain("grant all on public.agent_run_input_requests to service_role");
  });
});
