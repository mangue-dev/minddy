import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  JOB_PREFIX,
  SECRET_NAME,
  applySql,
  readCrons,
  removeSql,
} from "./preview-crons.mjs";

const SECRET = "a".repeat(64);

test("schedules every cron of vercel.json against the preview origin", () => {
  const crons = readCrons(JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")));
  const sql = applySql({ crons, baseUrl: "https://preview.minddy.app", secret: SECRET });
  for (const { path, schedule } of crons) {
    assert.ok(sql.includes(`cron.schedule('${JOB_PREFIX}${path}', '${schedule}'`), path);
    assert.ok(sql.includes(`'https://preview.minddy.app${path}'`), path);
  }
  // The jobs read the secret from Vault: it appears once, where it is stored.
  assert.equal(sql.split(SECRET).length - 1, 2);
  assert.ok(sql.includes(`where name = '${SECRET_NAME}'`));
  // Jobs this script did not create are left alone.
  assert.ok(sql.includes(`where jobname like '${JOB_PREFIX}%'`));
});

test("refuses what would make a job call somewhere else or break the SQL", () => {
  const crons = [{ path: "/api/cron/routines", schedule: "*/5 * * * *" }];
  assert.throws(() => applySql({ crons, baseUrl: "http://preview.minddy.app", secret: SECRET }));
  assert.throws(() => applySql({ crons, baseUrl: "https://preview.minddy.app/x", secret: SECRET }));
  assert.throws(() => applySql({ crons, baseUrl: "https://preview.minddy.app", secret: "short" }));
  assert.throws(() => applySql({ crons, baseUrl: "https://preview.minddy.app", secret: `${"a".repeat(20)}'$x` }));
  assert.throws(() => readCrons({ crons: [{ path: "/api/cron/x'; drop", schedule: "* * * * *" }] }));
  assert.throws(() => readCrons({ crons: [{ path: "/api/cron/routines", schedule: "every minute" }] }));
  assert.throws(() => readCrons({}));
});

test("remove only touches this script's jobs and secret", () => {
  const sql = removeSql();
  assert.ok(sql.includes(`where jobname like '${JOB_PREFIX}%'`));
  assert.ok(sql.includes(`where name = '${SECRET_NAME}'`));
});
