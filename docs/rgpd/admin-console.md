# Admin console data review (MIN-637)

The console supports account assistance, billing, operational reporting and model configuration. It does not need a directory of individual activity or personal content. This review implements data minimisation; it is not a legal certification of the service.

## Data and purpose

| View | Data reaching the browser | Purpose and limits |
| --- | --- | --- |
| Overview | Aggregate account/activity/content totals, daily counts, plan distribution, onboarding funnel | Operational reporting. No account identities, metadata or individual activity timestamps are returned. Small counts are still restricted to admins; aggregates are not guaranteed anonymous. |
| Account lookup | One account ID, display name, exact email, email-confirmation flag, internal flag | Identify the account for a support or billing request. Exact-address lookup must be submitted explicitly. No browse-all, partial-name or wildcard search. The address is sent in a POST body, outside access-log URLs. |
| Open account | Effective plan/source, subscription status, active gift note/expiry, current budget, counted spend, calendar-month spend and reset register | Resolve billing and budget issues. Loaded only when support opens the account. Reset timestamps describe support actions. No sign-in/activity history, onboarding progress, project/issue counts, profile metadata or content. |
| Finances | Revenue/cost aggregates and a bounded recent-run cost ledger with technical call details | Reconcile spending and diagnose cost anomalies. Opaque run/call/provider IDs and exact timestamps remain pseudonymous data, not anonymous data. No user email, project IDs, prompts, messages or issue bodies are returned by these RPCs. |
| Models | Instance model configuration and provider catalogs | Operate the service. Catalog requests may use the requesting admin's own BYOK credentials server-side; no other account's keys are read by the overview or account screens. |

The retired Jev quality screen and API, and the unused billing GET lookup accepting emails in URLs, are removed. Runtime decision logic, evaluation collection and existing stored records are outside this change.

## Technical controls

- The admin layout and every admin API retain the live `isAdminUser` authorization check: role/allowlist, live session, verified MFA and current account state. Successful authorization is not cached.
- `get_admin_account` and `get_admin_onboarding_signals` are executable only by `service_role`. The previous `get_admin_users_overview` profile-directory RPC is dropped.
- Overview onboarding scans use stable bounded pages, five allowlisted metadata keys and project/issue existence signals. The shared TypeScript resolver preserves current and historical onboarding rules. User IDs remain server-side for excluding internal/deleted billing accounts; no names, emails or full metadata are read for that scan.
- Account search performs no billing or usage work. Opening one account performs only its billing/quota reads. Failed reads return errors rather than an invented default plan or zero balance.
- Account, quota, overview and finance reads return `Cache-Control: private, no-store`. Account results live in component memory, outside the persistent query cache. Clearing/editing a lookup or leaving the tab retires results and pending reads.
- Tabs are imported on demand. The overview no longer requests Jev metrics or scans BYOK account IDs.

## Organisational obligations

The controller must document the appropriate Article 6 legal basis for each support, billing and reporting purpose; an admin role alone is not a legal basis. Keep the privacy notice and processing register aligned with these uses, the recipients and applicable retention periods. Limit admin assignment to staff whose duties require these purposes, review access regularly, and revoke access when duties change. Support access should be tied to an actual request or documented operational need.

This change adds no access-audit store or new retention policy. Review existing administrative audit coverage, log access/retention, Stripe/provider identifiers, support-note contents, erasure procedures and retention of AI usage/evaluation records as part of the controller's ongoing compliance process. Notes should contain only the operational reason for the gift, never unrelated personal or sensitive information. No production migration or historical deletion is performed by this PR.

## Sources

- [GDPR, Articles 5, 6 and 25](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng): purpose limitation, minimisation, lawful basis and protection by default.
- [CNIL: data minimisation](https://www.cnil.fr/fr/definition/minimisation).
- [CNIL: managing access permissions](https://www.cnil.fr/fr/securite-gerer-les-habilitations).
- [CNIL: informing people and transparency](https://cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence).
