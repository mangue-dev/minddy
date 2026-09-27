import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const container = "supabase_db_minddy-encryption-test";
const template = process.env.MINDDY_ERASURE_TEMPLATE ??
  "minddy_min591_followup_final_v3_20260927";
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sql(database, statement) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-At",
    "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database],
  { input: statement, encoding: "utf8" }).trim();
}

class Session {
  constructor(database) {
    this.process = spawn("docker", ["exec", "-i", container, "psql", "-X",
      "-Atq", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database]);
    this.stdout = "";
    this.stderr = "";
    this.pending = null;
    this.process.stdout.on("data", (chunk) => {
      this.stdout += chunk.toString();
      if (!this.pending) return;
      const index = this.stdout.indexOf(this.pending.marker);
      if (index < 0) return;
      const pending = this.pending;
      this.pending = null;
      const output = this.stdout.slice(0, index).trim();
      this.stdout = this.stdout.slice(index + pending.marker.length);
      pending.resolve(output);
    });
    this.process.stderr.on("data", (chunk) => { this.stderr += chunk.toString(); });
    this.process.on("close", () => {
      if (!this.pending) return;
      const pending = this.pending;
      this.pending = null;
      pending.reject(new Error(this.stderr || "SQL session closed"));
    });
  }

  run(statement) {
    assert.equal(this.pending, null);
    const marker = `__ERASURE_DONE_${randomUUID().replaceAll("-", "")}__`;
    const result = new Promise((resolve, reject) => {
      this.pending = { marker, resolve, reject };
    });
    this.process.stdin.write(`${statement.trim()}\n\\echo ${marker}\n`);
    return result;
  }

  close() { this.process.stdin.end(); }
}

async function expectBlocked(promise) {
  assert.equal(await Promise.race([
    promise.then(() => "completed", () => "failed"),
    sleep(250).then(() => "blocked"),
  ]), "blocked");
}

test("feedback erasure serializes with session creation in both orders", async () => {
  const database = `minddy_min591_erase_${randomUUID().slice(0, 12).replaceAll("-", "")}`;
  execFileSync("docker", ["exec", container, "createdb", "-U", "supabase_admin",
    "-T", template, database]);
  const sessions = [];
  try {
    sql(database, readFileSync(
      "supabase/migrations/20270108120000_feedback_erasure_atomic.sql", "utf8"));
    const actor = randomUUID();
    const project = randomUUID();
    const board = randomUUID();
    const firstUser = randomUUID();
    const secondUser = randomUUID();
    sql(database, `INSERT INTO auth.users(id) VALUES(${quote(actor)});
      INSERT INTO public.projects(id,owner_id,name,key)
        VALUES(${quote(project)},${quote(actor)},'Erasure race fixture','ERACE');
      INSERT INTO public.feedback_boards(id,project_id,token)
        VALUES(${quote(board)},${quote(project)},${quote(`race-${board}`)});
      INSERT INTO public.feedback_users(id,project_id,email,email_lookup,
        pseudonym,verified_via) VALUES
        (${quote(firstUser)},${quote(project)},
          'mdyf3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjF9',repeat('a',64),
          'First','email'),
        (${quote(secondUser)},${quote(project)},
          'mdyf3:1:eyJmb3JtYXQiOjMsImtleVZlcnNpb24iOjJ9',repeat('b',64),
          'Second','email');`);

    // Erasure commits first: an in-flight insert must wait and then fail.
    const eraser = new Session(database);
    const inserter = new Session(database);
    sessions.push(eraser, inserter);
    await eraser.run("BEGIN;");
    await eraser.run(`SELECT * FROM public.erase_feedback_identity(
      ${quote(project)},${quote(firstUser)},'first@example.test');`);
    const lateInsert = inserter.run(`INSERT INTO public.feedback_sessions(
      token_hash,board_id,user_id,expires_at) VALUES('late-token',
      ${quote(board)},${quote(firstUser)},now()+interval '1 day');`);
    await expectBlocked(lateInsert);
    await eraser.run("COMMIT;");
    await assert.rejects(lateInsert, /feedback_session_identity_unavailable/);

    // Insert commits first: erasure waits for it, then revokes the session.
    const creator = new Session(database);
    const laterEraser = new Session(database);
    sessions.push(creator, laterEraser);
    await creator.run("BEGIN;");
    await creator.run(`INSERT INTO public.feedback_sessions(
      token_hash,board_id,user_id,expires_at) VALUES('early-token',
      ${quote(board)},${quote(secondUser)},now()+interval '1 day');`);
    const pendingErasure = laterEraser.run(`SELECT * FROM
      public.erase_feedback_identity(${quote(project)},${quote(secondUser)},
      'second@example.test');`);
    await expectBlocked(pendingErasure);
    await creator.run("COMMIT;");
    assert.match(await pendingErasure, /f\|1/);
    assert.equal(sql(database, `SELECT count(*) FROM public.feedback_sessions
      WHERE user_id IN (${quote(firstUser)},${quote(secondUser)});`), "0");
  } finally {
    for (const session of sessions) session.close();
    execFileSync("docker", ["exec", container, "dropdb", "-U", "supabase_admin",
      "--if-exists", "--force", database]);
  }
});
