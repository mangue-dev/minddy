import assert from "node:assert/strict";
import test from "node:test";

import { composeArgs, parseArgs } from "./smoke-self-hosted-compose.mjs";

test("requires the upstream Compose file only for the full smoke profile", () => {
  const managed = parseArgs([
    "--profile", "managed",
    "--env-file", ".env.example",
    "--public-url", "http://localhost",
    "--skip-scheduler",
  ]);
  assert.equal(managed.scheduler, false);
  assert.match(composeArgs(managed).join(" "), /compose\.managed\.yml/);
  assert.throws(
    () => parseArgs(["--profile", "full", "--env-file", ".env.example", "--public-url", "https://tickets.example.test"]),
    /supabase-compose is required/,
  );
});
