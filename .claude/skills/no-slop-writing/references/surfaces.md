# Rules by surface

The laws and patterns apply everywhere. This file adds what each surface needs on top.

## Length budgets (heuristics)

| Element | Target |
|---------|--------|
| Button / CTA | 2-4 words, max ~6 words or ~24 characters |
| Nav item | ~20 characters |
| Chip / badge / tag | ~15 characters |
| Page or modal title | 3-6 words, ~40 characters |
| Card title | a noun phrase, ~4 words |
| Card body / description | 1-2 sentences |
| Error message | 12-18 words including the fix |
| Instruction / helper text | under 20 words, ~14 ideal |
| Toast / notification | 10-15 words for title + body |
| Body sentence | 15-20 words on average, rarely above 25 |
| Line length (reading) | 40-60 characters ideal, max ~75 |

Over budget in a tight component: shorten the text first. Truncation with the full text on
hover is a fallback for text whose full length is legitimately needed (names, titles, paths).

## Marketing and landing pages

- **One promise per page, in the H1.** The subheadline explains it concretely: who it is for,
  what it does, how. Sections below support it with facts.
- **Apply the emphasis budget** (see SKILL.md). Card and feature descriptions describe; they do
  not pitch.
- **One idea per section.** If two sections say the same benefit in different words, merge them.
- **Specific beats impressive.** "Screenshots update on every merge to main" beats "Always
  up-to-date visuals, effortlessly."
- **Customer words over company words.** Describe the problem as the reader would.
- **Proof is real or absent.** Numbers, logos, quotes only when they exist. Mark `[NEED: ...]`
  otherwise.
- **CTAs say what happens:** "Start free trial", "Connect GitHub", "See pricing". Avoid "Get
  started" when a more specific verb exists, and never "Submit" or "Learn more" as the main CTA.
- **Cap the devices:** at most one fragment and one list of three per section. No em dashes in
  headlines, subheads or CTAs.
- **FAQ:** questions as a user would type them; answers that start with the answer.

## Product UI

### Titles and headings
Orient the user: where they are or what this area holds. Noun phrases in the project's casing
convention. No slogans.

### Buttons and links
Verb + object, describing the outcome, not the gesture: "Save changes", "Delete project",
"Invite member". Never "OK", "Yes", "Submit", "Click here". Link text makes sense out of context.
The confirm button repeats the action named in the dialog.

### Forms
Persistent visible labels (noun phrases). Placeholders are examples, never labels. Say format
and eligibility requirements before submission. Explain why you ask for data only when it is not
obvious. Validation says what needs fixing and how, without blame: "Use at least 8 characters",
not "Invalid password".

### Errors
Answer, in order: what failed, why (when known and useful), what to do next.
`[What failed]. [Likely cause]. [Recovery step].`
> "Couldn't save changes. You're offline. Your edits are kept; reconnect to save."
No raw codes as the main message, no "Something went wrong" without a next step, no jokes on
payment, deletion, access loss or data loss. Never promise a cause or a fix the system can't know.

### Empty states
Distinguish first use, no results, filtered out, no permission, and failure. Say why it's empty
and give the next useful action. No "Nothing to see here!" with nothing to do.

### Loading and progress
Name the real operation ("Generating screenshots…"). Set an honest expectation when the wait is
long. Never fake progress.

### Success and toasts
Past tense, specific, brief: "Project created", "Invite sent to alex@…". Mention a consequence
only when it changes what the user should do next. No celebration for routine actions.

### Destructive actions and confirmations
Name the object and the consequence: "Delete 'Q3 roadmap'? Its 12 issues will be deleted too.
This can't be undone." Prefer undo over a confirmation dialog when recovery is safe.

### Settings
Label = the setting. Description = what changes when it's on, in one sentence. No stakes, no
pitch: "Email me when someone mentions me", not "Never miss a beat with smart notifications."

### Tooltips and helper text
Answer an implicit question the label doesn't. If it repeats the label, delete it. Uncommon
detail goes behind progressive disclosure (an info icon), not inline.

### Onboarding
Short, one step per screen, focused on the first useful outcome. Explain only what the user needs
for the next action. No manifesto.

### Permissions
Benefit first, then the request: "Get notified when a build fails. Allow notifications."

## Transactional email and notifications

- Subject line = the event or the action needed: "Your invite to Acme expires tomorrow".
- First sentence carries the point. No "I hope this email finds you well", no "We're excited to
  announce".
- One primary action, labeled with a verb.
- Push notifications: the event and the object, nothing else.

## Documentation, changelogs, release notes

- Lead with what the reader can do or what changed for them.
- Changelog entries: user-visible change in past tense, one line each. Internal refactors only if
  they change behavior.
- No "In this guide, we'll explore". Start with the first step or the answer.
- Mentioning a previous version belongs in changelogs and migration guides only.

## CLI and developer-facing output

- State what happened and what to run next. Include the exact command or flag when there is one.
- Technical terms are fine here when the audience uses them; jargon is still not.
- No emoji as status markers unless the project already uses them consistently.

## Accessibility and localization (all surfaces)

- Accessible names match visible labels and say what the control does.
- Don't rely on color, icon or punctuation alone to carry meaning.
- Alt text conveys information; decorative images get empty alt.
- Write complete sentences with structured variables so translators can reorder them; don't build
  sentences from concatenated fragments.
- Leave room for expansion (French and German run 20-35% longer than English).
- Keep a short glossary when the same concept appears across the product, and use it.
