import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNonProductionDatabase,
  assertNonProductionOrigin,
  supabaseProjectRef,
} from "./database-target.mjs";
import { PRODUCTION_SUPABASE_REFS } from "./config.mjs";

const production = `https://${PRODUCTION_SUPABASE_REFS[0]}.supabase.co`;

test("reads the project ref of hosted Supabase URLs only", () => {
  assert.equal(supabaseProjectRef("https://abcdefghijkl.supabase.co/rest/v1/"), "abcdefghijkl");
  assert.equal(supabaseProjectRef("http://127.0.0.1:54321"), null);
  assert.equal(supabaseProjectRef("https://abcdefghijkl.supabase.co.example.test"), null);
});

test("refuses the production database and accepts preview or local ones", () => {
  assert.throws(() => assertNonProductionDatabase(production, "the capture admin"), /production database/);
  assert.throws(() => assertNonProductionDatabase(production.toUpperCase(), "the capture admin"), /production/);
  assert.doesNotThrow(() => assertNonProductionDatabase("https://previewref1234.supabase.co", "the capture admin"));
  assert.doesNotThrow(() => assertNonProductionDatabase("http://127.0.0.1:54321", "the capture admin"));
});

test("refuses production origins for preview-only sessions", () => {
  assert.throws(() => assertNonProductionOrigin("https://www.minddy.app/admin", "the admin session"), /preview-only/);
  assert.throws(() => assertNonProductionOrigin("https://minddy.app", "the admin session"), /preview-only/);
  assert.doesNotThrow(() => assertNonProductionOrigin("https://preview.minddy.app", "the admin session"));
  assert.doesNotThrow(() => assertNonProductionOrigin("http://localhost:3000", "the admin session"));
});
