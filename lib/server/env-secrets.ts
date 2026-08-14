import "server-only";

/**
 * Les secrets d'environnement qui servent de CLÉ — vérifiés au démarrage
 * (MIN-347).
 *
 * Chacun d'eux avait, jusqu'ici, le même contrôle : « est-ce que la variable est
 * là ? ». Une chaîne de trois caractères passait donc sans un mot, et la clé
 * AES-GCM dérivée d'un scrypt qui part d'un secret de trois caractères ne vaut
 * pas mieux que ces trois caractères-là. Pareil pour le HMAC des `state` git :
 * un secret court est un `state` forgeable, c'est-à-dire une installation
 * attribuée au projet de quelqu'un d'autre.
 *
 * Ce module dit DEUX choses, et refuse dans les deux cas :
 *  - une variable posée mais trop courte (ou vide, ou tout en blancs) : refus
 *    PARTOUT, y compris en développement — c'est une erreur de configuration,
 *    et un secret jouet en dev finit par être copié en prod ;
 *  - une variable absente alors qu'elle est requise : refus dans un
 *    environnement DÉPLOYÉ seulement. Sur un poste, on travaille très bien sans
 *    Stripe ni GitLab ; ce qui n'a pas le droit de manquer en ligne, c'est ce
 *    dont dépend une donnée déjà écrite (les enveloppes en base) ou une porte
 *    ouverte au public.
 *
 * Le contrôle tourne dans [instrumentation.ts](../../instrumentation.ts), avant
 * la première requête, ET au point d'usage via `requireSecret` : le premier dit
 * le problème tout de suite et en entier, le second garantit qu'aucun chemin ne
 * se sert d'un secret que personne n'a regardé.
 */

/** De quoi lire des variables : `process.env`, ou un décor de test. */
export type SecretEnv = Record<string, string | undefined>;

export interface SecretSpec {
  name: string;
  /** Longueur minimale, en caractères. */
  minLength: number;
  /** Autres noms acceptés, dans l'ordre de lecture (compat historique). */
  aliases?: string[];
  /** Requis dans un environnement déployé ? */
  requiredWhenDeployed: boolean;
  /** À quoi il sert — repris tel quel dans le message d'erreur. */
  purpose: string;
}

/**
 * 32 caractères : nos propres secrets sont frappés en `openssl rand -hex 32`
 * (64 caractères), le plancher est donc deux fois plus bas que le réel. Il
 * n'est pas là pour juger d'une entropie qu'on ne peut pas mesurer depuis une
 * chaîne — il est là pour que « changeme » et « test » ne passent pas.
 */
const KEY_MIN = 32;

export const SECRET_SPECS: SecretSpec[] = [
  {
    name: "GIT_STATE_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: true,
    purpose: "HMAC des `state` de connexion git",
  },
  {
    name: "GIT_TOKEN_ENCRYPTION_SECRET",
    aliases: ["GITLAB_TOKEN_ENCRYPTION_SECRET"],
    minLength: KEY_MIN,
    requiredWhenDeployed: true,
    purpose: "chiffrement AES-GCM des tokens de forge",
  },
  {
    name: "AI_KEY_ENCRYPTION_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: true,
    purpose: "chiffrement AES-GCM des clés IA apportées par les comptes",
  },
  {
    name: "FEEDBACK_SSO_ENCRYPTION_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: true,
    purpose: "chiffrement AES-GCM des secrets SSO des boards publics",
  },
  {
    name: "CRON_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: true,
    purpose: "authentification des routes de cron",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    minLength: 40,
    requiredWhenDeployed: true,
    purpose: "clé de service Supabase",
  },
  // Optionnels : la fonctionnalité correspondante s'éteint proprement sans eux
  // (le fournisseur est masqué, le webhook refuse tout). Mais s'ils sont posés,
  // ils sont mesurés comme les autres.
  {
    name: "GITHUB_WEBHOOK_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "signature des webhooks GitHub",
  },
  {
    name: "GITLAB_WEBHOOK_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "repli historique du secret de webhook GitLab",
  },
  {
    name: "SUPABASE_WEBHOOK_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "signature des webhooks Supabase",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "signature des webhooks Stripe",
  },
  {
    name: "MINDDY_SSO_SECRET",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "signature du SSO vers notre propre board de retours",
  },
  {
    name: "VAPID_PRIVATE_KEY",
    minLength: KEY_MIN,
    requiredWhenDeployed: false,
    purpose: "signature des notifications Web Push",
  },
];

/** Environnement déployé (Vercel), par opposition à un poste de développement. */
function isDeployed(env: SecretEnv): boolean {
  return !!env.VERCEL || env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
}

/** La valeur lue pour cette spec (nom principal, puis alias), déjà nettoyée. */
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
 * Les problèmes trouvés, en clair. Ne LÈVE pas : c'est l'appelant qui décide
 * quoi en faire, et c'est ce qui rend la règle testable sans manipuler
 * `process.env` du processus de test.
 */
export function findSecretProblems(env: SecretEnv = process.env): string[] {
  const problems: string[] = [];
  const deployed = isDeployed(env);

  for (const spec of SECRET_SPECS) {
    const found = readValue(spec, env);
    const names = [spec.name, ...(spec.aliases ?? [])].join(" ou ");

    if (!found || found.value.length === 0) {
      // Posée mais vide : toujours une erreur — quelqu'un a cru la configurer.
      if (found) {
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
 * Le contrôle du démarrage. LÈVE sur le premier jeu de problèmes, en les disant
 * TOUS — corriger une variable pour découvrir la suivante au redéploiement
 * suivant, c'est trois déploiements pour une erreur de copier-coller.
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
 * Le secret, au point d'usage, ou une exception. C'est la même règle que
 * ci-dessus appliquée à une seule variable : jamais de repli silencieux, jamais
 * de chiffrement avec une clé qu'on n'a pas regardée.
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

/** Le secret est-il déployé ET utilisable ? (garde de configuration.) */
export function hasStrongSecret(name: string, env: SecretEnv = process.env): boolean {
  try {
    requireSecret(name, env);
    return true;
  } catch {
    return false;
  }
}
