# MIN-676 private native preview documentation review

Date: 2026-10-10. Reviewer: agent:/root/native_hosting_terms. Agent review,
not human reader acceptance or an authenticated native provider rehearsal.

## Scope and evidence

Article `ai-settings-and-usage`, revision 8 in all six locales, retains workflows
A04, A08 and A10. The added `native-agent-preview` section describes the
allowlisted account controls, provider approval/code flow, cancellation,
two-allocation test, renewal evidence, disconnection and the boundary with
normal Numo launches. The reader is an account owner invited to the private
prototype; this is not a general subscription feature announcement.

Evidence: `components/settings/native-agent-connections.tsx`, its focused UI
tests, `lib/native-agent-prototype-api.ts` and all six localized message sets.
The UI hides the panel when the account endpoint returns `enabled: false`.
It does not write normal agent preferences. Native errors are reduced to
allowlisted translated recovery messages; raw native errors are not displayed.
The guide describes expected controls and result interpretation, not an
authenticated provider outcome. Authentication renewal remains explicitly
unverified when a completed test reports `refreshObserved: false`.

All six additions were reviewed for complete equivalent meaning, exact action
labels, account eligibility, provider-owned login, renewal limitations,
disconnection versus subscription cancellation and unchanged Numo selection.
Prior procedures and operational evidence are retained without a rerun.
Figures `ai-keys-and-models-workflow`,
`ai-keys-and-models-defaults-workflow` and `plans-and-ai-usage-workflow` retain
their original assets, framing, captions and capture dates. Their revision
markers advance with the guide. They illustrate the unchanged regular controls,
not the private preview. The short conditional login/test instructions are
complete in text; no preview screenshot or provider login capture was added.

## Verification

- The two focused UI/client suites pass, eight tests covering disabled
  visibility, native approval hosts, raw-error exclusion, pending-login
  cancellation on unmount, failure recovery and unobserved renewal.
- Targeted lint and the owned-English check pass. Translation keys and all
  interpolation placeholders match across en, fr, de, es, it and pt-BR.
- No native sign-in, token renewal, hosted inference or account deletion was
  exercised by these tests.
- Documentation checks validate 252 locale articles and 92/92 workflows.
  Knowledge, owned-English and whitespace checks pass after the additions.
  The parent task repeats the relevant checks for the final combined change.
