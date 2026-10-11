# MIN-676 provider connections and personal Numo defaults

Date: 2026-10-11. Reviewer: agent:/root. Agent source, language and UI review;
no human acceptance or provider inference is claimed.

Members need to distinguish the active text provider from saved connections,
connect several providers without replacing the others, and persist their Numo
model choice independently of code-worker model controls.

Affected article: `ai-settings-and-usage`, revision/source revision 14 in `en`,
`fr`, `de`, `es`, `it` and `pt-BR`; workflows `A04`, `A08`, `A10`. Reviewed all
six additions for equivalent procedures, per-provider defaults, explicit
conversation precedence, frozen admitted turns, invalid-model rejection and
credential-free account transfer. Related guide: `numo`, revision 10 in all six locales, workflows `N01`, `N02`, `T05`, `N08`, `N05`; its unchanged figures retain their actual capture dates. Related knowledge: `settings-and-data`.

Sources: `account-ai-keys-section.tsx`, `byok-connect-panel.tsx`,
`app/api/account/numo-preferences/route.ts`, `assistant/model-preferences.ts`,
`assistant/conversation-config.ts`, `ai-runtime.ts`, account export/import and
migration `20270109200040_personal_numo_model_preferences.sql`. The general
provider selector assigns the text capability; existing usage switches remain
independent. It does not re-enable a disabled Numo surface. The model preference
uses the effective Numo provider, not the code-agent subscription.

The existing logged-in French interface on localhost was exercised against the
Docker pilot. Selecting Qwen3.7 Flash, navigating to Home and reloading restored
that model in Numo's composer. No message or inference was sent. App default was
then restored; the Home composer returned to DeepSeek V4 Flash and metadata-only
SQL confirmed a null personal model. Add provider opened the compact provider
form; Cancel closed it without changing credentials. Final screenshot:
`docs/validation/assets/min-676-provider-numo-settings.png` (585 × 809, dark).
Codex remained connected; no native provider or Claude execution was performed.

Figure `ai-keys-and-models-workflow` now explains connected providers, capability
routing and Numo defaults using the responsive sequence and localized SVG
fallbacks. Obsolete single-selector screenshots were removed. The separate
`plans-and-ai-usage-workflow` screenshot is retained with its original 2026-10-09
capture date: billing controls and behavior were not changed. All six generated SVG fallbacks were rendered together and inspected: text fits its cards, localized labels are readable and the complete three-step meaning is retained. Billing and Numo figures remain accurate for unchanged controls; no recapture is claimed. Final automated results are recorded below.


The final UI also removes the redundant managed-cloud explanation banner from
Connected providers, as requested. Minddy Cloud remains a routing choice.

Verification passed: 10,819 Vitest tests (113 intentionally skipped across the
existing suite), including 357 focused tests; owner-isolation SQL with rollback
on `supabase_db_minddy-min676-local`; lint, typecheck, encrypted-access/schema,
public repository, documentation/release mode, knowledge, owned-English and
whitespace checks. Only migration `20270109200040` was applied for this change,
on the Docker pilot. No hosted migration or deployment was performed.

## Standard model field follow-up

On 2026-10-11, replaced Numo's custom compact text trigger with the standard
`ModelCombobox` field used by `admin-models-dashboard.tsx`. The field now shows
the model logo, resolved application default, multiplier and dropdown affordance.
The assistant catalog, plan restrictions, accessible label and provider-bound
persistence are unchanged. The existing seven account-settings behavior tests,
lint and typecheck passed. The French Docker-backed UI was inspected: the field
rendered the app default with DeepSeek's logo and model name, its list opened,
and a Qwen search filtered models. Closed without changing the saved preference
or starting inference. Refreshed `min-676-provider-numo-settings.png` in the same
585 × 809 dark viewport. Public procedures and responsive diagrams remain
accurate; this presentation-only follow-up requires no public-guide revision or
translation change. No credential, database, native-provider or deployment
operation was performed.
