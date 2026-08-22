import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerignore = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8");
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");

test("keeps runtime email templates in the container build context", () => {
  assert.match(dockerignore, /^supabase\/\*$/m);
  assert.match(dockerignore, /^!supabase\/email-templates$/m);
  assert.match(dockerignore, /^!supabase\/email-templates\/\*\*$/m);
  assert.match(
    dockerfile,
    /COPY --from=build --chown=minddy:minddy \/app\/supabase\/email-templates \.\/supabase\/email-templates/,
  );
});
