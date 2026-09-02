import { describe, expect, it } from "vitest";

import { formatSecretFindings, isSecretFile, scanDiff, scanSecrets } from "./secret-scan";

/**
 * MIN-360 — SCAN OF SECRETS BEFORE PUSH.
 *
 * The test that counts is
 * not the list of finds: it is the list of what should NOT be found a.
 * This door is HARD — it refuses pushing — so a false positive blocks an entire round
 *, and a guardrail that blocks rounds ends up being removed.
 */

const kinds = (text: string) => scanSecrets(text).map((f) => f.kind);

describe("scanSecrets — ce qui s'annonce", () => {
  const cases: Array<[string, string]> = [
    ["AWS access key id", "aws_access_key_id=AKIAIOSFODNN7SELMPLE"],
    ["GitHub token", "GITHUB_TOKEN=ghp_0123456789abcdefghijklmnopqrstuvwxyz"],
    [
      "GitHub fine-grained token",
      "token: github_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefghij",
    ],
    ["Slack token", "SLACK=xoxb-123456789012-abcdefghijkl"],
    ["Stripe live key", "STRIPE_SECRET_KEY=sk_live_51QwErTyUiOpAsDfGh"],
    ["Anthropic key", "ANTHROPIC_API_KEY=sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz01"],
    ["OpenRouter key", `OPENROUTER_API_KEY=sk-or-v1-${"a1b2c3d4".repeat(8)}`],
    ["Google API key", "key=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q"],
    ["npm token", "//registry.npmjs.org/:_authToken=npm_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["Vercel Blob token", "BLOB_READ_WRITE_TOKEN=vercel_blob_rw_AbCdEfGhIjKlMnOpQrSt_xyz"],
    ["private key", "-----BEGIN OPENSSH PRIVATE KEY-----"],
  ];
  for (const [kind, text] of cases) {
    it(`reconnaît un ${kind}`, () => {
      expect(kinds(text)).toContain(kind);
    });
  }

  it("ne recopie jamais le jeton entier — ce module écrit dans un fil", () => {
    const token = "ghp_0123456789abcdefghijklmnopqrstuvwxyz";
    const [finding] = scanSecrets(`TOKEN=${token}`, "lib/x.ts");
    expect(finding.sample).toBe("ghp_01234567…");
    expect(finding.sample).not.toContain(token.slice(-8));
    expect(finding.file).toBe("lib/x.ts");
  });

  it("ne compte qu'une fois le même jeton répété", () => {
    const token = "ghp_0123456789abcdefghijklmnopqrstuvwxyz";
    expect(scanSecrets(`a=${token}\nb=${token}`)).toHaveLength(1);
  });
});

describe("scanSecrets — les faux positifs à ne PAS attraper", () => {
  for (const text of [
    // The value itself appears as a decoration.
    "GITHUB_TOKEN=ghp_your_token_here_0123456789abcdefghijkl",
    "STRIPE_SECRET_KEY=sk_live_EXAMPLE_KEY_0123456789",
    "ANTHROPIC_API_KEY=sk-ant-api03-placeholder-0123456789012345",
    "AWS=AKIAXXXXXXXXXXXXXXXX",
    // Nothing structured: a sha, a hash, a random string.
    "const sha = 'a308f21c4b9e0d7f1234567890abcdef12345678';",
    "integrity: sha512-8Rk+7ZlKCbJl6kZ2gLmQz1o9wYbXk3PfQ2n1cA7v==",
    "const id = crypto.randomUUID();",
    // A prefix too short to be a token.
    "class='sk-chase-dot'",
    "npm_config_registry=https://registry.npmjs.org/",
  ]) {
    it(`laisse passer \`${text.slice(0, 44)}\``, () => {
      expect(scanSecrets(text)).toEqual([]);
    });
  }

  /**
 * THE BARE JWT WAS REMOVED ON PURPOSE, and this test is what's stopping it from coming back:
 * Supabase's anonymous key IS a JWT, it's public by design, and
 * it lives in half of the world's `.env.example`.
 */
  it("ignore un JWT ordinaire et reconnaît celui qui dit `service_role`", () => {
    const jwt = (payload: Record<string, unknown>) =>
      [
        Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
        Buffer.from(JSON.stringify(payload)).toString("base64url"),
        "c2lnbmF0dXJlLXBsYWNlLWljaS1sb25ndWU",
      ].join(".");
    expect(scanSecrets(jwt({ role: "anon", iss: "supabase", exp: 2000000000 }))).toEqual([]);
    expect(
      kinds(jwt({ role: "service_role", iss: "supabase", exp: 2000000000 })),
    ).toContain("service-role JWT");
  });
});

describe("scanDiff — les lignes AJOUTÉES, et elles seules", () => {
  const diff = [
    "diff --git a/lib/x.ts b/lib/x.ts",
    "--- a/lib/x.ts",
    "+++ b/lib/x.ts",
    "@@ -1,3 +1,3 @@",
    "-const key = ghp_0000000000000000000000000000000000000;",
    "+const key = process.env.GITHUB_TOKEN;",
    "+const other = 'ghp_0123456789abcdefghijklmnopqrstuvwxyz';",
  ].join("\n");

  it("ne voit pas un secret qu'on RETIRE", () => {
    // Otherwise a secret already in the repository would block all tricks that touch
    // to this file, forever, without the agent having anything to do with it.
    const found = scanDiff(diff);
    expect(found).toHaveLength(1);
    expect(found[0].sample).toBe("ghp_01234567…");
  });

  it("attribue la trouvaille au bon fichier", () => {
    expect(scanDiff(diff)[0].file).toBe("lib/x.ts");
  });

  it("ne prend pas l'en-tête `+++` pour une ligne ajoutée", () => {
    expect(scanDiff("+++ b/.env\n context")).toEqual([]);
  });
});

describe("isSecretFile", () => {
  it("reconnaît la famille dotenv", () => {
    for (const path of [".env", "apps/web/.env", ".env.local", ".env.production.local"]) {
      expect(isSecretFile(path)).toBe(true);
    }
  });

  it("épargne les fichiers faits pour être lus", () => {
    // Often the only place where the NAME of the variables is written.
    for (const path of [".env.example", ".env.sample", ".env.local.template", "lib/env.ts"]) {
      expect(isSecretFile(path)).toBe(false);
    }
  });
});

describe("formatSecretFindings", () => {
  it("nomme le fichier, dit que rien n'est parti, et propose la sortie", () => {
    const message = formatSecretFindings(
      scanSecrets("K=ghp_0123456789abcdefghijklmnopqrstuvwxyz", "lib/x.ts"),
    );
    expect(message).toContain("lib/x.ts");
    expect(message).toMatch(/nothing was committed/i);
    expect(message).toMatch(/\.env\.example/);
    // The entire token is not copied into the thread.
    expect(message).not.toContain("mnopqrstuvwxyz");
  });
});
