# The task notebook

Landing location: `scratchpad`. The accompanying section is called
“Everything that is not yet a ticket” and promises, among other things, to *“launch
the code agent directly on a section, without going through a ticket »*.

## Ce que l'image doit montrer

- The notebook modal, opened by the shortcut **Command/Ctrl + Shift + N** — the one that the
section text quotes verbatim.
- **Two sections `##`** (“Before the release”, “Loose ends”) and their
**nine tasks**, in the four states: checked and crossed out, in progress, to do,
canceled.
- A **section action visible on hover**: the pointed section detaches
on a gray background, its two buttons appear against its title, and
the tooltip names the action (“Launch an agent on the section”).
- The notebook is **personal and cross-project**: nothing on the screen links it to
a project, and it is desired.

## Or

Any page of the app — here the Aurora board, so that the background is
the same as the other captures. Connected to Camille Roy.

## Framing — why 1024 × 768 and not 1447 × 1085

This is the only location that deviates from the common window, and the reason is that
the modal itself.

`--spacing-dialog-w/h` are equal to `90vw` / `90vh`: **the modal grows with the
window, not its contents.** The body of the notebook has fixed metrics — 192 px of
high margin (`pt-48`, a writing surface that starts low, like a
note editor), 336 px of tasks, 48 ​​px of bottom margin, or 576 px in total.

Consequence: at 1085 px high, the modal is 976 px and **60% of its surface
is white**. At 768, it is 691 px, and the remaining white (115 px) reads
like the breathing desired by the `pt-48`, not like a failed loading.

The other way was to lengthen the note until it filled the big modal: it
would have required **around fifteen more tasks**, i.e. four sections and one
twenty lines. A notebook of “things to do right away” which
counting twenty no longer says the same thing, and it required writing in base.
The window costs less than the data.

## Variations

fr/light, fr/dark, en/light, en/dark, de/light, de/dark, pt-BR/light,
pt-BR/dark, it/light, it/dark, es/light, es/dark

## Known pitfalls

- **`G` then `N` is typed before opening anything**, on a board already
stabilized — this is the opposite of the paddle trap, where the strike follows
the opening of a surface and loses its first characters. Here the shortcut
opens the surface; there is nothing to lose.
- **Section titles are data, not labels.** “Before the
release” and “Loose ends” are in English in both variants: it is
the control anchor, it is valid for FR as well as for EN.
- **Section buttons are ProseMirror widgets**, injected by a
decoration (`section-copy-extension.ts`), not React components. They don't
carry neither role nor test-id: we target them by their classes
`.scratchpad-section-launch` / `.scratchpad-section-copy`, which are their only
  identifiant stable.
- **Hover must be forced.** The buttons are only visible when hovering over the
title: `hover()` without `force` expects visibility that will never arrive.
- **The tooltip and the section background are set by JS**, on `mouseenter`,
via the `is-visible` class. She’s the one we’re waiting for — not a deadline.
