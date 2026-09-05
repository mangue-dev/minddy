# MIN-494 setup copy audit

## Scope and approach

Reviewed the MCP connection page, self-hosting overview, and installation wizard in English, French, German, Spanish, Italian, and Brazilian Portuguese. Applied the UX writing skill: explain the task and benefit before technical details, name the next action, and retain necessary operator terminology where it helps installation.

The rewrite defines MCP through the assistant's concrete access to issues and plans. It explains Supabase through accounts, data, attachments, and live updates. It replaces internal terms such as public core, route, stack, runbook, additive import, and remapping with descriptions visitors can use to choose and complete a setup.

## Claims checked against implementation

- `app/(marketing)/mcp/page.tsx` provides connection artifacts and example workflows. MCP can read issues and store plans; repository inspection depends on the external assistant's separate code access. The copy now makes that dependency explicit.
- `scripts/self-hosting-install.mjs`, `scripts/self-hosting-tools.test.mjs`, and `docs/self-hosting.md` show that the managed forge relay is available by default and can be disabled with `--no-forge-relay`. Removed the blanket claim that default self-hosting never contacts Minddy infrastructure.
- `scripts/self-hosting-doctor.mjs` redacts specific URL-password and bearer-token patterns. Removed the absolute promise that every credential is redacted. The diagnostic description now says what checks the command performs.
- `docs/self-hosting.md` documents Supabase Cloud versus a complete self-hosted Supabase stack, the desktop-managed local installation, and server Docker sandboxes for Numo and routines. Copy distinguishes the hosting choices and explains that AI provider configuration is needed.
- Account transfer copy retains the existing additive behavior and explains identifier conflicts without requiring database vocabulary. Passwords and access keys are distinguished from item identifiers, including in French.

## Translation repairs

Corrected literal translations that obscured actions or changed technical meaning: Italian installation and diagnosis wording, Spanish and Portuguese translations of the `hostname` command and Resend brand, Italian memory requirements and `.env` paths, Spanish `anon` key terminology, and translated expressions about going live. Exact commands, configuration keys, version numbers, and placeholders follow the English source. Generated installation prompts and email template content were not rewritten; the Italian MCP assistant prompt received a grammar-only correction preserving `{endpoint}` and `{guide}`.

## Verification boundaries

The override artifact was checked for existing keys, unchanged ICU placeholders, and preserved installer/email template keys. The parent task merges the catalog changes, runs repository checks, and performs the page-level visual review. This review did not perform a fresh server installation or authenticate every third-party assistant. It avoids guarantees about third-party subscription costs, configuration-file secrecy, or immediate token revocation.

## Changelog follow-up

Reviewed the dated changelog announcements in English and French. Rewrote the current introduction and RSS instructions plus selected entries that depended on insider vocabulary: pages, feedback tabs and comments, feedback setup, Smart-fill, routines, home-page review lists, MCP setup, notebook agent tasks, and notification grouping. Applied each selected change in all six locales. Release identifiers, dates, ordering, layout, and historical source-opening timing remain unchanged. A follow-up pass makes German visitor-facing copy informal across all four namespaces, including existing strings; generated installation prompts and external UI labels retain their original form.

Historical desktop-update and own-API-key announcements contain broader promises than the current implementation supports for every package or execution mode. They were left as dated release records; the current download and pricing pages provide the precise behavior. The current download copy was cross-checked against `lib/desktop/update-platform.ts`, and AI execution billing against `recordSandboxUsage` in `lib/server/usage.ts`.
