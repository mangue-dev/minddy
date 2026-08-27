/**
 * Pure catalog of infrastructures on which minddy can depend.
 *
 * It does not read `process.env` itself: the server passes it its environment,
 * and the tests can thus prove that an empty installation does not activate anything.
 */
export type CapabilityRequirement = "required" | "replaceable" | "optional";
export type CapabilityState = "ready" | "disabled" | "incomplete" | "external";

export type CapabilityId =
  | "supabase"
  | "storage"
  | "managedBilling"
  | "managedAi"
  | "agentExecution"
  | "vercelSandbox"
  | "vercelDomains"
  | "vercelWebAnalytics"
  | "scheduler"
  | "analytics"
  | "transactionalEmail"
  | "webPush"
  | "apns"
  | "wns"
  | "github"
  | "gitlab";

export interface CapabilityStatus {
  id: CapabilityId;
  requirement: CapabilityRequirement;
  state: CapabilityState;
  configured: boolean;
  missing: string[];
  diagnostic: string;
}

export type CapabilityEnvironment = Record<string, string | undefined>;

export type AgentExecutionBackend = "self-hosted" | "vercel" | null;

/**
 * The server sandbox selected for every non-desktop agent run. Interactive
 * Numo sessions, routines, automations, and reviews deliberately share this
 * decision instead of selecting execution infrastructure per feature.
 */
export function resolveAgentExecutionBackend(
  env: CapabilityEnvironment,
): AgentExecutionBackend {
  const backend = env.AGENT_EXECUTION_BACKEND?.trim();
  return backend === "self-hosted" || backend === "vercel" ? backend : null;
}

import { resolveDeploymentEdition } from "@/lib/env";
import {
  isForgeRelayOptedOut,
  resolveForgeRelayConfig,
} from "@/lib/forge-relay";

const present = (env: CapabilityEnvironment, key: string): boolean =>
  Boolean(env[key]?.trim());

function validVapidSubject(value: string | undefined): boolean {
  const subject = value?.trim();
  return Boolean(subject?.startsWith("mailto:") || subject?.startsWith("https://"));
}

function missing(env: CapabilityEnvironment, keys: string[]): string[] {
  return keys.filter((key) => !present(env, key));
}

function status(params: {
  id: CapabilityId;
  requirement: CapabilityRequirement;
  state: CapabilityState;
  missing?: string[];
  diagnostic: string;
}): CapabilityStatus {
  return {
    id: params.id,
    requirement: params.requirement,
    state: params.state,
    configured: params.state === "ready" || params.state === "external",
    missing: params.missing ?? [],
    diagnostic: params.diagnostic,
  };
}

function optIn(
  env: CapabilityEnvironment,
  params: {
    id: CapabilityId;
    requirement: CapabilityRequirement;
    flag: string;
    keys: string[];
    ready: string;
  },
): CapabilityStatus {
  const explicit = env[params.flag]?.trim();
  if (explicit !== "1") {
    return status({
      ...params,
      state: "disabled",
      diagnostic: `${params.flag}=1 is required to enable this capability.`,
    });
  }
  const absent = missing(env, params.keys);
  return absent.length === 0
    ? status({ ...params, state: "ready", diagnostic: params.ready })
    : status({
        ...params,
        state: "incomplete",
        missing: absent,
        diagnostic: `Configuration incomplete; missing: ${absent.join(", ")}.`,
      });
}

function cloudOptIn(
  env: CapabilityEnvironment,
  edition: ReturnType<typeof resolveDeploymentEdition>,
  params: Parameters<typeof optIn>[1],
): CapabilityStatus {
  if (edition !== "cloud") {
    return status({
      ...params,
      state: "disabled",
      diagnostic: `${params.id} is only available when MINDDY_EDITION=cloud.`,
    });
  }
  return optIn(env, params);
}

/** Resolves all capabilities, without SDK import or network calls. */
export function resolveCapabilities(env: CapabilityEnvironment): Record<CapabilityId, CapabilityStatus> {
  const edition = resolveDeploymentEdition(env);
  const supabaseMissing = missing(env, [
    "MINDDY_PUBLIC_SUPABASE_URL",
    "MINDDY_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  const supabase = status({
    id: "supabase",
    requirement: "required",
    state: supabaseMissing.length === 0 ? "ready" : "incomplete",
    missing: supabaseMissing,
    diagnostic:
      supabaseMissing.length === 0
        ? "Supabase database, Auth and Realtime are configured."
        : `Core unavailable; missing: ${supabaseMissing.join(", ")}.`,
  });

  const billing = cloudOptIn(env, edition, {
    id: "managedBilling",
    requirement: "optional",
    flag: "MINDDY_MANAGED_BILLING",
    keys: [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ID_GO",
      "STRIPE_PRICE_ID_PRO",
      "STRIPE_PRICE_ID_GO_YEARLY",
      "STRIPE_PRICE_ID_PRO_YEARLY",
    ],
    ready: "Managed Stripe billing is enabled.",
  });
  const managedAi = cloudOptIn(env, edition, {
    id: "managedAi",
    requirement: "replaceable",
    flag: "MINDDY_MANAGED_AI",
    keys: ["OPENROUTER_API_KEY"],
    ready: "Managed OpenRouter quota is enabled; BYOK remains an alternative.",
  });

  const sandboxBackend = resolveAgentExecutionBackend(env);
  const sandboxKeys = present(env, "VERCEL")
    ? []
    : missing(env, [
        "VERCEL_TOKEN",
        "VERCEL_TEAM_ID",
        "VERCEL_PROJECT_ID",
        "MINDDY_PUBLIC_APP_URL",
      ]);
  const vercelSandbox =
    sandboxBackend !== "vercel"
      ? status({
          id: "vercelSandbox",
          requirement: "replaceable",
          state: "disabled",
          diagnostic:
            "Vercel Sandbox is disabled. Set AGENT_EXECUTION_BACKEND=vercel or use the local agent runtime.",
        })
      : sandboxKeys.length === 0
        ? status({
            id: "vercelSandbox",
            requirement: "replaceable",
            state: "ready",
            diagnostic: "Vercel Sandbox execution is explicitly enabled.",
          })
        : status({
            id: "vercelSandbox",
            requirement: "replaceable",
            state: "incomplete",
            missing: sandboxKeys,
            diagnostic: `Vercel Sandbox selected but credentials are missing: ${sandboxKeys.join(", ")}.`,
          });
  const selfHostedRunnerMissing = missing(env, ["AGENT_RUNNER_URL", "AGENT_RUNNER_SECRET"]);
  const agentExecution = sandboxBackend === "self-hosted"
    ? selfHostedRunnerMissing.length === 0
      ? status({
          id: "agentExecution",
          requirement: "replaceable",
          state: "ready",
          diagnostic: "The built-in self-hosted agent runner is configured.",
        })
      : status({
          id: "agentExecution",
          requirement: "replaceable",
          state: "incomplete",
          missing: selfHostedRunnerMissing,
          diagnostic: `Self-hosted agent runner selected but configuration is missing: ${selfHostedRunnerMissing.join(", ")}.`,
        })
    : sandboxBackend === "vercel"
      ? status({
          id: "agentExecution",
          requirement: "replaceable",
          state: vercelSandbox.state,
          missing: vercelSandbox.missing,
          diagnostic: vercelSandbox.diagnostic,
        })
      : status({
          id: "agentExecution",
          requirement: "replaceable",
          state: "disabled",
          diagnostic: "Server-side agent execution is disabled; desktop-local runs remain available.",
        });

  const domainMissing = missing(env, ["VERCEL_TOKEN", "VERCEL_PROJECT_ID"]);
  const vercelDomains = status({
    id: "vercelDomains",
    requirement: "optional",
    state: domainMissing.length === 0 ? "ready" : "disabled",
    missing: domainMissing,
    diagnostic:
      domainMissing.length === 0
        ? "Vercel custom-domain management is configured."
        : `Custom domains are hidden; missing: ${domainMissing.join(", ")}.`,
  });

  const clientAnalytics = present(env, "MINDDY_PUBLIC_POSTHOG_KEY") &&
    present(env, "MINDDY_PUBLIC_POSTHOG_HOST");
  const serverAnalytics = present(env, "POSTHOG_API_KEY") && present(env, "POSTHOG_HOST");
  const analyticsMissing = clientAnalytics || serverAnalytics
    ? []
    : ["MINDDY_PUBLIC_POSTHOG_KEY + MINDDY_PUBLIC_POSTHOG_HOST or POSTHOG_API_KEY + POSTHOG_HOST"];
  const analytics = status({
    id: "analytics",
    requirement: "optional",
    state: analyticsMissing.length === 0 ? "ready" : "disabled",
    missing: analyticsMissing,
    diagnostic:
      analyticsMissing.length === 0
        ? "PostHog analytics is configured."
        : "Analytics is disabled; no PostHog SDK is initialized and no event is sent.",
  });

  const emailProvider = env.EMAIL_PROVIDER?.trim();
  const emailMissing = missing(env, ["RESEND_API_KEY"]);
  if (!present(env, "FEEDBACK_EMAIL_FROM")) emailMissing.push("FEEDBACK_EMAIL_FROM");
  if (!present(env, "INVITATION_EMAIL_FROM")) emailMissing.push("INVITATION_EMAIL_FROM");
  const transactionalEmail =
    emailProvider !== "resend"
      ? status({
          id: "transactionalEmail",
          requirement: "replaceable",
          state: "disabled",
          diagnostic:
            "Application email is disabled. Set EMAIL_PROVIDER=resend with explicit senders, or configure SMTP in Supabase for Auth mail.",
        })
      : emailMissing.length === 0
        ? status({
            id: "transactionalEmail",
            requirement: "replaceable",
            state: "ready",
            diagnostic: "Resend application email is explicitly enabled.",
          })
        : status({
            id: "transactionalEmail",
            requirement: "replaceable",
            state: "incomplete",
            missing: emailMissing,
            diagnostic: `Resend selected but configuration is missing: ${emailMissing.join(", ")}.`,
          });

  const webPushMissing = missing(env, [
    "MINDDY_PUBLIC_VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
  ]);
  const vapidSubject = env.VAPID_SUBJECT;
  if (!validVapidSubject(vapidSubject)) webPushMissing.push("VAPID_SUBJECT (mailto: or https:)");
  const apnsMissing = missing(env, [
    "APNS_TEAM_ID",
    "APNS_KEY_ID",
    "APNS_PRIVATE_KEY",
  ]);
  if (!present(env, "APNS_BUNDLE_ID")) {
    apnsMissing.push("APNS_BUNDLE_ID");
  }
  const wnsMissing = missing(env, [
    "WNS_TENANT_ID",
    "WNS_APP_ID",
    "WNS_CLIENT_SECRET",
  ]);
  const gitStateMissing = missing(env, ["GIT_STATE_SECRET"]);
  const githubMissing = missing(env, [
    "GITHUB_APP_ID",
    "GITHUB_APP_SLUG",
    "GITHUB_APP_PRIVATE_KEY",
    "GIT_STATE_SECRET",
  ]);
  const forgeTokenSecret = (
    env.GIT_TOKEN_ENCRYPTION_SECRET ?? env.GITLAB_TOKEN_ENCRYPTION_SECRET
  )?.trim();
  const gitlabSecret = Boolean(forgeTokenSecret && forgeTokenSecret.length >= 32);
  const relayMissing = [
    ...gitStateMissing,
    ...(gitlabSecret ? [] : ["GIT_TOKEN_ENCRYPTION_SECRET (at least 32 characters)"]),
  ];
  const gitlabMissing = [
    ...missing(env, ["GITLAB_OAUTH_CLIENT_ID", "GITLAB_OAUTH_CLIENT_SECRET", "GIT_STATE_SECRET"]),
    ...(gitlabSecret ? [] : ["GIT_TOKEN_ENCRYPTION_SECRET"]),
  ];

  const optional = (
    id: CapabilityId,
    absent: string[],
    ready: string,
    off: string,
  ): CapabilityStatus =>
    status({
      id,
      requirement: "optional",
      state: absent.length === 0 ? "ready" : "disabled",
      missing: absent,
      diagnostic:
        absent.length === 0 ? ready : `${off} Missing: ${absent.join(", ")}.`,
    });

  /**
   * A git provider served either by the operator-owned app (local
   * credentials, precedence for new connections when both are configured) or
   * by the managed forge relay (docs/managed-forge-relay-plan.md). The relay
   * is a REPLACEABLE provider with three activation shapes, in order:
   * explicit relay variables (pinned control plane), then automatic
   * provisioning — the DEFAULT on a self-hosted edition without local app,
   * where credentials are issued on first connect and stored in the instance
   * database — and finally `MINDDY_FORGE_RELAY=0`, which disables it exactly
   * like a missing local app. Note this is the CONFIGURATION-level view:
   * each connection also carries a `source` marker, and token routing
   * follows the channel the connection was actually established through
   * until it is reconnected.
   */
  const gitProvider = (
    id: CapabilityId,
    localMissing: string[],
    relayMissing: string[],
    localReady: string,
    localOff: string,
    relayReady: string,
    autoReady: string,
  ): CapabilityStatus => {
    if (localMissing.length === 0) {
      return status({
        id,
        requirement: "optional",
        state: "ready",
        diagnostic: localReady,
      });
    }
    if (resolveForgeRelayConfig(env)) {
      return relayMissing.length === 0
        ? status({
            id,
            requirement: "replaceable",
            state: "ready",
            diagnostic: relayReady,
          })
        : status({
            id,
            requirement: "replaceable",
            state: "incomplete",
            missing: relayMissing,
            diagnostic: `Managed forge relay selected but configuration is missing: ${relayMissing.join(", ")}.`,
          });
    }
    if (
      resolveDeploymentEdition(env) === "self-hosted" &&
      !isForgeRelayOptedOut(env)
    ) {
      // Automatic provisioning removes only the CLOUD-side app credentials:
      // the instance-side secrets (git state signing, token encryption) stay
      // required — relayed tokens and claim states use them exactly like the
      // pinned-relay path.
      return relayMissing.length === 0
        ? status({
            id,
            requirement: "replaceable",
            state: "ready",
            diagnostic: autoReady,
          })
        : status({
            id,
            requirement: "replaceable",
            state: "incomplete",
            missing: relayMissing,
            diagnostic: `Managed forge relay is selected by default but configuration is missing: ${relayMissing.join(", ")}.`,
          });
    }
    return status({
      id,
      requirement: "optional",
      state: "disabled",
      missing: localMissing,
      diagnostic: `${localOff} Missing: ${localMissing.join(", ")}.`,
    });
  };

  return {
    supabase,
    storage: status({
      id: "storage",
      requirement: "required",
      state: supabase.state,
      missing: supabase.missing,
      diagnostic:
        supabase.state === "ready"
          ? "Supabase Storage is the core storage backend."
          : "Storage unavailable until the required Supabase stack is configured.",
    }),
    managedBilling: billing,
    managedAi,
    agentExecution,
    vercelSandbox,
    vercelDomains,
    vercelWebAnalytics: status({
      id: "vercelWebAnalytics",
      requirement: "optional",
      state: env.MINDDY_PUBLIC_VERCEL_ANALYTICS?.trim() === "1" ? "ready" : "disabled",
      missing: env.MINDDY_PUBLIC_VERCEL_ANALYTICS?.trim() === "1" ? [] : ["MINDDY_PUBLIC_VERCEL_ANALYTICS=1"],
      diagnostic: env.MINDDY_PUBLIC_VERCEL_ANALYTICS?.trim() === "1"
        ? "Vercel Analytics and Speed Insights are enabled on public pages."
        : "Vercel Analytics and Speed Insights are disabled; set MINDDY_PUBLIC_VERCEL_ANALYTICS=1 to enable them.",
    }),
    scheduler:
      !present(env, "CRON_SECRET")
          ? status({
              id: "scheduler",
              requirement: "replaceable",
              state: "disabled",
              missing: ["CRON_SECRET"],
              diagnostic:
                "Background jobs are disabled; configure CRON_SECRET and an HTTP scheduler to enable them.",
            })
          : status({
              id: "scheduler",
              requirement: "replaceable",
              state: "external",
              diagnostic:
                "Cron routes are enabled and authenticated for the configured external scheduler.",
            }),
    analytics,
    transactionalEmail,
    webPush: optional(
      "webPush",
      webPushMissing,
      "Web Push is configured.",
      "Web Push is disabled; inbox notifications continue without network delivery.",
    ),
    apns: optional(
      "apns",
      apnsMissing,
      "APNs is configured.",
      "APNs is disabled; no connection to Apple is opened.",
    ),
    wns: optional(
      "wns",
      wnsMissing,
      "WNS is configured.",
      "WNS is disabled; no connection to Microsoft is opened.",
    ),
    github: gitProvider(
      "github",
      githubMissing,
      relayMissing,
      "GitHub App integration is configured (operator-owned app).",
      "GitHub integration is hidden because its configuration is absent or incomplete.",
      "GitHub integration is served by the managed forge relay.",
      "GitHub integration connects through the managed forge relay; credentials are provisioned automatically on first connect.",
    ),
    gitlab: gitProvider(
      "gitlab",
      gitlabMissing,
      // Relayed tokens are stored instance-side (encrypted at rest), so the
      // relay path requires the same encryption secret as the local one —
      // without it the connect flow would fail at encrypt time after Cloud
      // had already consumed the brokered delivery.
      relayMissing,
      "GitLab OAuth integration is configured (operator-owned app).",
      "GitLab integration is hidden because its configuration is absent or incomplete.",
      "GitLab integration is served by the managed forge relay.",
      "GitLab integration connects through the managed forge relay; credentials are provisioned automatically on first connect.",
    ),
  };
}
