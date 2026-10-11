import assert from "node:assert/strict";
import test from "node:test";
import { checkDeploymentDatabase } from "./check-deployment-database.mjs";

const env = {
  MINDDY_PUBLIC_SUPABASE_URL: "https://database.example.test",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
};

function schema() {
  return {
    paths: {
      "/rpc/auth_authorization_state": { post: {} },
      "/rpc/resolve_realtime_topic": { post: {} },
      "/user_numo_preferences": { get: {} },
    },
    definitions: { user_numo_preferences: { properties: {
      user_id: { type: "string" }, provider: { type: "string" },
      model: { type: "string" }, updated_at: { type: "string" },
    } } },
  };
}

test("checks only the service-role OpenAPI schema before allowing a compatible deployment", async () => {
  const calls = [];
  await checkDeploymentDatabase(env, async (url, options) => {
    calls.push({ url: url.toString(), options });
    return Response.json(schema());
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://database.example.test/rest/v1/");
  assert.equal(calls[0].options.headers.Accept, "application/openapi+json");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.method, undefined);
});

test("blocks a deployment when the Numo preference migration is absent", async () => {
  const incomplete = schema();
  delete incomplete.paths["/user_numo_preferences"];
  await assert.rejects(checkDeploymentDatabase(env, async () => Response.json(incomplete)),
    /missing required schema entries: \/user_numo_preferences.*migrations/);
});

test("blocks a deployment when the preference provider column is absent", async () => {
  const incomplete = schema();
  delete incomplete.definitions.user_numo_preferences.properties.provider;
  await assert.rejects(checkDeploymentDatabase(env, async () => Response.json(incomplete)),
    /user_numo_preferences\.provider/);
});

test("still requires the auth and Realtime entry points", async () => {
  const incomplete = schema();
  delete incomplete.paths["/rpc/resolve_realtime_topic"];
  await assert.rejects(checkDeploymentDatabase(env, async () => Response.json(incomplete)),
    /\/rpc\/resolve_realtime_topic/);
});

test("does not include upstream response text or transport secrets in failures", async () => {
  for (const fetcher of [
    async () => new Response("private-database-response", { status: 503 }),
    async () => { throw new Error("synthetic-service-key private-database-response"); },
  ]) {
    await assert.rejects(checkDeploymentDatabase(env, fetcher), (error) => {
      assert.equal(error.message, "Database preflight could not read the target PostgREST schema.");
      return true;
    });
  }
});
