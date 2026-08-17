/**
 * Catalogue pur des infrastructures dont minddy peut dépendre.
 *
 * Il ne lit pas `process.env` lui-même : le serveur lui passe son environnement,
 * et les tests peuvent ainsi prouver qu'une installation vide n'active rien.
 */
export type CapabilityRequirement = "required" | "replaceable" | "optional";
export type CapabilityState = "ready" | "disabled" | "incomplete" | "external";

export type CapabilityId =
  | "supabase"
  | "storage"
  | "managedBilling"
  | "managedAi"
  | "vercelSandbox"
  | "vercelDomains"
  | "vercelWebAnalytics"
  | "scheduler"
  | "analytics"
  | "transactionalEmail"
  | "webPush"
  | "apns"
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
  if (env[params.flag]?.trim() !== "1") {
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

/** Résout toutes les capacités, sans import de SDK ni appel réseau. */
export function resolveCapabilities(env: CapabilityEnvironment): Record<CapabilityId, CapabilityStatus> {
  const supabaseMissing = missing(env, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
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

  const billing = optIn(env, {
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
  const managedAi = optIn(env, {
    id: "managedAi",
    requirement: "replaceable",
    flag: "MINDDY_MANAGED_AI",
    keys: ["OPENROUTER_API_KEY"],
    ready: "Managed OpenRouter quota is enabled; BYOK remains an alternative.",
  });

  const sandboxBackend = env.AGENT_EXECUTION_BACKEND?.trim();
  const sandboxKeys = present(env, "VERCEL")
    ? []
    : missing(env, [
        "VERCEL_TOKEN",
        "VERCEL_TEAM_ID",
        "VERCEL_PROJECT_ID",
        "NEXT_PUBLIC_APP_URL",
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

  const clientAnalytics = present(env, "NEXT_PUBLIC_POSTHOG_KEY") &&
    present(env, "NEXT_PUBLIC_POSTHOG_HOST");
  const serverAnalytics = present(env, "POSTHOG_API_KEY") && present(env, "POSTHOG_HOST");
  const analyticsMissing = clientAnalytics || serverAnalytics
    ? []
    : ["NEXT_PUBLIC_POSTHOG_KEY + NEXT_PUBLIC_POSTHOG_HOST or POSTHOG_API_KEY + POSTHOG_HOST"];
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
  const emailMissing = missing(env, [
    "RESEND_API_KEY",
    "FEEDBACK_EMAIL_FROM",
    "INVITATION_EMAIL_FROM",
  ]);
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
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
  ]);
  if (!validVapidSubject(env.VAPID_SUBJECT)) webPushMissing.push("VAPID_SUBJECT (mailto: or https:)");
  const apnsMissing = missing(env, [
    "APNS_TEAM_ID",
    "APNS_KEY_ID",
    "APNS_PRIVATE_KEY",
    "APNS_BUNDLE_ID",
  ]);
  const githubMissing = missing(env, [
    "GITHUB_APP_ID",
    "GITHUB_APP_SLUG",
    "GITHUB_APP_PRIVATE_KEY",
    "GIT_STATE_SECRET",
  ]);
  const gitlabSecret = present(env, "GIT_TOKEN_ENCRYPTION_SECRET") ||
    present(env, "GITLAB_TOKEN_ENCRYPTION_SECRET");
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
    vercelSandbox,
    vercelDomains,
    vercelWebAnalytics: status({
      id: "vercelWebAnalytics",
      requirement: "optional",
      state: env.NEXT_PUBLIC_VERCEL_ANALYTICS?.trim() === "1" ? "ready" : "disabled",
      missing:
        env.NEXT_PUBLIC_VERCEL_ANALYTICS?.trim() === "1"
          ? []
          : ["NEXT_PUBLIC_VERCEL_ANALYTICS=1"],
      diagnostic:
        env.NEXT_PUBLIC_VERCEL_ANALYTICS?.trim() === "1"
          ? "Vercel Analytics and Speed Insights are enabled on public pages."
          : "Vercel Analytics and Speed Insights are disabled; set NEXT_PUBLIC_VERCEL_ANALYTICS=1 to enable them.",
    }),
    scheduler:
      env.SCHEDULER_ENABLED?.trim() !== "1"
        ? status({
            id: "scheduler",
            requirement: "replaceable",
            state: "disabled",
            missing: ["SCHEDULER_ENABLED=1"],
            diagnostic:
              "Background jobs are disabled. Configure an external HTTP scheduler, then set SCHEDULER_ENABLED=1.",
          })
        : !present(env, "CRON_SECRET")
          ? status({
              id: "scheduler",
              requirement: "replaceable",
              state: "incomplete",
              missing: ["CRON_SECRET"],
              diagnostic:
                "Scheduler selected but CRON_SECRET is missing; cron routes remain inert.",
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
    github: optional(
      "github",
      githubMissing,
      "GitHub App integration is configured.",
      "GitHub integration is hidden because its configuration is absent or incomplete.",
    ),
    gitlab: optional(
      "gitlab",
      gitlabMissing,
      "GitLab OAuth integration is configured.",
      "GitLab integration is hidden because its configuration is absent or incomplete.",
    ),
  };
}
