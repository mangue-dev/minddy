# MIN-676 account AI organization and hosted-authentication review

Date: 2026-10-10. Reviewer: agent:/root. This is a source, interface and
six-locale language review, not human reader acceptance or a new provider run.
Paid Claude Code execution remains untested.

## Article brief

Members need to distinguish the API provider used by Numo and other Minddy AI
features from the code harness and its funding. They also need to find sandbox
settings beside the code agent, select a native agent before connecting, and
understand actual availability without relying on presentation badges.

Affected articles in all six locales: `ai-settings-and-usage` revision 11
(workflows `A04`, `A08`, `A10`), `code-work` revision 6 (`N03`, `N04`) and
`numo` revision 8 (`N01`, `N02`, `T05`, `N08`, `N05`). Existing semantic
fragments, including `native-agent-preview`, are retained for compatibility.
Applicability is the 0.11.1 candidate with restricted native access. No public
rollout, production deployment or remote database migration is claimed.

## Source and provider review

Reviewed `components/settings/account-ai-keys-section.tsx`,
`native-agent-connections.tsx`, `account-sandbox-section.tsx`,
`app/api/account/agent-preferences/route.ts`,
`lib/server/agent/native-worker-selection.ts` and associated behavior tests.
General API surfaces exclude the code-worker row. The code group owns engine,
OpenCode payer/model/reasoning, selected native connection and sandbox region
and size. OpenCode's funding label reflects the assigned text key's actual
`agent` surface setting; changing this surface preserves other API surfaces.
Selection saves the preference before connection without starting a login.
Launch admission still checks eligible account, connected generation and
exclusive custody; unavailable native work does not fall back to API billing.
UI badges and sandbox diagnostic buttons are removed, while server gating is
retained. Native credentials remain outside persisted browser queries.

Current primary sources reviewed:

- [Codex app-server auth endpoints](https://learn.chatgpt.com/docs/app-server#auth-endpoints)
  explicitly exclude app-server authentication for commercial or hosted
  services. This supersedes earlier permissive private-pilot conclusions.
- [Sign in with ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source)
  describes OSS/local integrations and refers paid or remotely hosted apps to
  the provider program. Zero revenue does not eliminate the hosted boundary.

Historical successful Codex UI-to-PR evidence is preserved as technical
execution evidence. Offline renewal, ciphertext restoration and revocation
fences do not establish real token expiry/renewal, remote OAuth revocation,
provider permission, seamless steering or durable HTTPS deployment.

## Language and illustrations

Read the changes in `en`, `fr`, `de`, `es`, `it` and `pt-BR` against the English
source for equivalent complete meaning, selection-before-connection, API
funding separation, sandbox placement and provider limitations. These are
agent reviews, not human language acceptance.

Remove obsolete standalone figure `ai-keys-and-models-defaults-workflow` from
all article bodies and required-figure metadata: the default controls now live
inside the integrated code-agent group. Retained provider and usage figures
still illustrate their unchanged individual controls; capture dates and assets
remain genuine. `delegate-code-work-workflow` remains explicitly historical
OpenCode evidence. New local settings captures under `docs/validation/assets/`
are internal interface evidence, not translated public manual figures.

## Verification boundaries

The parent task runs documentation, knowledge, owned-English, relevant behavior,
SQL, typecheck/lint and whitespace checks on the final combined changes.
Local SQL regressions use the Docker database and terminate with `ROLLBACK`.
The control-origin and encrypted-envelope tests use synthetic state and actual
crypto. No provider authentication, real renewal/revocation or hosted rollout
is performed for this review. Actual checks and interface captures are recorded
in the final validation evidence; metadata checks alone do not prove release
readiness.
