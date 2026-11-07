import { spawn, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Opt-in like routine-events.integration.test.ts: a disposable PostgreSQL
// container, never a connection URL. MINDDY_ROUTINE_DB_TEST=1 enables it.
const enabled = process.env.MINDDY_ROUTINE_DB_TEST === "1";
const container = `minddy-numo-batches-test-${randomUUID()}`;
const owner = randomUUID(), member = randomUUID(), dormant = randomUUID(), memoryOff = randomUUID();
const project = randomUUID(), issue = randomUUID();

function sql(statement: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-XAtq", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", chunk => { out += chunk; });
    child.stderr.on("data", chunk => { err += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
    child.stdin.end(statement);
  });
}
const lastEvent = async () => Number(await sql("SELECT max(id) FROM routine_events;"));
const route = async (id: number) => Number(await sql(`SELECT route_numo_event(${id});`));
/** Journal one event `minutes` after now and route it. */
async function journal(minutes: number, values: { subject?: string; event?: string; actor?: string | null } = {}) {
  await sql(`INSERT INTO routine_events(project_id,subject_type,subject_id,event,created_at,actor_id,actor_kind)
    VALUES('${project}','${values.event === "page.updated" ? "page" : "issue"}','${values.subject ?? issue}','${values.event ?? "issue.updated"}',
    now()+interval '${minutes} minutes',${values.actor ? `'${values.actor}'` : "NULL"},'${values.actor ? "user" : "system"}');`);
  const id = await lastEvent();
  await route(id);
  return id;
}
const batchOf = async (user: string) => {
  const raw = await sql(`SELECT row_to_json(b) FROM (SELECT event_ids, extract(epoch FROM due_at-opened_at)/60 AS span
    FROM numo_event_batches WHERE user_id='${user}' AND status='open') b;`);
  return raw ? JSON.parse(raw) as { event_ids: number[]; span: number } : null;
};

describe.skipIf(!enabled)("Numo event batches on isolated PostgreSQL (MIN-926)", () => {
  beforeAll(async () => {
    execFileSync("docker", ["run", "--name", container, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-d", "postgres:17"], { stdio: "pipe" });
    for (let i = 0; i < 100; i++) {
      try { execFileSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { stdio: "pipe" }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    for (const file of [
      "test/routine-events-fixture.sql", "test/numo-event-batches-fixture.sql",
      "supabase/migrations/20270106780000_numo_routine_occurrences.sql",
      "supabase/migrations/20270109200043_enriched_routines.sql",
      "supabase/migrations/20270109200071_routine_event_cascade_guard.sql",
      "supabase/migrations/20270109200103_numo_event_batches.sql",
      "supabase/migrations/20270109200104_numo_event_batches_review.sql",
    ]) await sql(readFileSync(file, "utf8"));
    await sql(`INSERT INTO projects VALUES('${project}','${owner}',NULL);
      INSERT INTO auth.users(id,raw_user_meta_data,last_sign_in_at) VALUES
        ('${owner}','{"numo_background":true}',now()),
        ('${member}','{"numo_background":true}',now()-interval '60 days'),
        ('${dormant}','{"numo_background":true}',now()-interval '60 days'),
        ('${memoryOff}','{"numo_background":true,"numo_memory":false}',now());
      INSERT INTO auth.sessions(user_id,created_at,refreshed_at) VALUES('${member}',now()-interval '40 days',(now()-interval '1 day')::timestamp);
      INSERT INTO project_members(project_id,user_id) VALUES('${project}','${member}'),('${project}','${dormant}'),('${project}','${memoryOff}');
      INSERT INTO issues(id,project_id,title) VALUES('${issue}','${project}','Fixture');`);
  }, 30_000);
  afterAll(() => { if (enabled) execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" }); });
  beforeEach(async () => { await sql("DELETE FROM numo_event_batches;"); });

  it("reaches active members only: not a dormant account, not one with the memory off", async () => {
    const recipients = (await sql(`SELECT string_agg(r::text, ',') FROM numo_event_recipients('${project}', NULL) r;`)).split(",");
    expect(recipients.sort()).toEqual([owner, member].sort());
  });

  it("pushes the deadline five minutes per event, never past ten minutes", async () => {
    await journal(0);
    expect((await batchOf(owner))?.span).toBeCloseTo(5);
    await journal(4);
    expect((await batchOf(owner))?.span).toBeCloseTo(9);
    await journal(8);
    expect((await batchOf(owner))?.span).toBeCloseTo(10);
    expect((await batchOf(owner))?.event_ids).toHaveLength(3);
  });

  it("does not hand a member their own gesture, and replaying an event changes nothing", async () => {
    const id = await journal(0, { actor: member });
    expect(await batchOf(member)).toBeNull();
    expect((await batchOf(owner))?.event_ids).toEqual([id]);
    expect(await route(id)).toBe(0);
  });

  it("counts repeated saves of one page once per batch", async () => {
    const page = randomUUID();
    for (let i = 0; i < 3; i++) await journal(0, { subject: page, event: "page.updated" });
    expect((await batchOf(owner))?.event_ids).toHaveLength(1);
  });

  it("marks a Numo write through a member's session and never routes it", async () => {
    await sql(`SET request.jwt.claims='{"sub":"${member}","role":"authenticated"}';
      SET request.headers='{"x-minddy-actor-kind":"numo"}';
      UPDATE issues SET status='todo' WHERE id='${issue}';`);
    const row = await sql(`SELECT actor_id||','||actor_kind FROM routine_events ORDER BY id DESC LIMIT 1;`);
    expect(row).toBe(`${member},numo`);
    expect(await route(await lastEvent())).toBe(0);
  });

  it("trusts a header actor id only from the service role", async () => {
    await sql(`SET request.jwt.claims='{"sub":"${member}","role":"authenticated"}';
      SET request.headers='{"x-minddy-actor-id":"${owner}"}';
      UPDATE issues SET priority='high' WHERE id='${issue}';`);
    expect(await sql("SELECT actor_id FROM routine_events ORDER BY id DESC LIMIT 1;")).toBe(member);
    await sql(`SET request.jwt.claims='{"role":"service_role"}';
      SET request.headers='{"x-minddy-actor-id":"${owner}"}';
      UPDATE issues SET priority='low' WHERE id='${issue}';`);
    expect(await sql("SELECT actor_id FROM routine_events ORDER BY id DESC LIMIT 1;")).toBe(owner);
  });

  it("hands a due batch to one claimer only", async () => {
    await journal(0);
    expect(await sql("SELECT count(*) FROM claim_numo_event_batches(10);")).toBe("0");
    await sql("UPDATE numo_event_batches SET opened_at=now()-interval '6 minutes', due_at=now()-interval '1 minute';");
    const [first, second] = await Promise.all([
      sql("SELECT count(*) FROM claim_numo_event_batches(10);"),
      sql("SELECT count(*) FROM claim_numo_event_batches(10);"),
    ]);
    expect(Number(first) + Number(second)).toBe(2);
    expect(await sql("SELECT count(*) FROM claim_numo_event_batches(10);")).toBe("0");
  });

  it("journals objective and pull request gestures with their actor", async () => {
    const objective = randomUUID();
    await sql(`INSERT INTO objectives(id,project_id) VALUES('${objective}','${project}');
      UPDATE objectives SET status='in_progress' WHERE id='${objective}';
      INSERT INTO issue_events(issue_id,actor_id,type) VALUES('${issue}','${member}','pr_opened'),('${issue}',NULL,'pr_committed');
      INSERT INTO issue_events(issue_id,actor_id,type,via_assistant) VALUES('${issue}','${owner}','pr_accepted',true);`);
    const rows = await sql(`SELECT string_agg(event||':'||actor_kind, ',' ORDER BY id) FROM routine_events
      WHERE event IN ('objective.status_changed','issue.pull_request');`);
    expect(rows).toBe("objective.status_changed:system,issue.pull_request:user,issue.pull_request:numo");
  });
  it("never batches a replayed event again, even after its first batch closed", async () => {
    const id = await journal(0);
    await sql("UPDATE numo_event_batches SET status='done';");
    expect(await route(id)).toBe(0);
    expect(await batchOf(owner)).toBeNull();
  });

  it("only marks a row the application filtered out", async () => {
    await sql(`INSERT INTO routine_events(project_id,subject_type,subject_id,event,actor_kind)
      VALUES('${project}','issue','${issue}','issue.updated','system');`);
    const id = await lastEvent();
    expect(Number(await sql(`SELECT route_numo_event(${id}, false);`))).toBe(0);
    expect(await sql(`SELECT numo_routed_at IS NOT NULL FROM routine_events WHERE id=${id};`)).toBe("t");
    expect(await batchOf(owner)).toBeNull();
  });

  it("closes a batch whose worker died three times instead of handing it out again", async () => {
    await journal(0);
    await sql("UPDATE numo_event_batches SET status='processing', attempts=3, claimed_at=now()-interval '20 minutes';");
    expect(await sql("SELECT count(*) FROM claim_numo_event_batches(10);")).toBe("0");
    expect(await sql("SELECT DISTINCT status||':'||error_code FROM numo_event_batches;")).toBe("done:abandoned");
  });

  it("marks Numo's comment reply as Numo's though it carries the human author", async () => {
    await sql(`INSERT INTO comments(id,issue_id,body,author_id,via_assistant) VALUES(gen_random_uuid(),'${issue}','reply','${member}',true);`);
    expect(await sql("SELECT actor_kind FROM routine_events ORDER BY id DESC LIMIT 1;")).toBe("numo");
    expect(await route(await lastEvent())).toBe(0);
  });

  it("journals objective comments and page comments", async () => {
    const objective = randomUUID(), page = randomUUID();
    await sql(`INSERT INTO objectives(id,project_id) VALUES('${objective}','${project}');
      INSERT INTO pages(id,project_id,title) VALUES('${page}','${project}','Notes');
      INSERT INTO comments(id,objective_id,body,author_id) VALUES(gen_random_uuid(),'${objective}','x','${member}');
      INSERT INTO page_comments(page_id,author_id,body) VALUES('${page}','${member}','y');`);
    const rows = await sql(`SELECT string_agg(subject_type||':'||event||':'||actor_kind, ',' ORDER BY id) FROM routine_events
      WHERE event IN ('objective.comment_added','page.comment_added');`);
    expect(rows).toBe("objective:objective.comment_added:user,page:page.comment_added:user");
  });

  it("routes a mention to the mentioned member only", async () => {
    await sql(`INSERT INTO notifications(user_id,project_id,type,issue_id,actor_id) VALUES('${owner}','${project}','mention','${issue}','${member}'),
      ('${member}','${project}','assigned','${issue}','${owner}');`);
    expect(await sql("SELECT count(*) FROM routine_events WHERE event='mention.received';")).toBe("1");
    const id = Number(await sql("SELECT max(id) FROM routine_events WHERE event='mention.received';"));
    expect(await route(id)).toBe(1);
    expect((await batchOf(owner))?.event_ids).toEqual([id]);
    expect(await batchOf(member)).toBeNull();
  });

  it("lets automated work name itself instead of borrowing the row's author", async () => {
    await sql(`SET request.jwt.claims='{"role":"service_role"}';
      SET request.headers='{"x-minddy-actor-kind":"system"}';
      INSERT INTO comments(id,issue_id,body,author_id) VALUES(gen_random_uuid(),'${issue}','sync','${member}');`);
    expect(await sql("SELECT coalesce(actor_id::text,'none')||','||actor_kind FROM routine_events ORDER BY id DESC LIMIT 1;")).toBe("none,system");
    await sql(`SET request.headers='{"x-minddy-actor-kind":"maintenance"}';
      UPDATE issues SET priority='none' WHERE id='${issue}';`);
    expect(await sql("SELECT actor_kind FROM routine_events ORDER BY id DESC LIMIT 1;")).toBe("maintenance");
    expect(await route(await lastEvent())).toBe(0);
  });
});
