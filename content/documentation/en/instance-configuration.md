---
{
  "id": "instance-configuration",
  "locale": "en",
  "title": "Configure instance origins, secrets and capabilities",
  "summary": "Set MINDDY_PUBLIC_APP_URL to one absolute origin with no path or trailing slash.",
  "topic": "Operate an instance",
  "type": "reference",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "optional-providers",
    "workspace-encryption",
    "authentication-and-email"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Required and public settings {#instance-configuration}

Set MINDDY_PUBLIC_APP_URL to one absolute origin with no path or trailing slash. Public deployments use HTTPS; trusted private IPv4 and localhost installations may use HTTP. Set MINDDY_PUBLIC_SUPABASE_URL and MINDDY_PUBLIC_SUPABASE_ANON_KEY to the same selected Supabase stack. These values reach the browser. SUPABASE_SERVICE_ROLE_KEY is server-only and required in production. Never put it in a public variable or client bundle. A database URL is a tooling connection and does not replace the API configuration.

## Preserve generated secrets {#secrets}

The installer writes missing GIT_STATE_SECRET, GIT_TOKEN_ENCRYPTION_SECRET, AI_KEY_ENCRYPTION_SECRET, FEEDBACK_SSO_ENCRYPTION_SECRET, MINDDY_DATA_ROOT_KEY, CRON_SECRET and AGENT_RUNNER_SECRET. The content root must contain exactly 64 hexadecimal characters. Keep it outside PostgreSQL with a protected recovery copy. Keep the entire environment mode 0600 and out of Git. Do not source the environment as shell code or print it. Retrying installation does not rotate secrets. Losing encryption secrets can make existing data unreadable; deliberate rotation requires the matching recovery procedure.

## Apply and check a change {#capabilities}

MINDDY_PUBLIC_SITE_NAME and MINDDY_PUBLIC_CONTACT_EMAIL identify your instance. ADMIN_EMAILS is a comma-separated administrator allowlist; privileged access also requires MFA. OAUTH_ISSUER normally stays empty unless you intentionally advertise OAuth at another stable origin. Leave managed AI and billing disabled for self-hosting. Enable optional services only with their complete required configuration. Restart or recreate the application after changing runtime public values; the OCI image needs no rebuild. Run the doctor to distinguish incomplete capabilities from core failures, then test generated account links and callbacks against the intended origin.
