import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

describe("Auth server configuration", () => {
  it("keeps the local Auth server aligned with the browser password policy", () => {
    expect(config).toContain(`minimum_password_length = ${MIN_PASSWORD_LENGTH}`);
    expect(config).toContain(
      'password_requirements = "lower_upper_letters_digits"',
    );
  });

  it("bounds refresh-backed session lifetime", () => {
    expect(config).toContain('[auth.sessions]\ntimebox = "720h"');
    expect(config).toContain('inactivity_timeout = "168h"');
  });
});
