# Admin console data review (MIN-637)

The console supports account assistance, billing, operational reporting and model configuration. It does not need a directory of individual activity or personal content. This review implements data minimisation; it is not a legal certification of the service.

## Data and purpose

| View | Data reaching the browser | Purpose and limits |
| --- | --- | --- |
| Accounts | The number of accounts, counted by GoTrue without listing them | Size the instance. Activity, sign-up, onboarding, plan-distribution and content figures were removed (MIN-829). |
| Account lookup | One account ID, display name, exact email, email-confirmation flag | Identify the account for a support or billing request. Exact-address lookup must be submitted explicitly. No browse-all, partial-name or wildcard search. The address is sent in a POST body, outside access-log URLs. |
| Open account | Effective plan/source, subscription status, active gift note/expiry, current budget, counted spend, calendar-month spend and reset register | Resolve billing and budget issues. Loaded only when support opens the account. Reset timestamps describe support actions. No sign-in/activity history, onboarding progress, project/issue counts, profile metadata or content. |
| Costs | AI cost aggregates, the platform key's cap and a bounded recent-run cost ledger with technical call details | Track spending and diagnose cost anomalies. Opaque run/call/provider IDs and exact timestamps remain pseudonymous data, not anonymous data. No user email, project IDs, prompts, messages or issue bodies are returned by these RPCs. Stripe revenue is no longer read (MIN-829). |
| Models | Instance model configuration and provider catalogs; a configuration export file | Operate the service. Catalog requests may use the requesting admin's own BYOK credentials server-side; no other account's keys are read by the account screens. The export file carries model ids and settings only, no key or account. |
| Instance variables | Allowlisted instance variables (provider keys, administrator addresses, email senders, forge apps, analytics, site identity): source, non-secret values, the last characters of secrets, and a per-variable history naming the administrator who changed it | Configure a self-hosted instance from the dashboard (MIN-847). Only where the environment file sets `MINDDY_CONFIG_OVERRIDES=1`, never on Minddy Cloud. Secrets never reach the browser. Each change notifies the other administrators listed before and after it or named by role in their inbox, and every administrator, the author included, by email when the instance sends email; an unchanged value records nothing; the history keeps the last ten versions. |
| Numo admin tools | The same account lookup, account details, cost aggregates and model configuration as above, read by Numo in the administrator's conversation | Let an administrator do the same support and configuration tasks by asking Numo (MIN-829). Granted only to a chat turn admitted from a session passing `isAdminUser`, re-verified before every call. Tool results enter that administrator's conversation history and its AI provider request, like any Numo answer; they carry no activity, project or content of the other account. |

The retired Jev quality screen and API, and the unused billing GET lookup accepting emails in URLs, are removed. Runtime decision logic, evaluation collection and existing stored records are outside this change.

## Technical controls

- The admin layout and every admin API retain the live `isAdminUser` authorization check: role/allowlist, live session, verified MFA and current account state. Successful authorization is not cached.
- `get_admin_account` and `get_admin_onboarding_signals` are executable only by `service_role`. The previous `get_admin_users_overview` profile-directory RPC is dropped. Since MIN-829 the console no longer calls `get_admin_onboarding_signals` or `get_admin_user_totals`; they stay in the schema for the previous release and can be dropped once no deployed code reads them.
- The internal-account flag (`app_metadata.internal`) is no longer read or written by the console; existing values are left in place and have no effect.
- Account search performs no billing or usage work. Opening one account performs only its billing/quota reads. Failed reads return errors rather than an invented default plan or zero balance.
- Account, quota, overview and finance reads return `Cache-Control: private, no-store`. Account results live in component memory, outside the persistent query cache. Clearing/editing a lookup or leaving the tab retires results and pending reads.
- Tabs are imported on demand. The Accounts tab requests one account count and nothing per account until a lookup.

## Organisational obligations

The controller must document the appropriate Article 6 legal basis for each support, billing and reporting purpose; an admin role alone is not a legal basis. Keep the privacy notice and processing register aligned with these uses, the recipients and applicable retention periods. Limit admin assignment to staff whose duties require these purposes, review access regularly, and revoke access when duties change. Support access should be tied to an actual request or documented operational need.

This change adds no access-audit store or new retention policy. Review existing administrative audit coverage, log access/retention, Stripe/provider identifiers, support-note contents, erasure procedures and retention of AI usage/evaluation records as part of the controller's ongoing compliance process. Notes should contain only the operational reason for the gift, never unrelated personal or sensitive information. No production migration or historical deletion is performed by this PR.

## Sources

- [GDPR, Articles 5, 6 and 25](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng): purpose limitation, minimisation, lawful basis and protection by default.
- [CNIL: data minimisation](https://www.cnil.fr/fr/definition/minimisation).
- [CNIL: managing access permissions](https://www.cnil.fr/fr/securite-gerer-les-habilitations).
- [CNIL: informing people and transparency](https://cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence).
