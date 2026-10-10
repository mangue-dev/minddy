# MIN-676 code-agent model and thinking controls

Date: 2026-10-10. Reviewer: agent:/root. This is an agent source, language and
interface review; it is not human acceptance. Provider execution evidence is
recorded separately and Claude paid execution remains untested.

## Article brief and scope

Members need to choose the code worker's model and thinking independently of
Numo's conversation model and keep separate settings for OpenCode, Codex and
Claude Code. The applicable build is the 0.11.1 candidate with restricted native
subscription access. No public rollout, production deployment or remote database
migration is claimed.

Affected articles in all six locales: `ai-settings-and-usage` revision 12
(workflows `A04`, `A08`, `A10`), `code-work` revision 7 (`N03`, `N04`) and
`numo` revision 9 (`N01`, `N02`, `T05`, `N08`, `N05`). Existing fragments,
provider-funding explanations and hosted-auth availability conditions remain.

## Sources and behavior

- [Codex app-server](https://learn.chatgpt.com/docs/app-server) documents
  `model/list`, per-model `supportedReasoningEfforts`, explicit `thread/start`
  model/configuration and native authentication renewal. A returned catalog is
  not proof that the subscription permits successful inference for every entry.
- [Claude model configuration](https://code.claude.com/docs/en/model-config)
  documents the moving `sonnet`, `opus` and `haiku` aliases. These avoid an
  OpenRouter API catalog and follow the installed native CLI. No live Claude
  account eligibility is inferred from the alias list.
- [Claude CLI reference](https://code.claude.com/docs/en/cli-reference) documents
  `--model` and `--effort`. The UI does not offer Fable or `best`, which may
  require separately billed usage credits.

Model and thinking preferences are engine-scoped and atomically merged. Changing
models resets thinking to automatic; an unsupported saved model is shown rather
than silently replaced. Catalog refresh uses exclusive native credential custody,
profile write-back and physical sandbox cleanup. Existing workers retain their
recorded model and effort on resume. Native selections never trigger API fallback.
OpenCode retains its provider-specific API catalog and controls. Models and
thinking controls live in the code-agent group beside connection and sandbox
settings; general Minddy AI funding remains separate.

## Language and figures

Reviewed the complete additions in `en`, `fr`, `de`, `es`, `it` and `pt-BR` for
matching procedures, automatic defaults, model-change reset, catalog limitations
and frozen resume behavior. UI labels are localized in the same six languages.
No independent human translation acceptance is claimed. Retained provider and
usage screenshots still depict unchanged individual controls. New settings
captures are internal review evidence under `docs/validation/assets/`; their
actual inspection and capture details are recorded with validation outcomes.

## Verification

The parent task records final behavior tests, local Docker SQL, builds, lint,
typecheck, documentation, knowledge, English and whitespace results after the
combined changes. Metadata checks alone do not establish provider authorization,
real expired-token recovery, remote revocation or paid Claude acceptance.

Actual combined checks passed: 319 focused tests across 27 files, five native SQL
suites in Docker with rollback, typecheck, repository lint, both VM builds,
encrypted-access/schema checks, documentation including release mode, knowledge,
owned-English and whitespace checks. No platform release was performed.

Inspected the actual logged-in French settings in the existing dark browser
viewport (584 × 809). Codex catalog refresh showed eight current model entries;
selecting `gpt-6.1-sol` and `medium` saved successfully. Claude aliases and effort
saved without login or inference. OpenCode retained its active-provider model
catalog and reasoning picker. Returning to Codex preserved its selected model
and effort. Internal captures: `min-676-native-model-codex.png` and
`min-676-native-model-claude-untested.png` under `docs/validation/assets/`.

Real scoped provider revocation, official user approval in settings, and two
cold Codex workers succeeded. Details are in
`docs/validation/assets/min-676-reconnect-model-proof.json`. Natural expiration
was not tested: the authentic token was still valid and no expired snapshot was
available. These precise boundaries supersede earlier public wording that no
real renewal had been observed; provider permission and natural expiry recovery
remain separate acceptance conditions.
