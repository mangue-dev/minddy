# Public documentation editorial guide

Minddy articles must help a reader complete a task, make a decision, or
understand a mechanism that affects their work. A finished article gives enough
verified detail to do that comfortably. Page count, length, and fluent prose
alone do not establish coverage or quality.

This guide applies to the official public corpus in `en`, `fr`, `de`, `es`,
`it`, and `pt-BR`, including summaries, search excerpts, captions, alternative
text, and Numo's source articles. It supplements the
[MIN-664 study](plans/min-664-public-documentation-study.md) and
[workflow matrix](plans/min-664-coverage.md). Contributor instructions remain
English; published locale articles use the reader's language.

## Start with a useful article brief

Before drafting, record the audience, question or outcome, covered workflow IDs,
applicable edition and release, evidence to check, and needed illustrations.
Identify what the reader already knows and any prerequisites they need. These
notes belong in the review record; the article should lead with its subject.

Choose a recognizable feature or subject as the article title, such as
"Issues", "Pages", "Instance configuration", or "Backups and restoration".
Use the localized product term. The opening should define the scope and help
the reader choose the relevant procedure from the contents. Avoid a general
introduction about productivity, modern teams, or the importance of documentation.

Use the matrix to find omissions, then group related outcomes into one feature
guide. This applies to every documentation domain, including operations and
integration. Give each task a descriptive level-two heading; nest its checks,
reference and recovery sections at level three. The contents must let a reader
reach a procedure without reading preceding tasks. Keep permissions and
prerequisites beside the action they govern, including when they differ within
a guide. Split separate features or materially different audiences, such as
end-user account access and operator authentication configuration. Do not make
one article cover an entire navigation domain. Each section must add an action,
fact, explanation, decision, or useful recovery step.

This feature-first rule supersedes the initial preference for narrow task
articles, following the owner's 2026-10-09 request. It changes how readers find
the information, not the required detail or the 90 workflow outcomes. See the
[migration review](plans/min-664-feature-guides.md) for boundaries, legacy links
and validation. A tutorial or a feature already covered by one useful article
can keep its own page; there is no target page length or minimum number of tasks.

## Set the right depth

There is no minimum word count or uniform page length. Explain what this
reader needs at this point, and link to deeper reference where it becomes
useful. Keep essential instructions on the page, including conditions that
change the procedure. Do not require a repository visit to finish an ordinary
user task or operate an instance.

| Article type | Detail that earns its place |
| --- | --- |
| Tutorial | One realistic demo scenario, prerequisites, ordered steps, checkpoints, and a result the beginner can recognize. Introduce concepts when they become necessary. |
| Task guide | Permission, exact entry point, actions, expected result, and relevant limits or failures. Explain a choice when it changes the outcome. |
| Explanation | The mechanism, why it matters to this reader, boundaries, and a worked example or diagram when it makes the idea clearer. Link to the corresponding task. |
| Reference | Precise fields, accepted values, defaults, constraints, permissions, and compatibility. Use a table when readers need to compare or look something up. |
| Troubleshooting | Recognizable symptom, applicable conditions, safe checks, recovery, and verification. Give an escalation route if the procedure cannot resolve the problem. |

Templates are reminders, not mandatory empty sections. Include troubleshooting
when there is a relevant failure to explain. Add an example when it clarifies a
choice, interaction, or result; decorative examples add reading effort.
Explain unfamiliar product terms on first use and use the glossary consistently.

## Verify the facts before polishing the prose

Check behavior against the identified shipped version, actual controls,
permissions, and configuration. Source code and existing knowledge are evidence
to examine; neither proves that a proposed workflow works in the released UI.
For an operational procedure, run the complete procedure on the stated release
and installation profile and record the result.

Keep a review record linking claims to sources or procedural evidence. Identify
the reviewer, article revision, compatibility, and real review date. Essential
public information belongs in the article; internal audits and private evidence
stay outside the published corpus.

Never fill a gap with a plausible label, permission, command, default, limit,
or guarantee. An unresolved essential fact blocks publication of that article.
State verified availability conditions clearly, including Cloud, self-hosted,
platform, provider, and plan differences where they affect the reader.

Distinguish an instruction from its result. If a check only diagnoses readiness,
say what still needs to be done. Put requirements before the action they
govern, and place destructive consequences before the relevant command or
control. Preserve caveats about data, access, encryption keys, and recovery
when shortening a draft.

## Write natural, specific prose

Use a calm, helpful voice and familiar words. Address the reader directly in
instructions. Prefer a named actor and an active verb when that clarifies who
does what. Keep technical terms where precision requires them and explain
their meaning. Read paragraphs aloud to find awkward transitions or repetition.

Minddy's house rules for public articles are:

- State the point directly. Remove staged openings, promotional claims,
  repeated conclusions, and phrases that announce what the next paragraph says.
- Replace vague praise such as "seamless" or "powerful" with a verified behavior
  when that behavior helps the reader. Remove it when it adds no information.
- Avoid formulaic contrasts, forced groups of three, and repeated paragraph
  shapes. Keep real comparisons, distinct items, and useful warnings.
- Use periods, commas, colons, or parentheses instead of em dashes in new prose.
  Avoid en dashes as sentence connectors too. Preserve command flags, code,
  identifiers, URLs, quotations, and meaningful locale-specific range notation.
- Vary sentence length according to the idea. Split a sentence that contains
  several actions or qualifications; retain a longer sentence when it expresses
  one relationship more clearly. Keep paragraphs focused on one main point.
- Use numbered steps for ordered actions, lists for distinct parallel items,
  and prose for explanations. Avoid turning every paragraph into a bold label
  or a sequence of sentence fragments. Headings should name their contents.
- Preserve exact UI labels, command syntax, values, and technical distinctions.
  Do not rotate product terms through synonyms just to vary the vocabulary.
- Use neutral factual language. Invented anecdotes, quotes, testimonials,
  personal reactions, and deliberate grammatical mistakes have no place here.

These are editing rules. A punctuation mark or phrase does not establish who
wrote a text. Review usefulness and accuracy directly; an AI-detection score
is not publication evidence.

## Format technical references as inline code

When citing a technical element in article prose, lists, table cells, figure
captions, or diagram labels, wrap it in Markdown backticks so it appears as
inline code. This applies to library
and package names, commands and flags, variables and environment variables,
functions, configuration keys, literal values, file paths, and API identifiers.
For example: use the `@supabase/supabase-js` library, run
`npm run self-host:doctor`, or set the `NEXT_PUBLIC_SUPABASE_URL` environment
variable. Apply this rule consistently in all six article locales.

Keep the exact spelling, case, punctuation, and executable syntax inside the
backticks. Include the complete short command when citing it in a sentence;
use a fenced code block with an appropriate language for multiline commands,
scripts, or configuration examples. Keep explanations outside the code span.
Use ordinary prose for general technical concepts and product names, and
preserve UI labels as UI labels. Inline code identifies a technical reference;
it is not a substitute for emphasis throughout a sentence.

## Keep articles useful to agents and text readers

The public Markdown representation comes from the same published article as
the HTML page. Do not create a separate simplified copy for agents. Keep
prerequisites, permissions, exact UI entry points, expected results, limits,
recovery steps, and release or edition differences in the prose beside the
action they govern. A screenshot must not be the only source of a necessary
instruction. Give figures meaningful alternative text and captions; structured
diagram items and tables are also included in the Markdown response.

Keep stable section IDs and descriptive cross-links. Each procedure should make
sense when retrieved on its own; replace ambiguous references such as "do the
same thing above" with the action or a precise section link. Article metadata
must identify the verified version, editions, profiles, audiences, and update
date. Internal evidence paths and review records stay out of public exports.

The generated `llms.txt` index lists only the reviewed publication set, and the
Markdown index reuses the documentation search. See
[documentation access for agents](documentation-agent-access.md) for endpoints,
retrieval examples, publication boundaries, and maintenance checks.

## Examples of substantive edits

These examples illustrate editorial decisions using facts identified in the
study. They are short excerpts, not complete procedures.

| Rejected draft | Useful replacement | Reason |
| --- | --- | --- |
| "Cycles unlock a powerful way to organize your team's projects." | "A personal cycle groups your work across projects. It belongs to one user." | Defines ownership and scope without suggesting a team sprint. |
| "Simply run the backup command to keep your instance safe." | "The `self-host:backup` command runs readiness checks. Follow the backup procedure to save the database, Storage files, configuration, and required encryption keys." | Corrects an incomplete operation and identifies what must be preserved. The full guide must supply the verified procedure. |
| "Minddy uses advanced encryption for complete privacy." | "Content is encrypted at rest. Preserve the root keys with your backup so the restored instance can read encrypted content." | Gives the reader a concrete operational consequence and avoids an unsupported privacy guarantee. |

## Keep all six languages equally useful

Approve the source article's facts and structure before translating it. Each
locale must preserve the same actions, options, permissions, results, limits,
warnings, and compatibility. A translation may reorganize sentences to read
naturally; it must not summarize away part of the procedure.

Use idiomatic grammar and typography in each language, subject to the house
rule on sentence dashes. Use the actual localized UI labels and agreed product
glossary. Keep identifiers and executable examples intact. Localize meaningful
demo text in instructional screenshots as well as captions and alternative
text. A translated application shell with an unreadable foreign-language
example is insufficient.

Review each locale against its source revision and through its actual task.
Record language-review evidence separately from automated parity checks.
Machine translation or an English readability score cannot establish that a
German, Spanish, Italian, French, or Brazilian Portuguese article reads well.

## Choose and frame illustrations

Use a screenshot when the reader needs to recognize a real control, menu,
dialog, or application state. Explain relationships, responsibilities, data
boundaries, and workflow stages with a responsive code illustration. For
example, connecting a Git account and linking a project repository needs a
workflow diagram; choosing properties in the issue creation dialog benefits
from a screenshot.

Responsive diagrams use `DocumentationDiagram` and the landing's shared
`CARD_TONES` palette. Keep labels selectable, allow text to wrap on phones,
and preserve the reading order and meaning in every language. Use sequence
arrows only for ordered steps. Keep the SVG Markdown fallback consistent with
the code illustration. Do not rasterize a diagram or a permissions table.
Collections have no circle or dot marker; ordered steps use a numbered marker.
When a table already explains responsibilities or permissions clearly, retain
the table without adding a second illustration of the same information.
Documentation tables share the pricing table's pastel column surfaces, rounded
panel and subtle separators. Preserve native headers, rich cell contents and
keyboard-accessible horizontal scrolling for reference tables too.

Capture the complete component, including its footer and rounded corners.
Isolate it from unrelated page content before capturing a dialog or popover.
Bake equal transparent margins into the capture with
`captureDocumentationControl`. The article displays the PNG directly, without
a colored container or an extra CSS frame. Figure `viewport` values
are the cropped image's display dimensions in CSS pixels, not the browser
window dimensions or the pixel dimensions of a capture taken at twice the
device scale. A small popover must stay at its natural size instead of filling
the article width. Keep the image viewer available for larger captures.
Every documentation screenshot uses light mode. New captures require native
device pixels at a scale of at least two, PNG output, loaded fonts and an sRGB
color profile with grayscale text antialiasing. Do not resize a low-resolution
capture to simulate higher density. Preserve the control's page background
when isolating it; only the surrounding margin should become transparent.
Record `deviceScaleFactor` with the display dimensions so the publication
checker can verify the PNG geometry.

Use populated, localized demonstration data when it helps readers recognize
the result. Capture an empty state only when that state is itself being
explained; omit redundant empty illustrations. Response-only demo fixtures
must be recorded as examples and must not imply a completed import, delivered
notification, or other real operation. Inspect representative desktop and
phone layouts in light and dark mode after changing the shared renderer.
Ordinary login, signup and password-recovery forms rarely need a screenshot;
keep the steps and relevant requirements in text.

Use bounded capture batches: one browser, one context, one page, one locale and
at most three screens. Stop on the first failure and close the browser. Follow
the repository's local resource limits; never start Docker, another development
server or a compiler alongside a capture batch. The canonical hosted demo is
an option for reading visible controls without starting a local stack. Keep
its business writes blocked and record the runtime actually photographed.

## Review and publication checklist

The author first checks the brief, factual evidence, and complete reader
outcome. A reviewer then checks factual accuracy and editorial usefulness; a
reviewer competent in each target language checks idiom and retained meaning.
The same person may cover several roles if qualified. Record actual review
evidence rather than assigning approval automatically to generated text.

For each article and locale, complete these checks before publication:

- [ ] The title, opening, and scope answer an identifiable reader need and link
  to the retained workflow IDs.
- [ ] Facts, UI labels, permissions, commands, and availability match the stated
  version/profile; essential uncertainties have been resolved.
- [ ] A reader can complete the task or understand the intended mechanism.
  Prerequisites, results, necessary limits, and recovery steps are present.
- [ ] Every section contributes useful information. The depth suits the
  audience; filler, repeated explanations, and unsupported promises are gone.
- [ ] Prose reads naturally aloud, technical conditions survived editing, and
  the house rules have been checked.
- [ ] Technical references use inline code consistently in prose, lists, tables,
  captions, and diagram labels; exact syntax is preserved, and multiline
  examples use fenced blocks.
- [ ] Illustrations clarify the text, match the steps, remain legible on mobile,
  and use suitable localized demo data, captions, and alternative text.
- [ ] All six locales retain the complete meaning at the reviewed revision,
  with actual language-review evidence and required figure variants.
- [ ] Links, anchors, metadata, related articles, owner, compatibility, and review
  records pass their checks. Representative-reader failures affecting this
  article have been fixed and checked again.

The documentation tooling planned in MIN-664 will check structure, links,
revision parity, and required figures. Repeated wording or sentence-dash checks
can flag passages for review, with code and locale exceptions. They cannot
grade usefulness, certify factual correctness, or replace reader acceptance.
Do not publish an article with an unresolved failure in this checklist.

## Editorial references

Consulted on 2026-10-08. The rules above adapt these references to Minddy's
task guides and six-language publication contract:

- [GOV.UK: meet user needs](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/meet-user-needs/)
  supports deciding what to publish from the task the reader needs to complete.
- [GOV.UK: clear language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/)
  supports accessible specialist explanations and proportionate page length.
- [Google developer documentation style highlights](https://developers.google.com/style/highlights)
  informs instruction order, precise UI/code formatting, accessible images,
  descriptive links, and writing for an international audience.
- [Microsoft: style and voice tips](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice)
  informs reader-first openings, useful brevity, active verbs, and reading aloud.
- [Humanizer skill](https://github.com/blader/humanizer/blob/main/SKILL.md)
  informs the rework of mechanical prose while preserving facts and technical
  literals. It is an editing reference, not an authorship test. Minddy retains
  neutral technical voice and its own locale and publication requirements.
