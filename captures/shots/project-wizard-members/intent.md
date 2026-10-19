# Project wizard — Members step

## What the image must show
The project creation wizard on its **Invite your team** step (MIN-689):
- under the field, the **From your projects** list proposing people who joined
  the demo account's other projects, with avatar, name and email;
- the queue holding one of them, picked by name (avatar and real name shown),
  and one outside address typed by hand, each with its remove button. The stepper shows the step between the primer
and the finishing touches. The CTA reads **Continue**, not Skip: something has
been added.

Nothing has been sent at this point: the image documents the queue, not an
invitation. The addresses are fictitious (`example.com` domain).

A second image, `-finish`, shows the finishing touches with the summary line
**2 invitations to send** under the project card.

## Where
`/home` → New project → brand-new project → name → icon → repository (Skip)
→ brief (Skip) → Members.

## Variants
en/light (pull request description).

## Writes
None in a project. Every non-GET API request is aborted — the wizard only
writes a draft on close, and the step itself sends nothing — except the
session caches `/api/me/local-snapshots` and `/api/me/app-tabs`.

## Known pitfalls
- Aborting `/api/me/local-snapshots` puts a red sync-error icon in the top
  bar. Let the session caches through.
