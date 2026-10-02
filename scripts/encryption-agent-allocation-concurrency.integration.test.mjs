import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const database = process.env.MINDDY_ALLOCATION_DATABASE ?? "minddy_min591_final_20260929";
const container = "supabase_db_minddy-encryption-test";
const args = ["exec", "-i", container, "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database];
function sql(statement) {
  assert.match(database, /^minddy_min591_[a-z0-9_]+$/);
  return execFileSync("docker", args, { input: statement, encoding: "utf8" }).trim();
}
class Session {
  constructor() {
    this.process = spawn("docker", args);
    this.output = ""; this.error = ""; this.pending = null;
    this.process.stdout.on("data", (chunk) => {
      this.output += chunk;
      if (!this.pending || !this.output.includes(this.pending.marker)) return;
      const pending = this.pending; this.pending = null;
      const [output, rest] = this.output.split(pending.marker);
      this.output = rest;
      pending.resolve(output.trim());
    });
    this.process.stderr.on("data", (chunk) => { this.error += chunk; });
    this.process.on("close", () => { this.pending?.reject(new Error(this.error)); this.pending = null; });
  }
  run(statement) {
    assert.equal(this.pending, null);
    const marker = `DONE_${randomUUID().replaceAll("-", "")}`;
    const promise = new Promise((resolve, reject) => { this.pending = { marker, resolve, reject }; });
    this.process.stdin.write(`${statement}\n\\echo ${marker}\n`);
    return promise;
  }
  close() { this.process.stdin.end(); }
}
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("allocation and attachment serialize with account/project erasure in both commit orders", {
  skip: process.env.MINDDY_ENCRYPTION_DB_TEST !== "true", timeout: 30000,
}, async () => {
  for (const scope of ["account", "project"]) for (const operation of ["reserve", "attach"]) for (const eraseFirst of [false, true]) {
    const user = randomUUID(); const project = randomUUID(); const run = randomUUID();
    sql(`INSERT INTO auth.users(id) VALUES(${quote(user)});
      INSERT INTO public.projects(id,owner_id,name,key) VALUES(${quote(project)},${quote(user)},'Allocation race','A'||substr(replace(${quote(project)},'-',''),1,8));
      INSERT INTO public.agent_runs(id,project_id,created_by,status) VALUES(${quote(run)},${quote(project)},${quote(user)},'running');`);
    const reserve = `SELECT public.reserve_agent_sandbox_allocation(${quote(run)},${quote(`agent-v2-${run}-000000000001`)});`;
    const allocation = operation === "attach" ? sql(reserve) : null;
    const writer = operation === "reserve" ? reserve : `SELECT public.attach_agent_sandbox_allocation(${quote(allocation)});`;
    const fence = scope === "account" ? `SELECT public.begin_agent_account_erasure(${quote(user)});` : `SELECT public.begin_agent_project_erasure(${quote(project)});`;
    const first = new Session(); const second = new Session();
    try {
      await first.run("BEGIN;"); await second.run("BEGIN;");
      await first.run(eraseFirst ? fence : writer);
      const pending = second.run(eraseFirst ? writer : fence);
      const observed = pending.then(() => "finished", () => "rejected");
      assert.equal(await Promise.race([observed, delay(150).then(() => "blocked")]), "blocked");
      await first.run("COMMIT;");
      if (eraseFirst && operation === "reserve") await assert.rejects(pending, /agent_allocation_(account_erasing|project_unavailable)/);
      else {
        const output = await pending;
        if (eraseFirst) assert.equal(output, "f");
        await second.run("COMMIT;");
      }
      if (!eraseFirst) {
        assert.equal(sql(`SELECT state,provider_pending FROM public.agent_sandbox_allocations WHERE run_id=${quote(run)};`), "revoked|t");
        assert.equal(sql(`SELECT public.attach_agent_sandbox_allocation(id) FROM public.agent_sandbox_allocations WHERE run_id=${quote(run)};`), "f");
      }
      if (!eraseFirst || operation === "attach") {
        assert.throws(() => sql(`DELETE FROM public.projects WHERE id=${quote(project)};`), /agent_allocation_erasure_incomplete/);
      }
    } finally {
      first.close(); second.close();
      // These UUIDs belong exclusively to this disposable fixture.
      sql(`DELETE FROM public.agent_sandbox_allocations WHERE run_id=${quote(run)};
        DELETE FROM public.agent_project_erasure_fences WHERE project_id=${quote(project)};
        DELETE FROM auth.users WHERE id=${quote(user)};`);
    }
  }
});
