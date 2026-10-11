import { spawn, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Always create a disposable local database; no connection URL is accepted.
const enabled = process.env.MINDDY_ROUTINE_DB_TEST === "1";
const container = `minddy-routine-test-${randomUUID()}`;
const owner = randomUUID(), project = randomUUID(), routine = randomUUID();
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
const row = async (statement: string) => JSON.parse(await sql(statement));
const event = async (subject: string) => Number(await sql(`SELECT max(id) FROM routine_events WHERE subject_id='${subject}';`));
const arming = async (id: number) => row(`SELECT row_to_json(a) FROM arm_routine_event('${routine}',1,${id}) a;`);

describe.skipIf(!enabled)("transactional routine events on isolated PostgreSQL", () => {
  beforeAll(async () => {
    execFileSync("docker", ["run", "--name", container, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-d", "postgres:17"], { stdio: "pipe" });
    for (let i = 0; i < 100; i++) {
      try { execFileSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { stdio: "pipe" }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    for (const file of ["test/routine-events-fixture.sql", "supabase/migrations/20270106780000_numo_routine_occurrences.sql", "supabase/migrations/20270109200043_enriched_routines.sql"]) await sql(readFileSync(file, "utf8"));
    await sql(`INSERT INTO projects VALUES('${project}','${owner}',NULL);
      INSERT INTO agent_routines(id,project_id,owner_id,title,prompt,trigger_type,trigger) VALUES('${routine}','${project}','${owner}','Test','Test','event','{"type":"event","event":"issue.created"}');`);
  }, 30_000);
  afterAll(() => { if (enabled) execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" }); });

  it("journals source mutations atomically, with no private text", async () => {
    const issue = randomUUID(), category = randomUUID();
    await sql(`BEGIN; INSERT INTO issues(id,project_id,title) VALUES('${issue}','${project}','private secret'); ROLLBACK;`);
    expect(await sql(`SELECT count(*) FROM routine_events WHERE subject_id='${issue}';`)).toBe("0");
    await sql(`INSERT INTO issues(id,project_id,title) VALUES('${issue}','${project}','private secret');
      UPDATE issues SET status='triage',assignee_id='${owner}' WHERE id='${issue}';
      INSERT INTO issue_categories VALUES('${issue}','${category}');
      INSERT INTO comments VALUES('${randomUUID()}','${issue}','private comment');`);
    const events = await row(`SELECT json_agg(e ORDER BY id) FROM routine_events e WHERE subject_id='${issue}';`);
    expect(events.map((e: {event: string}) => e.event)).toEqual(["issue.created","issue.status_changed","issue.assigned","issue.updated","issue.comment_added"]);
    expect(JSON.stringify(events)).not.toContain("private");
    expect(events[3].after_state.category).toEqual([category]);
    await sql(`UPDATE issues SET priority='high' WHERE id='${issue}';`);
    expect(await sql(`SELECT count(*) FROM routine_events WHERE subject_id='${issue}' AND event='issue.assigned';`)).toBe("1");
  });

  it("keeps pending private feedback separate from publication and restorations separate from arrivals", async () => {
    const feedback = randomUUID(), database = randomUUID(), page = randomUUID();
    await sql(`INSERT INTO feedback_posts(id,project_id,title,body) VALUES('${feedback}','${project}','private','pending');
      UPDATE feedback_posts SET is_public=true,review_state='approved' WHERE id='${feedback}';
      INSERT INTO pages(id,project_id,page_is_database) VALUES('${database}','${project}',true);
      INSERT INTO pages(id,project_id,parent_id,property_values) VALUES('${page}','${project}','${database}','{"secret":"hidden"}');
      UPDATE pages SET deleted_at=now() WHERE id='${page}'; UPDATE pages SET deleted_at=NULL WHERE id='${page}';`);
    expect(await sql(`SELECT string_agg(event,',' ORDER BY id) FROM routine_events WHERE subject_id='${feedback}';`)).toBe("feedback.received,feedback.updated");
    expect(await sql(`SELECT count(*) FROM routine_events WHERE subject_id='${page}' AND event='page.arrived';`)).toBe("1");
    expect(await sql(`SELECT after_state::text FROM routine_events WHERE subject_id='${page}' ORDER BY id LIMIT 1;`)).not.toContain("secret");
  });

  it("serializes concurrent claims per subject, then recovers an expired lease", async () => {
    await sql("UPDATE routine_events SET processed_at=now();");
    const issue = randomUUID();
    await sql(`INSERT INTO issues(id,project_id) VALUES('${issue}','${project}'); UPDATE issues SET status='triage' WHERE id='${issue}';`);
    const claimed = await Promise.all([sql("SELECT id FROM claim_routine_events(10);"), sql("SELECT id FROM claim_routine_events(10);")]);
    expect(claimed.filter(Boolean)).toHaveLength(1);
    await sql(`UPDATE routine_events SET lease_until=now()-interval '1 minute' WHERE subject_id='${issue}';`);
    expect(await sql("SELECT id FROM claim_routine_events(10);")).toBe(claimed.find(Boolean));
    await sql(`UPDATE routine_events SET processed_at=now() WHERE id=${claimed.find(Boolean)};`);
    expect(await sql("SELECT count(*) FROM claim_routine_events(10);")).toBe("1");
  });

  it("uses one stable arming and conversation across concurrent and crash retries", async () => {
    const issue = randomUUID();
    await sql(`INSERT INTO issues(id,project_id) VALUES('${issue}','${project}');`);
    const e = await event(issue);
    const [a,b] = await Promise.all([arming(e),arming(e)]);
    expect(a.id).toBe(b.id); expect(a.request_id).toBe(b.request_id);
    const claims = await Promise.all([sql(`SELECT id FROM claim_routine_arming('${a.id}',1);`),sql(`SELECT id FROM claim_routine_arming('${a.id}',1);`)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const reserve = () => row(`SELECT row_to_json(o) FROM ensure_numo_routine_occurrence('${routine}','${owner}','event',NULL,'${a.request_id}','Test','${a.id}') o;`);
    const [first, raced] = await Promise.all([reserve(),reserve()]);
    expect(first.id).toBe(raced.id); expect(first.conversation_id).toBe(raced.conversation_id);
    await sql(`UPDATE routine_armings SET lease_until=now()-interval '1 minute' WHERE id='${a.id}'; SELECT id FROM claim_routine_arming('${a.id}',1);`);
    expect((await reserve()).conversation_id).toBe(first.conversation_id);
    expect(await sql(`SELECT count(*) FROM numo_routine_occurrences WHERE arming_id='${a.id}';`)).toBe("1");
    await expect(sql(`SELECT ensure_numo_routine_occurrence('${routine}','${randomUUID()}','event',NULL,'${a.request_id}','Test','${a.id}');`)).rejects.toThrow("routine_not_found");
  });

  it("invalidates armings on edits and never replays events from before activation", async () => {
    const issue = randomUUID();
    await sql(`INSERT INTO issues(id,project_id) VALUES('${issue}','${project}');`);
    const e = await event(issue), a = await arming(e);
    await sql(`UPDATE agent_routines SET enabled=false WHERE id='${routine}';`);
    expect(await sql(`SELECT id FROM claim_routine_arming('${a.id}',1);`)).toBe("");
    await sql(`UPDATE agent_routines SET enabled=true WHERE id='${routine}';`);
    expect(await sql(`SELECT id FROM arm_routine_event('${routine}',3,${e});`)).toBe("");
    await sql("SELECT cleanup_routine_events();");
    expect(await sql(`SELECT state FROM routine_armings WHERE id='${a.id}';`)).toBe("cancelled");
    await sql(`UPDATE agent_routines SET trigger_revision=1,trigger_activated_at=now() WHERE id='${routine}';`);
  });

  it("trusts only service attribution, suppresses backup replay and blocks causal cycles", async () => {
    const issue = randomUUID(), parent = randomUUID();
    await sql(`BEGIN; SET LOCAL request.jwt.claims='{"role":"service_role"}'; SET LOCAL request.headers='{"x-minddy-routine-suppress":"true"}'; INSERT INTO issues(id,project_id) VALUES('${issue}','${project}'); COMMIT;`);
    expect(await sql(`SELECT count(*) FROM routine_events WHERE subject_id='${issue}';`)).toBe("0");
    await sql(`BEGIN; SET LOCAL request.jwt.claims='{"role":"authenticated"}'; SET LOCAL request.headers='{"x-minddy-routine-suppress":"true"}'; UPDATE issues SET status='triage' WHERE id='${issue}'; COMMIT;`);
    expect(await sql(`SELECT count(*) FROM routine_events WHERE subject_id='${issue}';`)).toBe("1");
    await sql(`BEGIN; SET LOCAL request.jwt.claims='{"role":"service_role"}'; SET LOCAL request.headers='{"x-minddy-routine-cause":"${parent}","x-minddy-routine-ancestors":"[\\"${routine}\\",\\"${parent}\\"]"}'; UPDATE issues SET status='todo' WHERE id='${issue}'; COMMIT;`);
    expect(await sql(`SELECT id FROM arm_routine_event('${routine}',1,${await event(issue)});`)).toBe("");
    await expect(sql("SET ROLE authenticated; SELECT * FROM routine_events;")).rejects.toThrow("permission denied");
    await expect(sql("SET ROLE authenticated; SELECT claim_routine_events();")).rejects.toThrow("permission denied");
  });

  it("orders category edits and issue transitions under concurrent source transactions", async () => {
    const issue = randomUUID(), category = randomUUID();
    await sql(`INSERT INTO issues(id,project_id) VALUES('${issue}','${project}');`);
    await Promise.all([
      sql(`BEGIN; INSERT INTO issue_categories VALUES('${issue}','${category}'); SELECT pg_sleep(0.1); COMMIT;`),
      sql(`BEGIN; UPDATE issues SET status='triage',assignee_id='${owner}' WHERE id='${issue}'; COMMIT;`),
    ]);
    const rows = await row(`SELECT json_agg(e ORDER BY id) FROM routine_events e WHERE subject_id='${issue}';`);
    expect(rows.map((r: {event: string}) => r.event).sort()).toEqual(['issue.created','issue.updated','issue.status_changed','issue.assigned'].sort());
    expect(rows.at(-1).after_state).toMatchObject({ status: 'triage', assignee: owner, category: [category] });
  });

  it("keeps archived proposal identity unique and rejects plaintext trigger leakage", async () => {
    const archived = randomUUID();
    await sql(`CREATE TRIGGER agent_routine_content_guard BEFORE INSERT OR UPDATE ON agent_routines FOR EACH ROW EXECUTE FUNCTION guard_agent_routine_content();
      INSERT INTO agent_routines(id,project_id,owner_id,enabled,legacy_source_key) VALUES('${archived}','${project}','${owner}',false,'archived-rule');`);
    await expect(sql(`INSERT INTO agent_routines(id,project_id,owner_id,enabled,legacy_source_key) VALUES('${randomUUID()}','${project}','${owner}',false,'archived-rule');`)).rejects.toThrow('unique');
    await expect(sql(`UPDATE agent_routines SET encryption_version=1,encrypted_content='{"keyVersion":1}',title=NULL,prompt=NULL,prompt_mentions=NULL,base_branch=NULL,trigger='{"type":"schedule"}' WHERE id='${archived}';`)).rejects.toThrow('agent_routine_content_state_invalid');
    await sql(`UPDATE agent_routines SET encryption_version=1,encrypted_content='{"keyVersion":1}',title=NULL,prompt=NULL,prompt_mentions=NULL,base_branch=NULL,trigger=NULL WHERE id='${archived}';`);
    await expect(sql(`UPDATE agent_routines SET trigger='{"type":"schedule"}' WHERE id='${archived}';`)).rejects.toThrow('agent_routine_content_downgrade');
  });


  it("measures a trigger delay from the event rather than the recovery time", async () => {
    const issue = randomUUID();
    await sql(`INSERT INTO issues(id,project_id) VALUES('${issue}','${project}');
      UPDATE agent_routines SET trigger_activated_at=now()-interval '10 minutes' WHERE id='${routine}';
      UPDATE routine_events SET created_at=now()-interval '5 minutes' WHERE subject_id='${issue}';`);
    const e = await event(issue);
    const a = await row(`SELECT row_to_json(a) FROM arm_routine_event('${routine}',1,${e},30) a;`);
    expect(await sql(`SELECT extract(epoch FROM a.retry_at-e.created_at)::integer FROM routine_armings a JOIN routine_events e ON e.id=a.event_id WHERE a.id='${a.id}';`)).toBe('1800');
    expect(await sql(`SELECT id FROM claim_routine_arming('${a.id}',1);`)).toBe('');
  });

});
