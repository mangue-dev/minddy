import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Run only against a disposable local database. No application credentials or
// production data are needed for the initialization and last-tab races.
const database = process.env.TEST_DATABASE_URL;
if (!database || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(database).hostname)) {
  throw new Error("Set TEST_DATABASE_URL to a disposable local PostgreSQL database.");
}
function sql(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [database, "-XAtq", "-v", "ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
    child.stdin.end(statement);
  });
}
const owner = randomUUID();
const asOwner = (statement) => `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${owner}', true); ${statement}; COMMIT;`;
try {
  await sql(`INSERT INTO auth.users(id,email) VALUES ('${owner}','app-tabs-concurrency@example.test');`);
  await Promise.all([
    sql(asOwner("SELECT public.mutate_app_tab('ensure'); SELECT pg_sleep(0.2)")),
    sql(asOwner("SELECT public.mutate_app_tab('ensure')")),
  ]);
  assert.equal(await sql(`SELECT count(*) FROM public.app_tabs WHERE user_id='${owner}'`), "1");
  await sql(asOwner("SELECT public.mutate_app_tab('create')"));
  const ids = (await sql(`SELECT id FROM public.app_tabs WHERE user_id='${owner}' ORDER BY id`)).split("\n");
  const results = await Promise.all(ids.map((id) => sql(asOwner(`SELECT public.mutate_app_tab('close','${id}',1); SELECT pg_sleep(0.2)`))));
  assert.equal(results.filter((result) => result.includes('"last_tab"')).length, 1);
  assert.equal(await sql(`SELECT count(*) FROM public.app_tabs WHERE user_id='${owner}'`), "1");
  console.log("Concurrent initialization and last-tab closure passed using two PostgreSQL connections.");
} finally {
  await sql(`DELETE FROM auth.users WHERE id='${owner}';`);
}
