import "server-only";

/**
 * Environment secrets that serve as KEY — checked at startup
 * (MIN-347).
 *
 * Each of them had, until now, the same control: "is the variable
 * there ? ". A string of three characters therefore passed without a word, and the key
 * AES-GCM derived from a scrypt which starts from a secret of three characters is not worth
 * no better than these three characters. Same for the HMAC of `state` git:
 * a short secret is a forgeable `state`, i.e. an installation
 * attributed to someone else's project.
 *
 * This module says TWO things, and refuses in both cases:
 * - a non-empty variable but too short: refusal EVERYWHERE, including in
 * development — this is a configuration error, and a toy secret in
 * dev ends up being copied to prod; an empty optional variable is equivalent
 * on the other hand to “absent”, so that a copied `.env.example` remains valid;
 * - a variable absent although it is required: refusal in a
 * DEPLOYED environment only. On a job, we work very well without
 * Stripe nor GitLab; what is not allowed to be missing online is this
 * on which a piece of already written data depends (the base envelopes) or a gate
 *    ouverte au public.
 *
 * The control runs in [instrumentation.ts](../../instrumentation.ts), before
 * the first request, AND at the point of use via `requireSecret`: the first says
 * the problem immediately and in full, the second guarantees that no path
 * uses a secret that no one has seen.
 */

/** Enough to read variables: `process.env`, or a test setting. */
export type SecretEnv = Record<string, string | undefined>;

export interface SecretSpec {
  name: string;
  /** Minimum length, in characters. */
  minLength: number;
  /** Other names accepted, in reading order (historical compass). */
  aliases?: string[];
  /** Required in a deployed environment? */
  requiredWhenDeployed: boolean;
  /** What it is used for — listed as is in the error message. */
  purpose: string;
}

/**
 * 32 characters: our own secrets are minted in `openssl rand -hex 32`
 * (64 characters), the floor is therefore twice as low as the real one. He
 * is not there to judge an entropy that cannot be measured from a
 * string — it is there so that “changeme” and “test” do not pass.
 */
const KEY_MIN = 32;

export const SECRET_SPECS: SecretSpec[] = [
  {
    name: "GIT_STATE_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "HMAC des `state` de connexion git",
  },
  {
    name: "GIT_TOKEN_ENCRYPTION_SECRET",
    aliases: ["GITLAB_TOKEN_ENCRYPTION_SECRET"],
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "chiffrement AES-GCM des tokens de forge",
  },
  {
    name: "AI_KEY_ENCRYPTION_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "chiffrement AES-GCM des clés IA apportées par les comptes",
  },
  {
    name: "FEEDBACK_SSO_ENCRYPTION_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "chiffrement AES-GCM des secrets SSO des boards publics",
  },
  {
    name: "CRON_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "authentification des routes de cron",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    minLength: 40,
    requiredWhenDeployed: true,
    purpose: "clé de service Supabase",
  },
  // Optional: the corresponding functionality turns off properly without them
  // (the provider is hidden, the webhook refuses everything). But if they are placed,
  // they are measured like the others.
  {
    name: "GITHUB_WEBHOOK_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "signature des webhooks GitHub",
  },
  {
    name: "MINDDY_FORGE_RELAY_WEBHOOK_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "HMAC signature of relayed forge webhook fan-out (instance-generated)",
  },
  {
    name: "GITLAB_WEBHOOK_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "repli historique du secret de webhook GitLab",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "signature des webhooks Stripe",
  },
  {
    name: "VAPID_PRIVATE_KEY",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "signature des notifications Web Push",
  },
  {
    name: "APNS_PRIVATE_KEY",
    minLength: 64,
    requiredWhenDeployed: false,
    purpose: "signature des notifications APNs de l'app macOS",
  },
  {
    name: "WNS_CLIENT_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "OAuth authentication for Windows Push Notification Services",
  },
];

/** Deployed environment, at Vercel as on any production Node server. */
function isDeployed(env: SecretEnv): boolean {
  return (
    env.NODE_ENV === "production" ||
    !!env.VERCEL ||
    env.VERCEL_ENV === "production" ||
    env.VERCEL_ENV === "preview"
  );
}

/** The value read for this spec (main name, then alias), already cleaned. */
function readValue(
  spec: SecretSpec,
  env: SecretEnv
): { key: string; value: string } | null {
  for (const key of [spec.name, ...(spec.aliases ?? [])]) {
    const raw = env[key];
    if (raw === undefined) continue;
    return { key, value: raw.trim() };
  }
  return null;
}

/**
 * The problems found, in plain English. Don't RISE: it's the caller who decides
 * what to do with it, and this is what makes the rule testable without manipulating
 * `process.env` du processus de test.
 */
export function findSecretProblems(env: SecretEnv = process.env): string[] {
  const problems: string[] = [];
  const deployed = isDeployed(env);

  for (const spec of SECRET_SPECS) {
    const found = readValue(spec, env);
    const names = [spec.name, ...(spec.aliases ?? [])].join(" ou ");

    if (!found || found.value.length === 0) {
      // An empty optional capacity is disabled. A mandatory secret
      // empty remains a more precise error than a simple “absent”.
      if (found && spec.requiredWhenDeployed) {
        problems.push(`${found.key} est vide (${spec.purpose}).`);
      } else if (deployed && spec.requiredWhenDeployed) {
        problems.push(`${names} est absent (${spec.purpose}).`);
      }
      continue;
    }

    if (found.value.length < spec.minLength) {
      problems.push(
        `${found.key} fait ${found.value.length} caractères, il en faut au moins ` +
          `${spec.minLength} (${spec.purpose}). Frappez-en un neuf : openssl rand -hex 32`
      );
    }
  }

  return problems;
}

/**
 * Startup control. STAND UP on the first set of problems, saying them
 * ALL — correct one variable to discover the next one on redeployment
 * Next, that's three deployments for a copy-paste error.
 */
export function assertSecretsAreStrong(env: SecretEnv = process.env): void {
  const problems = findSecretProblems(env);
  if (problems.length === 0) return;
  throw new Error(
    `Configuration refusée — ${problems.length} secret(s) d'environnement invalide(s) :\n` +
      problems.map((p) => `  • ${p}`).join("\n")
  );
}

/**
 * Secrecy, at the point of use, or an exception. It is the same rule as
 * above applied to a single variable: never silent fallback, never
 * encryption with a key that we haven't looked at.
 */
export function requireSecret(name: string, env: SecretEnv = process.env): string {
  const spec = SECRET_SPECS.find((s) => s.name === name);
  if (!spec) throw new Error(`Unknown secret ${name} (absent de SECRET_SPECS)`);
  const found = readValue(spec, env);
  if (!found || found.value.length === 0) {
    throw new Error(`Missing ${name} (${spec.purpose})`);
  }
  if (found.value.length < spec.minLength) {
    throw new Error(
      `${found.key} is too short: ${found.value.length} characters, ` +
        `${spec.minLength} required (${spec.purpose})`
    );
  }
  return found.value;
}

/** Is the secret deployed AND usable? (configuration guard.) */
export function hasStrongSecret(name: string, env: SecretEnv = process.env): boolean {
  try {
    requireSecret(name, env);
    return true;
  } catch {
    return false;
  }
}
