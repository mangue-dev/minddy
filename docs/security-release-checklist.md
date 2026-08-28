# Security release checklist

**Version 1.0 — owner: minddy technical maintainers**

This checklist is a mandatory promotion barrier for Minddy Cloud and public
core releases. It complements CI, review, and periodic audits. It never replaces
a penetration test when the release risk requires one.

## Evidence record

1. Record the exact candidate SHA and the previous production SHA.
2. Create a private report from the template below. Never include a credential,
   personal data, or exploit-enabling detail.
3. Give every control an `OK`, `N/A`, or `Exception <ID>` result with a
   non-sensitive evidence reference.
4. Require review by a maintainer who did not perform every control alone.
5. Record the pentest decision and residual-risk status.
6. Pass the stable report reference to the release workflow.

For non-interactive deployment, provide:

- `MINDDY_SECURITY_REVIEW_REF`;
- `MINDDY_RESIDUAL_RISKS` as `none` or `documented`;
- `MINDDY_PENTEST_STATUS` as `not-required` or `completed`.

## Mandatory controls

| ID | Control | Required result |
| --- | --- | --- |
| HTTP-1 | HTTPS and HSTS | HTTPS succeeds, HTTP redirects, and HSTS uses at least one year with `includeSubDomains`. HSTS preload is a separate decision. |
| HTTP-2 | Browser headers | Public, authenticated, error, and API responses consistently apply the documented CSP, anti-framing, MIME, referrer, and permissions policies. |
| HTTP-3 | Sensitive caching | Authenticated or personal responses are never stored in a shared cache; sensitive responses use `private` or `no-store`. |
| REQ-1 | CSRF | Every cookie-authenticated state change validates origin or an equivalent anti-CSRF signal; negative cross-origin requests fail. |
| REQ-2 | CORS | CORS is absent by default and narrowly scoped where required. Credentials never combine with a wildcard origin. |
| SESS-1 | Cookies and tokens | Production cookie attributes, bounded expiration, token rotation, and logout behavior match the documented session model. |
| SESS-2 | Invalidation | Logout, password reset/change, administrative revocation, and refresh-token rotation invalidate the intended prior credentials. |
| DB-1 | RLS | Every application table enables RLS; policies enforce tenant boundaries; two-account negative tests pass. |
| DB-2 | Database privileges | Grants, views, privileged functions, columns, and Storage policies follow least privilege. Sensitive columns are not directly readable. |
| DB-3 | Service-role access | Every customer-controlled identifier is reauthorized before a service-role read or write. |
| DATA-1 | Secrets | Git history, client bundles, URLs, captures, artifacts, and logs contain no operational secret. Runtime secrets are scoped and rotatable. |
| DATA-2 | Personal data | Collection, purpose, access, retention, export, deletion, analytics, logs, backups, and subprocessors match the documented policy. |
| AUTH-1 | Password policy | Server configuration is not weaker than the UI policy; compromised-password protection is enabled when available. |
| AUTH-2 | MFA | High-risk roles and operations use the agreed MFA policy; enrollment, challenge, recovery, and removal are tested. |
| API-1 | Sensitive endpoints | Authentication, tenant authorization, runtime validation, size limits, rate limits, webhook signatures, and SSRF controls fail closed. |
| SUPPLY-1 | Dependencies and build chain | Lockfiles are consistent; builds are frozen; no unaccepted high/critical finding or unjustified workflow permission remains. |
| OPS-1 | Configuration and rollback | Runtime configuration, migrations, backup restoration, observability, incident ownership, and rollback are verified. |

Suggested repository checks:

```bash
npm run check:public-repo
npm run check:public-repo:remote
npm run check:workflow-action-pins
npm run lint
npm run typecheck
npm test
npm run test:release
npm audit --omit=dev --audit-level=high
```

Live HTTP, session, tenant, database, and configuration controls must be tested
against an authorized candidate environment. Record only redacted outcomes.

## Pentest decision

Set the pentest status to `required-not-completed` and stop promotion when an
equivalent recent pentest does not cover any of these changes:

- authentication, authorization, MFA, sessions, or OAuth;
- RLS, multi-tenancy, service-role access, public Storage, or personal-data
  exposure;
- payments, active uploads, webhooks, imports, agent execution, privileged
  integrations, or administration;
- a major infrastructure/network boundary or exposure increase;
- a new threat, incident, or realistic high/critical finding.

`completed` means the report was received, blocking findings were corrected
and retested, and remaining findings are documented as residual risks.

## Exceptions and residual risks

Each exception requires an owner, deadline, compensating control, and explicit
approval. An exception cannot waive an exposed secret, broken tenant boundary,
realistically exploitable high/critical vulnerability, or required unfinished
pentest.

| ID | Control | Gap and justification | Impact and likelihood | Compensating control | Owner | Deadline | Approver |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EX-… | … | … | … | … | … | YYYY-MM-DD | … |

Use `none` when this table is empty and `documented` otherwise.

## Report template

```markdown
# Release security review — <date> — <candidate SHA>

- Checklist: 1.0
- Diff: <previous production SHA>..<candidate SHA>
- Candidate environment: <non-sensitive URL or identifier>
- Executor: <name>
- Reviewer/approver: <name>
- Pentest: not-required | completed | required-not-completed
- Pentest reference and rationale: <reference>
- Residual risks: none | documented

| ID | Result | Non-sensitive evidence |
| --- | --- | --- |
| HTTP-1 | OK | … |
| … | … | … |

## Exceptions and residual risks

None

## Verdict

- [ ] Every control has a result and evidence.
- [ ] Every exception has an owner, deadline, compensating control, and approval.
- [ ] The pentest is not required or is complete with blocking findings retested.
- [ ] Promotion of this exact SHA is explicitly approved.
```
