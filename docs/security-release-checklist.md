# Security release checklist

**Version 2.0 — owner: minddy technical maintainers**

Every Cloud promotion and public core release needs a recorded security decision.
Review effort follows the change and its risk, not the number of releases. Reuse
valid evidence; a new release does not automatically require a new full audit or
pentest. A focused review provides less assurance than an independent pentest;
record that limitation accurately.

## Choose the review scope

| Change | Review and evidence | Escalation |
| --- | --- | --- |
| Documentation, version metadata, or a small change outside security controls | Review the diff, use existing CI, and reference the applicable prior report. | Expand the review if the diff changes runtime behavior, permissions, dependencies, or exposure. |
| Authentication paths, server transport, Storage, uploads, integrations, or deployment configuration | Review the affected controls and run the smallest relevant regression/configuration checks. Aim for a 15–30 minute focused review, reusing applicable evidence. | Record material uncertainty and escalate the affected area; a time budget is not a passing result. |
| Major trust-boundary redesign, incident, or a serious finding | Perform a deeper assessment of the affected surface and resolve blocking findings. | Require a pentest when the decision criteria below apply. |

The time budget is a planning target, not an assurance guarantee or permission to
ignore findings. Do not silently expand into repeated full audits. Group broader
reviews around major milestones and available resources, rather than every patch.
Existing CI and public image scan/signature/provenance gates still apply.

## Evidence record

A short addendum to an existing report is sufficient when it identifies:

1. The exact candidate SHA, previous production SHA, and changed surface.
2. The review scope, executor, checks performed, and their results. Keep reports
   private and omit credentials, personal data, and exploit-enabling detail.
3. Applicable control results: `OK` with current evidence, `OK — inherited` with
   the baseline reference and why it still applies, `N/A` with a reason, or
   `Exception <ID>` with an explicit risk decision. Do not present untested
   controls as passed or use age alone to establish equivalent coverage.
4. The pentest decision and rationale, residual risks, and any further work.
5. The named maintainer's decision for this candidate.

For a solo-maintained project, the maintainer may execute or use an assistant for
the review and approve the release. Record `Independent review: none (solo
maintainer)` when applicable; this is an allowed review mode, not a requirement to
find a second person. An assistant's checks do not constitute an independent
maintainer approval. Independent review is encouraged at significant milestones
when feasible. Protected GitHub environment approvals remain in place.

Recheck evidence when relevant code, dependencies, configuration, exposure, or
known threats change. A same-tree squash merge only needs an identity addendum;
do not repeat unchanged tests. Preserve historical reports and append a new
versioned decision when reassessing a release under this policy.

For non-interactive deployment, provide:

- `MINDDY_SECURITY_REVIEW_REF`;
- `MINDDY_RESIDUAL_RISKS` as `none` or `documented`;
- `MINDDY_PENTEST_STATUS` as `not-required` or `completed`.

## Controls to assess or carry forward

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

Select checks for the affected controls; this list is not a requirement to rerun
every command for every release. Dynamic checks use an authorized candidate
environment. Record redacted outcomes and distinguish fresh results, inherited
evidence, and unverified controls.

## Pentest decision

Touching an authentication or network file triggers a focused review, not an
automatic full pentest. Record `not-required` when the review reasonably covers
the changed surface with current or applicable prior evidence, no release blocker
remains, and the maintainer accepts the documented limitations. This status means
no pentest is required for this release; it never means one was performed.

Set `required-not-completed` and stop promotion when a focused review leaves
material high-impact uncertainty that needs a pentest, for example:

- a new or substantially redesigned authentication/authorization or tenant boundary;
- a material increase in public privileged-service exposure;
- an incident or serious finding whose scope or remediation remains uncertain.

A major change needs a deeper assessment even when no pentest is ultimately
required. Explain that decision; filenames, release frequency, or a small budget
alone cannot establish safety. Known exposed secrets, confirmed unauthorized
access or broken tenant isolation, and unresolved realistically exploitable
high/critical findings block publication regardless of review mode.

`completed` means a pentest report was received, blocking findings were corrected
and retested, and remaining findings are recorded. When one is still required,
the existing public-promotion rejection remains enforced. Do not relabel an
unfinished required assessment solely to pass the workflow.

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

- Checklist: 2.0
- Diff: <previous production SHA>..<candidate SHA>
- Candidate environment: <non-sensitive URL or identifier>
- Review scope: metadata | focused | deeper; <changed surface and rationale>
- Baseline: <reference and applicability, or none>
- Executor: <name>
- Independent review: <name/reference, or none (solo maintainer)>
- Maintainer/approver: <name>
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

- [ ] Applicable controls have current/inherited evidence or a justified exception.
- [ ] Uncertainty and assurance limitations are recorded; no release blocker remains.
- [ ] Every exception has an owner, deadline, compensating control, and approval.
- [ ] The pentest is not required or is complete with blocking findings retested.
- [ ] Promotion of this exact SHA is explicitly approved.
```

## References

This policy uses the risk-based approach of the [NIST SSDF](https://csrc.nist.gov/projects/ssdf)
and [OWASP SAMM Security Testing](https://owaspsamm.org/model/verification/security-testing/).
The review tiers and time budget above are Minddy project choices, not a claim of
certification or compliance with every control in those frameworks.
