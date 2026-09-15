# Repository agent rules

## Language

- All new comments, docstrings, test descriptions, documentation, configuration
  prose, and developer-facing CLI messages must be written in idiomatic English.
- Do not add French prose to application code, tests, documentation, scripts, or
  configuration. The only normal French catalog is `messages/fr.json`.
- Preserve intentional runtime translations, language-specific test fixtures,
  locale branches, proper names, legal credits, identifiers, URLs, API values,
  and behavior. Do not translate those into English copies.
- When editing existing French prose, translate it as part of the same change
  unless it is one of the intentional runtime or language-fixture exceptions.

## Translation-task boundary

Translate comments and documentation without changing code, identifiers, URLs,
configuration keys, migration behavior, or test semantics. If a French string
is required to test localization or to serve the French locale, keep it and
make the exception obvious from its surrounding code or fixture path.

## Verification

- Run `npm run check:owned-english` after changing comments, documentation,
  tests, scripts, or configuration prose.
- Run the smallest relevant test or lint command after source/configuration
  changes.
- Review `git diff --check` and confirm that excluded paths are untouched.

## Git workflow (this repository only)

Apply these rules only when the `origin` remote is `mangue-dev/minddy`. Never
apply them to another project.

### Before changing code

1. Check the Git state and refresh the remote references
   (`git fetch origin --prune`).
2. Pick one dedicated branch for the goal.
3. Check whether that branch already exists locally or on `origin`:
   - If it exists locally, switch to it and continue the work there.
   - If it exists only on `origin`, create its local tracking branch.
   - If it does not exist, create it with
     `npm run work:start -- "short work name"`.
4. Never create a second branch for the same work.
5. Never commit or push directly to `main` or `production`.
6. Always preserve pre-existing uncommitted changes.

### When the work is ready

- Run `npm run work:pr -- "Short title" -m "Complete description"` to create or
  refresh the pull request. The `-m` flag may be repeated for several
  paragraphs.
- After confirming the pull request is merged, run `npm run work:done`.
- Run `npm run deploy` only when the user explicitly asks for a production
  deployment.

## Commits and pull requests

- Always write commit messages and pull request titles and descriptions in
  idiomatic English.
- Commit messages follow the Conventional Commits style used in this
  repository (`feat:`, `fix:`, `refactor:`, …).
- Every pull request carries a complete, real description: what was done, why,
  how it was verified, and anything a reviewer needs to know. Never reduce a
  pull request description to a bare `Signed-off-by` trailer or a copy of the
  commit message. The DCO trailer belongs in the commits, not as the body of
  the pull request.
- Every commit must carry the DCO sign-off (see below).

## DCO sign-offs

- Every commit Codex creates or amends must include a `Signed-off-by` trailer
  that exactly matches the commit author's name and email. Use
  `git commit --signoff`, including when amending a commit.
- Never use a generic Codex identity for the sign-off when the commit has a
  different author. Before pushing or updating a pull request, verify every
  non-merge commit in its range has the matching trailer and repair the
  history when necessary.

## Minddy tools

- Treat the Minddy MCP tools as available for issue work in this repository.
  Discover their callable names by searching for the `mcp__minddy__` prefix;
  do not conclude that they are unavailable from an exact short-name lookup.
- When an issue identifier and project ID are provided, read the issue and its
  plan, keep plan task states synchronized while working, add a concise outcome
  comment, and update the issue status when the requested work is complete.
