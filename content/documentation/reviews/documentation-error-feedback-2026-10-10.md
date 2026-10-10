# Documentation error feedback review, 2026-10-10

Reviewer: agent:/root. This is agent review, not human reader acceptance.

## Scope and evidence

The instance-configuration guide gains the complete operator setup and reader
reporting behavior in en, fr, de, es, it and pt-BR, revision 5, workflow H05.
The existing sections, workflows H08/H09 and figures are retained unchanged;
this change does not rerun their prior installation or provider procedures.
The figure review revisions advance with the article as required by the
publication contract; their assets, captions and original capture dates remain
unchanged. Retained figures: optional-providers-flow and
proxy-network-and-jobs-flow.

Source evidence: `.env.example`, `components/documentation/report-error.tsx`,
`components/product-feedback-dialog.tsx`, `app/api/product-feedback/route.ts`,
`lib/runtime-config.ts` and the integration objective behavior from MIN-670.
The public endpoint uses the dedicated integration's default objective; a
browser-supplied objective cannot choose the report's destination.

The requested reader flow was confirmed by the owner: login returns to the
same article and opens the shared feedback modal. Both editable fields start
empty. The server adds article metadata after submission so readers cannot
erase it in the form. Public metadata is resolved from the published catalog;
private URLs, queries and account settings are not copied into the report.

The six additions were read for configuration, authentication, empty fields,
server context, objective inheritance, missing-key behavior and retained meaning.
German, Spanish, Italian and Portuguese use the generic localized feedback
term where the exact app action label is not needed. Documentation is the
owner's objective name, preserved as a proper name. No figure is changed:
the feedback form is the existing shared component, and the short setup
procedure is complete in text.

## Verification

- Focused reporting, documentation session, server route and runtime configuration
  tests pass (27 tests); including public catalog regressions, 86 tests pass. Authentication rejection, unsupported/private article
  IDs, missing documentation configuration, separate routing, hidden context,
  empty form fields and resume-flag consumption are covered.
- Typecheck and targeted lint pass. Documentation and release documentation
  checks publish 252 locale articles with 92/92 workflows covered. Knowledge,
  owned English and whitespace checks pass.
- A real local browser loaded the French guide on desktop and a 390-pixel phone
  viewport. The shared modal opens with empty fields, complete translations and
  no article metadata in its controls; mobile has no horizontal overflow.
  The browser uses a synthetic authenticated session and blocks external calls
  and business writes. It does not verify a real sign-in or create a feedback
  post. The actual authenticated endpoint is verified by the route tests.
- Browser review caught missing Nav/Dictate namespaces in the documentation
  layout; both are now provided, and the corrected captures were inspected.
  PR screenshots are under docs/validation/documentation-feedback/.
- The dedicated live integration was created and its same-project Documentation
  objective verified. Its key is configured locally and for the next production
  deployment. The preview environment is configured for this PR branch. Secrets
  are excluded from source control and public runtime configuration. No
  application deployment or migration is part of this change.
