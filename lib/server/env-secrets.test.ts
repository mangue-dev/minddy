import { describe, expect, it } from "vitest";

import {
  type SecretEnv,
  SECRET_SPECS,
  assertSecretsAreStrong,
  findSecretProblems,
  hasStrongSecret,
  requireSecret,
} from "@/lib/server/env-secrets";

/**
 * MIN-347 — aucun contrôle de force sur les clés d'environnement.
 *
 * Le seul contrôle était « la variable est-elle là ? ». Une clé de chiffrement
 * de trois caractères passait donc sans un mot, et tout ce qu'elle scelle
 * ensuite en base vaut ces trois caractères.
 *
 * Ces cas travaillent sur un `env` PASSÉ EN ARGUMENT, jamais sur celui du
 * processus : un test qui écrit dans `process.env` fuit sur ses voisins.
 */

const strong = "0".repeat(64);

/** Un environnement déployé minimal — seul le cœur Supabase est obligatoire. */
function healthyEnv(): SecretEnv {
  const env: SecretEnv = { VERCEL: "1", VERCEL_ENV: "production" };
  for (const spec of SECRET_SPECS) {
    if (spec.requiredWhenDeployed) env[spec.name] = strong;
  }
  return env;
}

describe("findSecretProblems", () => {
  it("ne dit rien d'un environnement correct", () => {
    expect(findSecretProblems(healthyEnv())).toEqual([]);
  });

  it("refuse un secret trop court, PARTOUT — y compris hors déploiement", () => {
    for (const env of [healthyEnv(), {} as SecretEnv]) {
      env.GIT_STATE_SECRET = "trop-court";
      const problems = findSecretProblems(env);
      expect(problems.some((p) => p.includes("GIT_STATE_SECRET"))).toBe(true);
      expect(problems.some((p) => p.includes("10 caractères"))).toBe(true);
    }
  });

  it("traite un secret optionnel vide comme absent, mais refuse un requis vide", () => {
    const env = healthyEnv();
    env.AI_KEY_ENCRYPTION_SECRET = "";
    expect(findSecretProblems(env)).toEqual([]);

    env.AI_KEY_ENCRYPTION_SECRET = "        ";
    expect(findSecretProblems(env)).toEqual([]);

    env.SUPABASE_SERVICE_ROLE_KEY = "";
    expect(findSecretProblems(env).some((p) => p.includes("est vide"))).toBe(true);
  });

  it("laisse les secrets de capacités facultatives absents même en ligne", () => {
    const deployed = healthyEnv();
    delete deployed.CRON_SECRET;
    delete deployed.GIT_STATE_SECRET;
    delete deployed.AI_KEY_ENCRYPTION_SECRET;
    expect(findSecretProblems(deployed)).toEqual([]);

    // Poste de développement : rien n'est posé, et c'est très bien.
    expect(findSecretProblems({})).toEqual([]);
  });

  it("exige le cœur Supabase sur une production Node hors Vercel", () => {
    const problems = findSecretProblems({ NODE_ENV: "production" });
    expect(problems.some((p) => p.includes("SUPABASE_SERVICE_ROLE_KEY"))).toBe(true);
  });

  it("accepte les lignes optionnelles vides d'un .env.example copié", () => {
    const env = healthyEnv();
    for (const spec of SECRET_SPECS) {
      if (!spec.requiredWhenDeployed) env[spec.name] = "";
    }
    expect(findSecretProblems(env)).toEqual([]);
  });

  it("accepte l'ancien nom du secret de chiffrement des tokens de forge", () => {
    const env = healthyEnv();
    delete env.GIT_TOKEN_ENCRYPTION_SECRET;
    // Les enveloppes déjà en base ont été scellées avec celui-ci : le refuser
    // rendrait illisibles toutes les connexions GitLab existantes.
    env.GITLAB_TOKEN_ENCRYPTION_SECRET = strong;
    expect(findSecretProblems(env)).toEqual([]);
  });

  it("dit d'un coup tous les secrets optionnels présents mais invalides", () => {
    const env = healthyEnv();
    env.GIT_STATE_SECRET = "x";
    env.AI_KEY_ENCRYPTION_SECRET = "y";
    env.CRON_SECRET = "z";
    expect(findSecretProblems(env)).toHaveLength(3);
  });
});

describe("assertSecretsAreStrong", () => {
  it("lève — c'est ce refus-là qui empêche le serveur de démarrer", () => {
    const env = healthyEnv();
    env.GIT_STATE_SECRET = "court";
    expect(() => assertSecretsAreStrong(env)).toThrow(/GIT_STATE_SECRET/);
    expect(() => assertSecretsAreStrong(healthyEnv())).not.toThrow();
  });
});

describe("requireSecret", () => {
  it("rend le secret, ou lève — jamais de repli silencieux", () => {
    expect(requireSecret("CRON_SECRET", { CRON_SECRET: strong })).toBe(strong);
    expect(() => requireSecret("CRON_SECRET", {})).toThrow(/Missing CRON_SECRET/);
    expect(() => requireSecret("CRON_SECRET", { CRON_SECRET: "court" })).toThrow(
      /too short/
    );
  });

  it("nettoie les blancs autour — un secret collé avec un retour à la ligne", () => {
    expect(requireSecret("CRON_SECRET", { CRON_SECRET: `  ${strong}\n` })).toBe(strong);
  });

  it("refuse un nom qui n'est pas au catalogue", () => {
    // Sinon un secret ajouté un jour échapperait au contrôle sans qu'on le voie.
    expect(() => requireSecret("MDY_PAS_UNE_SPEC", {})).toThrow(/SECRET_SPECS/);
  });
});

describe("hasStrongSecret", () => {
  it("répond faux sur absent comme sur trop court", () => {
    expect(hasStrongSecret("GIT_STATE_SECRET", { GIT_STATE_SECRET: strong })).toBe(true);
    expect(hasStrongSecret("GIT_STATE_SECRET", {})).toBe(false);
    expect(hasStrongSecret("GIT_STATE_SECRET", { GIT_STATE_SECRET: "court" })).toBe(
      false
    );
  });
});
