# Documentation interface language review

Reviewed on 2026-10-08 by the Codex review agent
`review_documentation_locales` for MIN-664. This is an agent review, not a human
language review or a representative-reader acceptance session. The owner plans
to review the French version separately.

## Scope and evidence

The review covers the 22 `Documentation` strings and the added public navigation
and application-help labels in `messages/en.json`, `messages/fr.json`,
`messages/de.json`, `messages/es.json`, `messages/it.json`, and
`messages/pt-BR.json`. It uses `docs/documentation-editorial-guide.md`, the
accepted MIN-664 audience entrances, and the UX writing skill.

The reviewer compared the six languages for meaning, idiomatic wording,
consistent address, action specificity, punctuation, and agreement with the
rendering code in `components/documentation/`. Article-language links, search
controls, audience entrances, navigation, metadata labels, and reporting links
were inspected in source code. No running interface, screenshot, assistive
technology session, or operational procedure was tested in this review.

This record does not approve article prose, translations, figures, publication,
or release compatibility. The public article corpus did not exist when this
interface review began.

## Corrections

- All six no-results messages now explain that clearing the search makes topic
  browsing available. Topics are not rendered while the query is present.
- German now uses informal second-person address consistently in the
  no-results recovery instruction, matching the surrounding product catalog.
- French operation navigation explicitly covers running one's own instance,
  rather than only hosting it. The review-date label now names a reread instead
  of the less natural editorial use of “review.”
- Spanish and Italian no-results messages use ordinary reader language instead
  of describing articles as matching or corresponding objects.
- Italian's clear-search action includes its definite article.
- Brazilian Portuguese now asks the reader to use fewer words and uses the
  natural error-reporting verb in the reporting link.

The documentation title and the added navigation/help labels require no
correction. All six translations retain the source's task entrances, metadata,
empty-state meaning, recovery actions, and self-hosting link purpose. No
unrelated catalog strings were changed.

## Functional findings sent to the implementation agent

1. The product entrance filters only articles tagged `member`. The accepted
   matrix also contains owner-only and visitor-only product journeys. Include
   those audiences in this entrance or prove that the content classification
   makes every retained product journey accessible there. This is a discovery
   failure, not a translation problem.
2. The clear-search link drops both the query and the audience filter. Its label
   promises only to clear the search. Preserve the selected audience or make
   the reset scope explicit in all six languages.
3. The compatibility display renders edition and profile values directly from
   metadata. Use localized reader-facing values where readers need their
   meaning; keep executable identifiers exact. This requires review against
   the eventual corpus.
4. Reporting opens a GitHub issue form. The label accurately describes the
   destination's purpose, but this source inspection does not establish an
   anonymous reporting workflow. Article reading itself has no authentication
   check in the reviewed documentation components.

These findings do not authorize feature edits by the review agent. The parent
agent owns their resolution and end-to-end verification.

## Checks

- JSON parsing succeeded for all six locale catalogs.
- All six `Documentation` key sets match and each contains 22 nonempty values.
- `npm run check:owned-english` passed after the string corrections and again
  after this record was added.
- `git diff --check` passed after the string corrections and again after this
  record was added.

Run the owned-English and whitespace checks again after the remaining
implementation changes. The checks above establish syntax and
repository prose compliance; they do not establish reader acceptance.

## Follow-up review of preview and compatibility labels

Reviewed all six locales for `draftPreview`, `selfHostedEdition`, `webProfile`,
`mobileProfile`, `desktopProfile`, `fullProfile`, `managedProfile`, `localProfile`,
and `sourceProfile`. Meaning is preserved: pending draft review, edition versus
installation profile, and installation from source. No misleading translation
was found. These labels describe metadata; they do not claim that every profile
was operationally tested.

The main agent's actual anonymous recovery capture exposed Italian
`Auth.forgotBackToLogin` as “Torna a registrarsi”, although its link opens login.
At the main agent's specific request, changed only that legacy key to
“Torna alla schermata di accesso”. This corrects the observed destination
mismatch and is distinct from the added Documentation namespace review.

## Follow-up review after implementation

The same agent compared all current Documentation namespace strings in all six
locales, including draft preview, source installation, localized compatibility
profiles and the article/language/revision labels. They preserve the English
meaning and need no further correction. The implementation agent reports and
separately verifies the navigation, filter and reporting corrections listed
above; this interface record does not replace those runtime results.

Actual product screenshots exposed additional reader-facing mistakes. With the
main agent’s authorization, this review corrected only these catalog keys:

- Italian `Auth.forgotBackToLogin` now returns to sign-in, matching its login
  destination.
- `Pages.historyDescription` in all six locales now states in a complete
  sentence that earlier versions are kept for `{days}` days.
- Spanish `Status.duplicate` is Duplicado. Brazilian Portuguese uses Duplicado,
  Em revisão and A fazer for duplicate, in-review and todo states. These are
  state labels, not reproduction, an infinitive or a generic list of tasks.

The history and status controls were recaptured and inspected in the affected
locales. Their capture records remain separate from the article-language review.
All eight actual fixed statuses are preserved; these corrections add no new
workflow or configurable status.
