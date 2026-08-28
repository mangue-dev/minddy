import assert from "node:assert/strict";
import test from "node:test";

import { authStateCoversUrl } from "./auth-state.mjs";

const state = (domain, name = "sb-project-auth-token") => ({
  cookies: [{ name, domain }],
});

test("accepts a host-only session cookie only for its exact host", () => {
  assert.equal(authStateCoversUrl(state("www.minddy.app"), "https://www.minddy.app/projects/1"), true);
  assert.equal(authStateCoversUrl(state("www.minddy.app"), "https://preview.minddy.app/projects/1"), false);
});

test("accepts a parent-domain session cookie for its subdomains", () => {
  assert.equal(authStateCoversUrl(state(".minddy.app"), "https://www.minddy.app/projects/1"), true);
  assert.equal(authStateCoversUrl(state(".minddy.app"), "https://preview.minddy.app/projects/1"), true);
});

test("rejects unrelated and non-authentication cookies", () => {
  assert.equal(authStateCoversUrl(state("localhost"), "https://www.minddy.app/projects/1"), false);
  assert.equal(authStateCoversUrl(state("www.minddy.app", "NEXT_LOCALE"), "https://www.minddy.app"), false);
  assert.equal(authStateCoversUrl({ cookies: [] }, "https://www.minddy.app"), false);
});
