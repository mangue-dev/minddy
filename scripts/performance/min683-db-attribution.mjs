import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, id } from "./seed.mjs";

// Isolated read-path evidence. Never run alongside a timed UI measurement.
const mode = process.argv[2];
assert.ok(["catalog", "transport", "plans", "sql-shape", "wrapper-plans", "auth-catalog", "auth-plans"].includes(mode), "Choose a documented attribution mode");
const label = process.env.MINDDY_PERF_LABEL;
assert.match(label ?? "", /^[a-zA-Z0-9_-]+$/, "Declare an isolated evidence label");
const output = path.resolve("output/playwright/performance", `${label}.json`);
const fixtureId = "86df71f9-44a7-4cc1-8085-5baa6c744490";
const projectId = id("project-0");
const digest = (value) => createHash("sha256").update(value).digest("hex");
loadEnv();
const databaseOrigin = new URL(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"));
const linkedRef = (await readFile("supabase/.temp/project-ref", "utf8")).trim();
assert.equal(databaseOrigin.hostname, `${linkedRef}.supabase.co`, "The linked database must match the fixture auth origin");
const result = { protocol: "min683-excluded-db-attribution-v1", mode, label,
  excludedFromComparison: "Sequential isolated database probes; no renderer, server decryption or ordinary navigation latency conclusion",
  databaseRef: linkedRef, fixture: { email: EMAIL, userId: fixtureId, marker: MARKER, projectId },
  startedAt: new Date().toISOString(), sourceHash: digest(await readFile(new URL(import.meta.url))), probes: [] };
const prefix = "BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout = '5s'; SET LOCAL lock_timeout = '500ms'; SET LOCAL idle_in_transaction_session_timeout = '10s';";
let authenticatedClaims = { sub: fixtureId, role: "authenticated" };
function sql(query, authenticated = false) {
  const context = authenticated
    ? `SET LOCAL ROLE authenticated; SET LOCAL row_security = on; SET LOCAL request.jwt.claim.sub = '${fixtureId}'; SET LOCAL request.jwt.claim.role = 'authenticated'; SET LOCAL request.jwt.claims = '${JSON.stringify(authenticatedClaims).replaceAll("'", "''")}';`
    : "";
  // Only fixed SELECT/EXPLAIN strings below are admitted. Connection secrets and
  // CLI diagnostics are never included in the public result.
  const raw = execFileSync("supabase", ["db", "query", "--linked", "--output", "json", `${prefix} ${context} ${query}; ROLLBACK;`],
    { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"] });
  const parsed = JSON.parse(raw);
  assert.ok(Array.isArray(parsed.rows), "Management API must return rows");
  return parsed.rows;
}
try {
  if (!["transport", "sql-shape", "auth-catalog"].includes(mode)) {
    const identity = sql(`SELECT id, email, raw_user_meta_data->>'performance_fixture' AS marker FROM auth.users WHERE id='${fixtureId}'`);
    assert.deepEqual(identity, [{ email: EMAIL, id: fixtureId, marker: MARKER }]);
    result.probes.push({ name: "fixture-identity", data: identity });
  }
  if (mode === "auth-catalog") {
    const rows = sql("SELECT n.nspname AS schema,p.proname,p.provolatile,p.prosecdef,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='public' AND p.proname IN ('enforce_mfa_aal','mfa_aal_ok','mfa_aal_ok_for_user','auth_session_is_current','is_auth_session_active')) OR (n.nspname='auth' AND p.proname IN ('role','uid','jwt')) ORDER BY n.nspname,p.proname");
    result.probes.push({ name: "deployed-complete-auth-helpers", data: rows.map(row => ({ ...row, definitionHash: digest(row.definition) })) });
  } else if (mode === "catalog") {
    result.probes.push({ name: "deployed-policies", data: sql("SELECT tablename, policyname, roles, cmd, qual FROM pg_policies WHERE schemaname='public' AND tablename IN ('issues','issue_categories','projects','project_members','attachments') ORDER BY tablename, policyname") });
    result.probes.push({ name: "deployed-read-helpers", data: sql("SELECT p.proname, p.provolatile, p.prosecdef, pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('can_access_project','is_project_owner','is_project_member','enforce_mfa_aal','mfa_aal_ok','auth_session_is_current') ORDER BY p.proname") });
    result.probes.push({ name: "deployed-indexes", data: sql("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('issues','issue_categories','projects','project_members','attachments') ORDER BY tablename,indexname") });
    result.probes.push({ name: "migration-proof", data: sql("SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '20270106880000' ORDER BY version") });
    result.probes.push({ name: "bounded-role-settings", data: sql("SELECT rolname,rolconfig FROM pg_roles WHERE rolname IN ('authenticated','authenticator','anon') ORDER BY rolname") });
  } else if (mode === "transport") {
    const auth = createClient(databaseOrigin.href, requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
    assert.equal(signed.error, null, "Fixture authentication must succeed");
    assert.equal(signed.data.user.id, fixtureId); assert.equal(signed.data.user.email, EMAIL);
    assert.equal(signed.data.user.user_metadata.performance_fixture, MARKER);
    const headers = { apikey: requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), Authorization: `Bearer ${signed.data.session.access_token}` };
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const scope of ["global", "project"]) {
        let cursor = null;
        const ids = [];
        for (let page = 0; page < 4; page++) {
          const params = new URLSearchParams({ select: "*,issue_categories(category_id)", order: "id.asc", limit: "1000" });
          if (scope === "project") params.set("project_id", `eq.${projectId}`);
          if (cursor) params.set("id", `gt.${cursor}`);
          const start = performance.now();
          const response = await fetch(new URL(`rest/v1/issues?${params}`, databaseOrigin), { headers: { ...headers, Prefer: "count=exact" }, signal: AbortSignal.timeout(10000) });
          const headerAt = performance.now(); const body = await response.text(); const bodyAt = performance.now();
          if (!response.ok) {
            result.probes.push({ name: `${scope}-${repeat + 1}-page-${page + 1}`, status: response.status, retryAfter: response.headers.get("retry-after") });
            // A denied or limited response ends the batch without another probe.
            throw new Error("Issue read failed");
          }
          const parseAt = performance.now(); const rows = JSON.parse(body); const parsedAt = performance.now();
          assert.ok(Array.isArray(rows)); assert.ok(rows.length <= 1000);
          const remainder = Number(response.headers.get("content-range")?.split("/")[1]);
          assert.ok(Number.isSafeInteger(remainder) && remainder >= rows.length);
          for (const row of rows) { assert.ok(cursor === null || row.id > cursor); ids.push(row.id); cursor = row.id; }
          result.probes.push({ name: `${scope}-${repeat + 1}-page-${page + 1}`, selection: "*,issue_categories(category_id)", exactCount: true, remainder,
            status: response.status, rows: rows.length, encryptedRows: rows.filter(row => row.encryption_version > 0).length,
            categoryLinks: rows.reduce((total, row) => total + row.issue_categories.length, 0), responseBytes: Buffer.byteLength(body),
            headerMs: headerAt - start, bodyAfterHeadersMs: bodyAt - headerAt, jsonParseMs: parsedAt - parseAt,
            serverTiming: response.headers.get("server-timing"), contentRange: response.headers.get("content-range"),
            idFingerprint: digest(JSON.stringify(rows.map(row => row.id))), bodyFingerprint: digest(body) });
          if (remainder === rows.length) break;
          assert.ok(rows.length > 0 && page < 3, "Bounded pagination must prove exhaustion");
        }
        assert.equal(new Set(ids).size, ids.length);
        assert.equal(ids.length, scope === "global" ? 1206 : 670, "The frozen full source must match");
      }
    }
  } else if (mode === "sql-shape") {
    result.probes.push({ name: "live-auth-guards", data: sql("SELECT p.proname,p.provolatile,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('enforce_mfa_aal','mfa_aal_ok','auth_session_is_current') ORDER BY p.proname") });
    const statements = sql("SELECT queryid,calls,mean_exec_time,query FROM extensions.pg_stat_statements WHERE query LIKE 'WITH pgrst_source AS ( SELECT%' AND query ILIKE '%issues%' AND query ILIKE '%issue_categories%' AND query NOT ILIKE '%pg_stat_statements%' ORDER BY calls DESC LIMIT 8");
    result.probes.push({ name: "parameterized-postgrest-structures", aggregateTimingScope: "Global mixed-account historical statistics, not fixture latency", data: statements.map(({ query, ...metadata }) => ({ ...metadata,
      queryHash: digest(query), query: query.replace(/'(?:[^']|'')*'/g, "'<literal>'") })) });
  } else if (mode === "auth-plans") {
    const catalog = JSON.parse(await readFile(process.env.MINDDY_PERF_DB_AUTH_CATALOG ?? "", "utf8"));
    assert.equal(catalog.databaseRef, linkedRef);
    const reviewedHashes = JSON.parse(process.env.MINDDY_PERF_DB_AUTH_REVIEWED_HASHES ?? "{}");
    const helpers = catalog.probes.find(probe => probe.name === "deployed-complete-auth-helpers").data;
    assert.equal(helpers.length, 8);
    for (const helper of helpers) {
      assert.equal(helper.provolatile, "s");
      assert.equal(helper.definitionHash, reviewedHashes[`${helper.schema}.${helper.proname}`], "Every transitive helper needs a reviewed exact hash");
      assert.ok(!/\b(?:INSERT|UPDATE|DELETE|MERGE|CALL|EXECUTE)\b/i.test(helper.definition));
    }
    const auth = createClient(databaseOrigin.href, requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
    assert.equal(signed.error, null); assert.equal(signed.data.user.id, fixtureId);
    assert.equal(signed.data.user.email, EMAIL); assert.equal(signed.data.user.user_metadata.performance_fixture, MARKER);
    const claims = JSON.parse(Buffer.from(signed.data.session.access_token.split(".")[1], "base64url"));
    assert.equal(claims.sub, fixtureId); assert.equal(claims.role, "authenticated");
    authenticatedClaims = Object.fromEntries(["sub", "role", "session_id", "aal", "amr"].map(key => [key, claims[key]]));
    result.claimNames = Object.keys(authenticatedClaims);
    result.reviewedHelperHashes = reviewedHashes;
    const query = "SELECT public.enforce_mfa_aal()";
    result.probes.push({ name: "actual-authenticated-pre-request-sql", sql: query, sqlHash: digest(query),
      data: sql(`EXPLAIN (ANALYZE true, BUFFERS true, VERBOSE true, FORMAT JSON) ${query}`, true) });
  } else if (mode === "wrapper-plans") {
    const catalog = JSON.parse(await readFile(process.env.MINDDY_PERF_DB_CATALOG ?? "", "utf8"));
    assert.equal(catalog.databaseRef, linkedRef);
    const helpers = catalog.probes.find(probe => probe.name === "deployed-read-helpers").data;
    for (const name of ["can_access_project", "is_project_owner", "is_project_member"]) {
      const helper = (helpers.rows ?? helpers).find(row => row.proname === name);
      assert.equal(helper.provolatile, "s");
      assert.ok(!/\b(?:INSERT|UPDATE|DELETE|MERGE|CALL|EXECUTE)\b/i.test(helper.definition));
    }
    const auth = createClient(databaseOrigin.href, requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
    assert.equal(signed.error, null); assert.equal(signed.data.user.id, fixtureId);
    assert.equal(signed.data.user.email, EMAIL); assert.equal(signed.data.user.user_metadata.performance_fixture, MARKER);
    const claims = JSON.parse(Buffer.from(signed.data.session.access_token.split(".")[1], "base64url"));
    assert.equal(claims.sub, fixtureId); assert.equal(claims.role, "authenticated");
    authenticatedClaims = Object.fromEntries(["sub", "role", "session_id", "aal", "amr"].map(key => [key, claims[key]]));
    result.claimNames = Object.keys(authenticatedClaims); // Values stay private.
    const statements = sql("SELECT query FROM extensions.pg_stat_statements WHERE query LIKE 'WITH pgrst_source AS ( SELECT%' AND query ILIKE '%issues%' AND query ILIKE '%issue_categories%' AND query ILIKE '%\"id\" ASC%' AND query NOT ILIKE '%pg_stat_statements%' ORDER BY calls DESC LIMIT 12");
    const template = statements.find(({ query }) => query.includes('ORDER BY "public"."issues"."id" ASC') && !query.includes('WHERE  "public"."issues"') && query.includes("pgrst_source_count"))?.query;
    assert.ok(template, "Require the actual global exact-count wrapper");
    assert.equal(digest(template), "655997c30569eb3f584735b572c3b76f498cfe11fe68f38a53e97e004da93d8f", "Only the reviewed SELECT-only wrapper is executable");
    const bindings = { 1: "1000", 2: "0", 3: "1000", 4: "0", 5: "'[]'::jsonb", 6: "true", 7: "1", 8: "'[]'::json", 9: "'response.headers'", 10: "true", 11: "''", 12: "'response.status'", 13: "true", 14: "''", 15: "NULL" };
    const query = template.replace(/\$(\d+)/g, (_, index) => { assert.ok(index in bindings); return bindings[index]; });
    assert.ok(!/\b(?:INSERT|UPDATE|DELETE|MERGE|CALL|EXECUTE)\b/i.test(query));
    result.probes.push({ name: "actual-global-wrapper-first-page", sql: query, parameterizedQueryHash: digest(template),
      bindingContract: "Actual global exact-count statement, fixture live JWT allowlist, top/nested limits1000, offsets0; no pre-request invocation",
      data: sql(`EXPLAIN (ANALYZE true, BUFFERS true, VERBOSE true, FORMAT JSON) ${query}`, true) });
  } else {
    const catalog = JSON.parse(await readFile(process.env.MINDDY_PERF_DB_CATALOG ?? "", "utf8"));
    assert.equal(catalog.databaseRef, linkedRef);
    const helpers = catalog.probes.find(probe => probe.name === "deployed-read-helpers").data;
    for (const name of ["can_access_project", "is_project_owner", "is_project_member"]) {
      const helper = (helpers.rows ?? helpers).find(row => row.proname === name);
      assert.equal(helper.provolatile, "s");
      assert.ok(!/\b(?:INSERT|UPDATE|DELETE|MERGE|CALL|EXECUTE)\b/i.test(helper.definition), "Audited helper must be read-only");
    }
    const context = sql("SELECT current_user,auth.uid() AS actor,row_security_active('public.issues'::regclass) AS issues_rls", true);
    assert.deepEqual(context, [{ actor: fixtureId, current_user: "authenticated", issues_rls: true }]);
    result.probes.push({ name: "authenticated-context", data: context });
    // This is explicit equivalent SQL, not a claim to capture PostgREST's own
    // generated JSON/count wrapper. RLS and the projection/join are executed.
    const probes = [
      ["global-exact-count", "SELECT count(*) FROM public.issues"],
      ["global-first-projection", "SELECT i.*, COALESCE(c.links,'[]'::json) AS issue_categories FROM public.issues i LEFT JOIN LATERAL (SELECT json_agg(json_build_object('category_id',category_id)) AS links FROM public.issue_categories c WHERE c.issue_id=i.id) c ON true ORDER BY i.id LIMIT 1000"],
      ["project-exact-count", `SELECT count(*) FROM public.issues WHERE project_id='${projectId}'`],
      ["project-projection", `SELECT i.*, COALESCE(c.links,'[]'::json) AS issue_categories FROM public.issues i LEFT JOIN LATERAL (SELECT json_agg(json_build_object('category_id',category_id)) AS links FROM public.issue_categories c WHERE c.issue_id=i.id) c ON true WHERE i.project_id='${projectId}' ORDER BY i.id LIMIT 1000`],
      ["project-resource-count-source", `SELECT id,issue_id FROM public.attachments WHERE project_id='${projectId}' AND comment_id IS NULL ORDER BY id LIMIT 1000`],
    ];
    for (const [name, query] of probes) {
      const started = performance.now();
      result.probes.push({ name, sql: query, sqlHash: digest(query), data: sql(`EXPLAIN (ANALYZE true, BUFFERS true, VERBOSE true, FORMAT JSON) ${query}`, true), managementRoundTripMs: performance.now() - started });
    }
  }
  result.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, mode, probes: result.probes.length, databaseRef: linkedRef }));
} catch (error) {
  // Exec errors may carry request/authentication diagnostics. Keep only a
  // fixed status, preserving private details outside published evidence.
  console.error(JSON.stringify({ mode, status: "probe-failed", errorType: error.constructor.name,
    sourceLocation: error.stack?.split("\n").find(line => line.includes("min683-db-attribution.mjs:"))?.trim() }));
  result.failed = true; result.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(result, null, 2));
  process.exitCode = 1;
}
