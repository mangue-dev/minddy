#!/usr/bin/env node
// Runs production's scheduled jobs on the preview environment.
//
// Vercel runs the `crons` of `vercel.json` on production deployments only, so
// preview (`preview.minddy.app`, the preview Supabase branch) never fires a
// reminder, a routine, a background Numo wake or a retry. This script schedules
// the same list with `pg_cron` on the PREVIEW database: each job calls the
// preview route over `pg_net` with the preview `CRON_SECRET`, kept in Supabase
// Vault. Nothing here is a migration: production never gets these jobs.
//
//   node --env-file=.env scripts/preview-crons.mjs apply    # (re)schedule from vercel.json
//   node --env-file=.env scripts/preview-crons.mjs status   # jobs and recent runs
//   node --env-file=.env scripts/preview-crons.mjs remove   # unschedule, forget the secret
//
// It runs SQL with `supabase db query --linked` and refuses unless the linked
// project is the preview branch. See docs/database-environments.md.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PREVIEW_PROJECT_REF = "dehkvxlygczjbnbubffn";
export const PRODUCTION_PROJECT_REF = "cmzrlbnlytvgnomzgmqf";
export const DEFAULT_BASE_URL = "https://preview.minddy.app";
/** Prefix of every job this script owns: `remove` and `apply` touch only these. */
export const JOB_PREFIX = "preview-cron:";
export const SECRET_NAME = "preview_cron_secret";
/** As long as the longest route may run (`maxDuration` 300 s). */
export const REQUEST_TIMEOUT_MS = 300_000;

const PATH_PATTERN = /^\/api\/cron\/[a-z0-9-]+$/;
const SCHEDULE_PATTERN = /^[0-9*/,-]+( [0-9*/,-]+){4}$/;
const SECRET_PATTERN = /^[A-Za-z0-9._~+/=-]{16,512}$/;

/** The crons of `vercel.json`, checked: an odd path or schedule stops everything. */
export function readCrons(vercelConfig) {
  const crons = vercelConfig?.crons;
  if (!Array.isArray(crons) || crons.length === 0) throw new Error("vercel.json lists no crons");
  return crons.map(({ path: route, schedule }) => {
    if (typeof route !== "string" || !PATH_PATTERN.test(route)) throw new Error(`Unexpected cron path: ${route}`);
    if (typeof schedule !== "string" || !SCHEDULE_PATTERN.test(schedule)) throw new Error(`Unexpected schedule for ${route}: ${schedule}`);
    return { path: route, schedule };
  });
}

function baseUrlOf(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`The preview base URL must be a bare https origin, got ${value}`);
  }
  return url.origin;
}

/** A dollar-quote tag the quoted text cannot close. */
function dollarTag(text) {
  let tag;
  do tag = `s${randomBytes(6).toString("hex")}`; while (text.includes(`$${tag}$`));
  return `$${tag}$`;
}

const literal = (value) => `'${value.replaceAll("'", "''")}'`;

/** The SQL that stores the secret and (re)schedules every cron. */
export function applySql({ crons, baseUrl, secret }) {
  if (!SECRET_PATTERN.test(secret)) throw new Error("CRON_SECRET has an unexpected shape");
  const origin = baseUrlOf(baseUrl);
  const quote = dollarTag(secret);
  const jobs = crons.map(({ path: route, schedule }) => {
    const body = `select net.http_get(
    url := ${literal(origin + route)},
    headers := jsonb_build_object('Authorization', 'Bearer ' || (
      select decrypted_secret from vault.decrypted_secrets where name = ${literal(SECRET_NAME)})),
    timeout_milliseconds := ${REQUEST_TIMEOUT_MS})`;
    const jobQuote = dollarTag(body);
    return `select cron.schedule(${literal(JOB_PREFIX + route)}, ${literal(schedule)}, ${jobQuote}${body}${jobQuote});`;
  });
  return `create extension if not exists pg_cron;
create extension if not exists pg_net;
do $apply$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = ${literal(SECRET_NAME)};
  if v_id is null then
    perform vault.create_secret(${quote}${secret}${quote}, ${literal(SECRET_NAME)},
      'Preview CRON_SECRET for scripts/preview-crons.mjs');
  else
    perform vault.update_secret(v_id, ${quote}${secret}${quote});
  end if;
end
$apply$;
select cron.unschedule(jobname) from cron.job where jobname like ${literal(`${JOB_PREFIX}%`)};
${jobs.join("\n")}
select jobname, schedule from cron.job where jobname like ${literal(`${JOB_PREFIX}%`)} order by jobname;
`;
}

export function removeSql() {
  return `select cron.unschedule(jobname) from cron.job where jobname like ${literal(`${JOB_PREFIX}%`)};
delete from vault.secrets where name = ${literal(SECRET_NAME)};
`;
}

export function statusSql() {
  return `select j.jobname, j.schedule, d.status, d.start_time, left(d.return_message, 120) as message
from cron.job j
left join lateral (
  select status, start_time, return_message from cron.job_run_details r
  where r.jobid = j.jobid order by start_time desc limit 1
) d on true
where j.jobname like ${literal(`${JOB_PREFIX}%`)}
order by j.jobname;
select status_code, count(*) as responses, max(created) as latest
from net._http_response where created > now() - interval '1 hour'
group by status_code order by status_code;
`;
}

function linkedProjectRef(root) {
  try {
    return readFileSync(path.join(root, "supabase/.temp/project-ref"), "utf8").trim();
  } catch {
    return null;
  }
}

function runSql(root, sql) {
  // The secret travels in a file only the current user can read, never on a
  // command line other processes can see.
  const dir = mkdtempSync(path.join(tmpdir(), "preview-crons-"));
  const file = path.join(dir, "query.sql");
  try {
    writeFileSync(file, sql, { mode: 0o600 });
    return execFileSync("supabase", ["db", "query", "--linked", "-f", file], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const command = process.argv[2];
  if (!["apply", "status", "remove"].includes(command)) {
    console.error("Usage: node --env-file=.env scripts/preview-crons.mjs <apply|status|remove>");
    process.exit(2);
  }
  const ref = linkedProjectRef(root);
  if (ref !== PREVIEW_PROJECT_REF) {
    console.error(ref === PRODUCTION_PROJECT_REF
      ? "The linked Supabase project is PRODUCTION. Preview crons are never scheduled there."
      : `The linked Supabase project (${ref ?? "none"}) is not the preview branch ${PREVIEW_PROJECT_REF}.`);
    process.exit(1);
  }
  let sql;
  if (command === "apply") {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      console.error("CRON_SECRET is not set: run with --env-file pointing to the preview environment.");
      process.exit(1);
    }
    const crons = readCrons(JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")));
    sql = applySql({ crons, baseUrl: process.env.PREVIEW_CRON_BASE_URL || DEFAULT_BASE_URL, secret });
  } else {
    sql = command === "remove" ? removeSql() : statusSql();
  }
  process.stdout.write(runSql(root, sql));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
