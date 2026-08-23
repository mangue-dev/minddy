import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseArgs, readConfig, REQUIRED_ENVIRONMENT, runProbe } from "./security-probe.mjs";

const sourceProjectId = "11111111-1111-4111-8111-111111111111";
const foreignProjectId = "22222222-2222-4222-8222-222222222222";

function validEnvironment() {
  return {
    SUPABASE_URL: "https://probe.example.test",
    SUPABASE_ANON_KEY: "probe-anon-key",
    SECURITY_PROBE_CROSS_TENANT_TOKEN: "probe-cross-tenant-token",
    SECURITY_PROBE_DUAL_MEMBER_TOKEN: "probe-dual-member-token",
    SECURITY_PROBE_SOURCE_PROJECT_ID: sourceProjectId,
    SECURITY_PROBE_FOREIGN_PROJECT_ID: foreignProjectId,
    SECURITY_PROBE_FOREIGN_ISSUE_ID: "33333333-3333-4333-8333-333333333333",
    SECURITY_PROBE_REASSIGNABLE_ISSUE_ID: "44444444-4444-4444-8444-444444444444",
    SECURITY_PROBE_HARD_DELETE_PAGE_ID: "55555555-5555-4555-8555-555555555555",
    SECURITY_PROBE_SECRET_CONNECTION_ID: "66666666-6666-4666-8666-666666666666",
    SECURITY_PROBE_FOREIGN_STORAGE_PATH: `projects/${foreignProjectId}/security-probe/listing-sentinel.txt`,
  };
}

test("the live probe requires an explicit confirmation and every fixture value", () => {
  assert.throws(() => parseArgs([]), /--confirm/);
  assert.deepEqual(parseArgs(["--confirm"]), { confirmed: true });
  assert.throws(() => readConfig(validEnvironment()), /--confirm/);
  for (const name of REQUIRED_ENVIRONMENT) {
    const environment = validEnvironment();
    delete environment[name];
    assert.throws(() => readConfig(environment, { confirmed: true }), new RegExp(name));
  }
});

test("the live probe pins the storage fixture to its foreign project", () => {
  const environment = validEnvironment();
  environment.SECURITY_PROBE_FOREIGN_STORAGE_PATH = `projects/${sourceProjectId}/security-probe/listing-sentinel.txt`;
  assert.throws(() => readConfig(environment, { confirmed: true }), /FOREIGN_STORAGE_PATH/);

  const config = readConfig(validEnvironment(), { confirmed: true });
  assert.equal(config.supabaseUrl, "https://probe.example.test");
  assert.equal(config.foreignProjectId, foreignProjectId);
});

test("the live probe exercises every negative authorization boundary", async () => {
  const config = readConfig(validEnvironment(), { confirmed: true });
  const fixtures = [
    [200, []],
    [200, []],
    [403, { message: "denied" }],
    [200, [{ id: config.secretConnectionId }]],
    [403, { message: "denied" }],
    [200, []],
    [400, { message: "denied" }],
    [200, [{ id: config.reassignableIssueId, project_id: sourceProjectId }]],
    [403, { message: "denied" }],
    [200, [{ id: config.reassignableIssueId, project_id: sourceProjectId }]],
    [200, [{ id: config.hardDeletePageId, project_id: sourceProjectId }]],
    [200, []],
    [200, [{ id: config.hardDeletePageId, project_id: sourceProjectId }]],
  ];
  const requests = [];
  const logs = [];
  await runProbe(config, {
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      const [status, body] = fixtures.shift();
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    },
    log: (message) => logs.push(message),
  });

  assert.equal(fixtures.length, 0);
  assert.equal(requests.length, 13);
  assert.match(requests[0].url, /\/rest\/v1\/issues\?id=eq\.33333333/);
  assert.equal(requests[1].init.method, "PATCH");
  assert.match(requests[2].url, /\/rest\/v1\/rpc\/get_admin_user_totals$/);
  assert.match(requests[5].url, /\/storage\/v1\/object\/list\/attachments$/);
  assert.match(requests[6].url, new RegExp(`/storage/v1/object/attachments/projects/${foreignProjectId}/security-probe/unauthorized-`));
  assert.equal(requests[8].init.method, "PATCH");
  assert.equal(requests[11].init.method, "DELETE");
  assert.deepEqual(JSON.parse(requests[8].init.body), { project_id: foreignProjectId });
  assert.equal(logs.at(-1), "Security probe passed.");
});

test("the security runbook documents the probe confirmation and required fixtures", () => {
  const source = readFileSync(new URL("../SECURITY.md", import.meta.url), "utf8");
  assert.match(source, /node scripts\/security-probe\.mjs --confirm/);
  for (const name of REQUIRED_ENVIRONMENT) assert.match(source, new RegExp(name));
  assert.match(source, /dedicated.*fixture/i);
  assert.match(source, /service-role/i);
});
