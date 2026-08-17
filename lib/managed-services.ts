/**
 * Capacités opérées par minddy, séparées du cœur auto-hébergé.
 *
 * Les drapeaux sont volontairement opt-in : une instance qui copie des secrets
 * ou utilise une clé OpenRouter pour ses propres besoins ne doit pas commencer
 * à servir un quota ou une facturation minddy sans décision explicite.
 */
export interface ManagedServiceEnvironment {
  NEXT_PUBLIC_APP_URL?: string;
  VERCEL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  MINDDY_MANAGED_BILLING?: string;
  MINDDY_MANAGED_AI?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID_GO?: string;
  STRIPE_PRICE_ID_PRO?: string;
  STRIPE_PRICE_ID_GO_YEARLY?: string;
  STRIPE_PRICE_ID_PRO_YEARLY?: string;
  OPENROUTER_API_KEY?: string;
}

import { isOfficialMinddyCloud } from "@/lib/deployment-profile";

export interface ManagedServices {
  billing: boolean;
  ai: boolean;
}

function enabled(value: string | undefined): boolean {
  return value === "1";
}

/** Tous les paramètres Stripe réellement utilisés par Checkout et le webhook. */
export function hasManagedBillingConfiguration(env: ManagedServiceEnvironment): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_WEBHOOK_SECRET &&
      env.STRIPE_PRICE_ID_GO &&
      env.STRIPE_PRICE_ID_PRO &&
      env.STRIPE_PRICE_ID_GO_YEARLY &&
      env.STRIPE_PRICE_ID_PRO_YEARLY,
  );
}

export function resolveManagedServices(env: ManagedServiceEnvironment): ManagedServices {
  const legacyEnabled = isOfficialMinddyCloud(env as Record<string, string | undefined>);
  const billingSelected = enabled(env.MINDDY_MANAGED_BILLING) ||
    (legacyEnabled && !env.MINDDY_MANAGED_BILLING?.trim());
  const aiSelected = enabled(env.MINDDY_MANAGED_AI) ||
    (legacyEnabled && !env.MINDDY_MANAGED_AI?.trim());
  return {
    billing: billingSelected && hasManagedBillingConfiguration(env),
    ai: aiSelected && Boolean(env.OPENROUTER_API_KEY),
  };
}

export function managedServices(): ManagedServices {
  return resolveManagedServices({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL: process.env.VERCEL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    MINDDY_MANAGED_BILLING: process.env.MINDDY_MANAGED_BILLING,
    MINDDY_MANAGED_AI: process.env.MINDDY_MANAGED_AI,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_ID_GO: process.env.STRIPE_PRICE_ID_GO,
    STRIPE_PRICE_ID_PRO: process.env.STRIPE_PRICE_ID_PRO,
    STRIPE_PRICE_ID_GO_YEARLY: process.env.STRIPE_PRICE_ID_GO_YEARLY,
    STRIPE_PRICE_ID_PRO_YEARLY: process.env.STRIPE_PRICE_ID_PRO_YEARLY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  });
}

export function isManagedBillingEnabled(): boolean {
  return managedServices().billing;
}

export function isManagedAiEnabled(): boolean {
  return managedServices().ai;
}
