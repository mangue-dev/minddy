import { resolveDeploymentEdition } from "@/lib/env";

/**
 * Capabilities operated by minddy, separate from the self-hosted core.
 *
 * Flags are voluntarily opt-in: an instance that copies secrets
 * or uses an OpenRouter key for its own purposes should not start
 * serving minddy quota or billing without a decision explicit.
 */
export interface ManagedServiceEnvironment {
  [key: string]: string | undefined;
  MINDDY_EDITION?: string;
  MINDDY_MANAGED_BILLING?: string;
  MINDDY_MANAGED_AI?: string;
  MINDDY_MANAGED_FORGE?: string;
  MINDDY_FORGE_RELAY_URL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID_GO?: string;
  STRIPE_PRICE_ID_PRO?: string;
  STRIPE_PRICE_ID_GO_YEARLY?: string;
  STRIPE_PRICE_ID_PRO_YEARLY?: string;
  OPENROUTER_API_KEY?: string;
}

export interface ManagedServices {
  billing: boolean;
  ai: boolean;
  forge: boolean;
}

function enabled(value: string | undefined): boolean {
  return value === "1";
}

/** All Stripe settings actually used by Checkout and the webhook. */
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
  const cloud = resolveDeploymentEdition(env) === "cloud";
  return {
    billing: cloud && enabled(env.MINDDY_MANAGED_BILLING) && hasManagedBillingConfiguration(env),
    ai: cloud && enabled(env.MINDDY_MANAGED_AI) && Boolean(env.OPENROUTER_API_KEY),
    // The managed forge relay (docs/managed-forge-relay-plan.md): the Cloud
    // deployment operates the GitHub App / GitLab OAuth relay for opting-in
    // self-hosted instances. Active only with the explicit flag AND a
    // configured relay control-plane URL.
    forge: cloud && enabled(env.MINDDY_MANAGED_FORGE) && Boolean(env.MINDDY_FORGE_RELAY_URL?.trim()),
  };
}

export function managedServices(): ManagedServices {
  return resolveManagedServices({
    MINDDY_EDITION: process.env.MINDDY_EDITION,
    MINDDY_MANAGED_BILLING: process.env.MINDDY_MANAGED_BILLING,
    MINDDY_MANAGED_AI: process.env.MINDDY_MANAGED_AI,
    MINDDY_MANAGED_FORGE: process.env.MINDDY_MANAGED_FORGE,
    MINDDY_FORGE_RELAY_URL: process.env.MINDDY_FORGE_RELAY_URL,
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

export function isManagedForgeEnabled(): boolean {
  return managedServices().forge;
}
