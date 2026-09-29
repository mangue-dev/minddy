import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const container = "supabase_db_minddy-encryption-test";
const finalTemplate = process.env.MINDDY_ENCRYPTION_FINAL_TEMPLATE;
const template = finalTemplate ?? process.env.MINDDY_ERASURE_TEMPLATE ??
  "minddy_min591_security_final_20260927";
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

test("feedback erasure serializes with session and OTP creation in both orders", async () => {
  if (finalTemplate) assert.match(finalTemplate, /^minddy_min591_[a-z0-9_]+$/);
  const database = `minddy_min591_erase_${randomUUID().slice(0, 12).replaceAll("-", "")}`;
  execFileSync("docker", ["exec", container, "createdb", "-U", "supabase_admin",
    "-T", template, database]);
  const sessions = [];
  try {
    if (!finalTemplate) sql(database, readFileSync(
      "supabase/migrations/20270108171000_feedback_erasure_otp_lookup.sql", "utf8"));
    const actor = randomUUID();
    const project = randomUUID();
    const board = randomUUID();
    const firstUser = randomUUID();
    const secondUser = randomUUID();
    const thirdUser = randomUUID();
    const fourthUser = randomUUID();
    const thirdCipher = `mdyf3:1:${Buffer.from('{"format":3,"keyVersion":3}')
      .toString("base64url")}`;
    const fourthCipher = `mdyf3:1:${Buffer.from('{"format":3,"keyVersion":4}')
      .toString("base64url")}`;
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
          'Second','email'),
        (${quote(thirdUser)},${quote(project)},
          ${quote(thirdCipher)},repeat('e',64),
          'Third','email'),
        (${quote(fourthUser)},${quote(project)},
          ${quote(fourthCipher)},repeat('f',64),
          'Fourth','email');`);

    // Erasure commits first: an in-flight insert must wait and then fail.
    const eraser = new Session(database);
    const inserter = new Session(database);
    sessions.push(eraser, inserter);
    await eraser.run("BEGIN;");
    await eraser.run(`SELECT * FROM public.erase_feedback_identity(
      ${quote(project)},${quote(firstUser)},'first@example.test',repeat('c',64));`);
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
      'second@example.test',repeat('d',64));`);
    await expectBlocked(pendingErasure);
    await creator.run("COMMIT;");
    assert.match(await pendingErasure, /f\|1/);
    assert.equal(sql(database, `SELECT count(*) FROM public.feedback_sessions
      WHERE user_id IN (${quote(firstUser)},${quote(secondUser)});`), "0");

    // OTP commits first: erasure waits for the digest lock, then removes it.
    const earlyCode = randomUUID();
    const codeIssuer = new Session(database);
    const codeEraser = new Session(database);
    sessions.push(codeIssuer, codeEraser);
    await codeIssuer.run("BEGIN;");
    assert.match(await codeIssuer.run(`SELECT public.issue_feedback_otp_code_protected(
      ${quote(earlyCode)},${quote(board)},'third@example.test',
      ${quote(thirdCipher)},repeat('1',64),
      'third-ip','third-code',now()+interval '10 minutes',now(),3600,0,5,15);`),
    /issued/);
    const pendingCodeErasure = codeEraser.run(`SELECT * FROM
      public.erase_feedback_identity(${quote(project)},${quote(thirdUser)},
      'third@example.test',repeat('1',64));`);
    await expectBlocked(pendingCodeErasure);
    await codeIssuer.run("COMMIT;");
    assert.match(await pendingCodeErasure, /f\|0/);
    assert.equal(sql(database, `SELECT count(*) FROM public.feedback_otp_codes
      WHERE id=${quote(earlyCode)};`), "0");

    // Erasure commits first: an in-flight OTP issuer waits and is suppressed.
    const lateCode = randomUUID();
    const codeEraserFirst = new Session(database);
    const codeIssuerSecond = new Session(database);
    sessions.push(codeEraserFirst, codeIssuerSecond);
    await codeEraserFirst.run("BEGIN;");
    await codeEraserFirst.run(`SELECT * FROM public.erase_feedback_identity(
      ${quote(project)},${quote(fourthUser)},'fourth@example.test',repeat('2',64));`);
    const pendingCode = codeIssuerSecond.run(`SELECT
      public.issue_feedback_otp_code_protected(${quote(lateCode)},${quote(board)},
      'fourth@example.test',${quote(fourthCipher)},
      repeat('2',64),'fourth-ip','fourth-code',now()+interval '10 minutes',
      now(),3600,0,5,15);`);
    await expectBlocked(pendingCode);
    await codeEraserFirst.run("COMMIT;");
    assert.match(await pendingCode, /suppressed/);
    assert.equal(sql(database, `SELECT count(*) FROM public.feedback_otp_codes
      WHERE id=${quote(lateCode)};`), "0");
  } finally {
    for (const session of sessions) session.close();
    execFileSync("docker", ["exec", container, "dropdb", "-U", "supabase_admin",
      "--if-exists", "--force", database]);
  }
});
