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
