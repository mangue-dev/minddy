# MIN-676 guided code-agent connection

Date: 2026-10-11. Reviewer: agent:/root. Source, language and local fixture UI
review; no human acceptance or new provider authentication is claimed.

Account members need a clear distinction between preparation, official browser
approval and confirmation. Reviewed `ai-settings-and-usage`, revision/source
revision 15 in all six locales, workflow A04. The existing routing and billing
figures remain accurate and retain their actual review and capture dates.

Sources: `components/settings/native-agent-login-wizard.tsx`,
`native-agent-connections.tsx`, their connection behavior tests and the shared
`WizardDialog`. The wizard starts only after an explicit action. It uses strict
provider URL validation, exact code copying, masked Claude return-code entry,
automatic completion, bounded polling and cancellation of late login responses.
Its portal content carries analytics/session-replay masking independently of
its settings parent. Cancellation refreshes metadata after cleanup.

The Codex workflow has three steps; Claude adds return-code entry and retains
its experimental warning. No hosting authorization restriction, backend
credential protocol, database schema or sandbox persistence contract changes.
The preparation step explains that Numo retains its own provider and model.

Local visual verification uses the production component with a temporary,
fixture-only transport: `DEMO-12345` is not a real approval code. No native API
calls, account changes, credential reads or paid Claude execution are involved.
The preview route is removed before committing. Screenshots under
`docs/validation/assets/min-676-login-*.jpg` are review evidence, not public
manual figures. Verification results follow after actual checks.

Verified 1280 × 720 desktop, 390 × 844 mobile and 320 × 740 mobile views.
The full code stays on one line and neither mobile view overflows horizontally.
The copy action returned the exact fixture code and showed success feedback.
The Claude return-code step uses a password field and disables completion while
empty; this is fixture validation, not live Claude authentication.

Verification passed: 18 connection behavior tests; 10,830 full-suite Vitest tests
with 113 intentional skips; lint, typecheck, documentation (including release
mode), knowledge, owned-English and whitespace checks. The temporary preview
page and settings hook were removed; application route inventory and metadata
checks passed again in the final suite. No database, provider credential,
production rollout or deployment changes were performed.
