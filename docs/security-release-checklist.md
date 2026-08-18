# Security checklist before going into production

**Version: 1.0 — owner: minddy technical team**

This checklist is a mandatory barrier before any promotion of Minddy
Cloud. A release of the heart already goes through this promotion and therefore reuses the
same proof. It complements CI, code review and periodic audits;
it never replaces a pentest when the risk of the launch requires it.

## Execution mode

1. Determine the candidate SHA. For a core release, run `npm run deploy`
   and let it prepare the release commit; for a web deployment alone,
   use the own `HEAD` displayed by the script. Deployment shows SHA
   correct before requesting the review. From this SHA, copy the
   [report template](#report-template) in a private issue or
   in `mangue-dev/minddy-cloud-ops`. Never stick a secret, token,
   real personal data or detail facilitating exploitation. The
   stable reference of this report will be requested by the deployment.
2. List the diff from `production`, its migrations and its endpoints
   sensitive. Run all checks below; register for each
   `OK`, `N/A` with proof, or `Exception <ID>`, with proof no
   sensitive (command, CI run, configuration capture or ticket).
3. Have the report reread by a maintainer who did not carry out all of them alone
   the controls. Any exception must have an owner, a deadline and
   explicit acceptance of risk before promotion.
4. Decide if a pentest is required with the criteria below. A pentest
   required but unfinished blocks promotion; an exception cannot
   transform into a simple checklist check.
5. Continue `npm run deploy` giving the reference and the two decisions.
   For a non-interactive web deployment where the SHA is already known, provide
   `MINDDY_SECURITY_REVIEW_REF`, `MINDDY_RESIDUAL_RISKS` (`none` or
   `documented`) and `MINDDY_PENTEST_STATUS` (`not-required` or `completed`). The
   workflow also validates the `1.0` version of this checklist before requesting
   approval of the `cloud-production` environment.

The tests and searches below start from the root of the repository. Replace
`<BASE_SHA>` by `origin/production` and `<CANDIDATE_URL>` by HTTPS URL
complete candidate or staging deployment. The checks of
configuration outside the depot must be dated in the proof.

## Mandatory checks

| ID | Control | How to check | Expected result / proof |
| --- | --- | --- | --- |
| HTTP-1 | HTTPS and HSTS | `curl -sS -D - -o /dev/null <CANDIDATE_URL>` then inspect `next.config.mjs` and the HTTP→HTTPS redirection of the host. | Error-free HTTPS; HTTP redirect; `Strict-Transport-Security` with `max-age` of at least one year and `includeSubDomains`. The presence of `preload` does not constitute registration in the preload list, a separate and almost irreversible decision. |
| HTTP-2 | Browser headers | On public, authenticated, error and API pages: `curl -sS -D - -o /dev/null …`. Also check for exceptions in `next.config.mjs`. | Consistent CSP (`frame-ancestors`, `base-uri`, `form-action` depending on the route), `X-Content-Type-Options: nosniff`, anti-framing protection, `Referrer-Policy` and `Permissions-Policy`. Any route exception is justified and tested. |
| HTTP-3 | Cache and sensitive content | Review the new `GET`, `Cache-Control`, `revalidate`, `force-static`, `use cache` and CDN behavior with two accounts. | No authenticated responses or personal data in a shared cache; sensitive responses `private`/`no-store`; MIME types and non-executable downloads. |
| REQ-1 | CSRF | Inventory `POST`, `PUT`, `PATCH`, `DELETE` of diff: `git diff --name-only <BASE_SHA> -- app \| rg '/route\.ts$'`. For each cookie route, check CSRF token or strict validation `Origin`/`Host`/application header and make a negative cross-origin call. | Legitimate request accepted, cross-origin request refused. `SameSite` remains an additional defense, never the only justification. Signed public endpoints (webhooks/OAuth) have their own control. |
| REQ-2 | CORS | `rg -n 'Access-Control-Allow|cors|OPTIONS' app lib next.config.mjs` then test authorized and unauthorized preflights. | CORS absent by default. Minimal origins, methods and headers where required; never reflective origin or `*` with credentials. A public OAuth endpoint in `*` does not receive any cookies and remains explicitly documented. |
| SESS-1 | Cookies, sessions and tokens | Inspect `lib/session-cookies.ts`, other `cookies.set`, Auth Supabase configuration and login/logout/refresh flows. Check the candidate's `Set-Cookie` without recording their value. | Session cookies `Secure` in production and `SameSite=Lax`/`Strict` depending on the flow; `HttpOnly` when the architecture allows it. The documented exception for cookies read by `@supabase/ssr` is not expanded. Bounded expiration and rotation of active refresh tokens. |
| SESS-2 | Invalidation and replay | Test logout, password change/reset, administrative revocation and refresh token rotation on a test account. | The old token or cookie does not restore a session after the intended event; replay of a rotated refresh token fails; no lasting privileged session without justification. |
| DB-1 | RLS of all tables | Review each migration of the diff, then `npx vitest run lib/schema-guardrails.test.ts` and negative tests with two users/projects. | RLS activated upon creation; policies limited to `authenticated`/`service_role`, inter-project separation demonstrated, no policy `anon` or always true condition introduced. |
| DB-2 | Permissions, Views and Columns | Review `GRANT`/`REVOKE`, views, `SECURITY DEFINER` functions, Storage buckets and PostgREST access. Test directly with anon/auth test keys. | Minimum privilege; encrypted/secret columns not selectable; `search_path` safe for privileged functions; private buckets by default, public formats served without active content. |
| DB-3 | Service-role bypasses | `git diff <BASE_SHA> -- 'app/**' 'lib/server/**' \| rg -n 'service\|admin\|supabaseService'` and trace each customer-provided identifier back to their access control. | Each read/write that bypasses RLS explicitly redoes authentication, per-resource authorization, and input validation before privileged invocation. |
| DATA-1 | API Keys and Secrets | `git diff <BASE_SHA>`, GitHub secret scanning, `rg -n 'NEXT_PUBLIC_|API_KEY|SECRET|TOKEN' app components lib public .env.example` and review of Vercel/Supabase variables without displaying their values. | No secrets in Git, client bundle, URL, capture, artifact or log. Only explicitly public keys carry `NEXT_PUBLIC_`; private keys encrypted at rest, hidden from reading, with minimum range and rotatable. |
| DATA-2 | Personal data | Map new data, exports, analytics, logs, backups and subcontractors; check `docs/rgpd/` and retention/deletion policies. | Minimum collection and documented purpose; limited access and retention; deletion/export tested; no real personal data in CI, previews, logs or security reports. |
| AUTH-1 | Password Policy | `npx vitest run lib/password-policy.test.ts lib/signup-wizard.test.ts`, then check that the instance's Supabase policy is not weaker than the UI. | Agreed length/complexity enforced server-side, compromised passwords denied if option available, messages without account leaks. |
| AUTH-2 | MFA | Review changes in administration, billing, keys and identities; test registration, challenge, recovery and MFA deactivation. | MFA required for defined high risk roles/operations; secrets and recovery codes not logged, single use verified. If MFA is not applicable, justification entered. |
| API-1 | Sensitive Endpoints | Inventory auth, invitations, exports, uploads, webhooks, OAuth, IA, billing, admin actions and new diff routes. Test without session, with other tenant, invalid input, excessive size and excessive flow. | Authentication and authorization server failed closed, schema and bounds validated at runtime, rate limit on abusive operations, errors without internal details. Webhooks use the raw body signature; Outgoing fetches include protocol, host, redirects and private IPs. |
| SUPPLY-1 | Dependencies and Build Chain | Check `CI / Tests & typecheck`, `CI / Dependency audit` jobs, frozen installation and Dependabot/secret scanning alerts. | Green candidate SHA, consistent lockfiles, no unaccepted high/critical vulnerabilities, no new build steps with secrecy or unjustified write permission. |
| OPS-1 | Configuration and rollback | Compare Vercel, Supabase and GitHub variables/permissions to their reference; check migration, restorable backup, observability and rollback procedure in `docs/releases.md`. | Revised configuration without exposing any value; migration-compatible backup and rollback; alerts and incident owner identified. |

## Pentest decision

Mark the pentest `required-not-completed` and stop the release if at least one
of the following cases is not already covered by a recent pentest at the perimeter
equivalent:

- new authentication, authorization, MFA, session or OAuth mechanism;
- significant change of RLS, multi-tenant, `service_role`, public storage or
  exposure of personal data;
- new high-impact surface: payment, active upload, webhook, import,
  code/agent execution, preferred third-party integration or administration;
- change of infrastructure, network boundary or major launch with a
  significantly higher volume/exposure;
- new threat, recent incident, or high/critical observation whose exploitation
  realistic cannot be excluded by testing and internal review.

The scope, date, service provider, report and status of corrections
of the pentest are referenced in the report, without publishing the details
sensitive. `completed` means that the report is received, the blocking findings
are corrected and retested, and the rest are recorded as residual risks.

## Exceptions and residual risks

One line is required per non-`OK` control. An exception without deadline,
compensatory measure or approver blocks production.

| ID | Control | Gap and justification | Impact / probability | Compensatory measure | Owner | Deadline | Approver |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EX-… | … | … | … | … | … | YYYY-MM-DD | … |

The status transmitted to the workflow is `none` if this table is empty, otherwise
`documented`. An exception cannot cover an exposed secret, a separation
broken multi-tenant, an exploitable high/critical vulnerability or a pentest
required but unfinished.

## Report template

```markdown
# Release security review — <date> — <SHA>

- Checklist: 1.0 (`docs/security-release-checklist.md` at SHA `<SHA>`)
- Diff: `<previous production>..<SHA>`
- Verified candidate/staging: <URL or non-sensitive identifier>
- Executor: <name> — Reviewer/approver: <name>
- Pentest : not-required | completed | required-not-completed
- Pentest reference and justification: <reference or justification>
- Residual risks: none | documented

| ID | Result | Non-sensitive evidence / note |
| --- | --- | --- |
| HTTP-1 | OK | … |
| … | … | … |

## Exceptions and residual risks

<copy the required table above, or write “None”>

## Verdict

- [ ] Every control has a result and evidence.
- [ ] Exceptions have an owner, deadline, and approval.
- [ ] The pentest is not required, or it is complete and its blocking findings have been retested.
- [ ] Promotion of this SHA is explicitly approved.
```
