# The ⌘K palette

Emplacement de landing : `featurePalette`. Doit montrer que minddy se pilote
on the keyboard, without ever letting go of your hands.

## Ce que l'image doit montrer

- The open palette **over the Aurora board**, which remains readable
behind: this is what gives the context.
- **A typed search**, which returns both tickets and actions.
- The keyboard affordances of the **paddle foot**: `↵ Ouvrir` and `⌘ ; Actions`.
The catalog instruction asks for “shortcuts displayed to the right of the
lines”: **it doesn’t exist**. Checked in both states (empty query and
typed request), the only `<kbd>` on the palette are the three on the foot. This
that we can show is that the palette is controlled by the keyboard - not a
  raccourci par ligne.
- No other open surface, no blindfold.

## Or

`/projects/6cd36606-c297-4920-8ce3-31b5f3697be8` on `https://www.minddy.app`,
connected as Camille Roy, palette open at the keyboard.

Landing frame: **16/10**, same window as `heroBoard`
(1736 × 1085) so that both images on the page have the same scale.

## Variations

fr/light, fr/dark, en/light, en/dark, de/light, de/dark, pt-BR/light,
pt-BR/dark, it/light, it/dark, es/light, es/dark

## The typed text: `board`

A search which must retrieve tickets **and** actions, in both
LANGUAGES. Since the ticket titles are in English, the query is an English word
present in several titles - otherwise the French variant would go back one
empty list and the image would show nothing.

`board` goes up the public board of the project (a navigation entry) and four
tickets whose title bears the word, in English “Keyboard shortcuts” in addition.
It is also the **same word in both languages**, where the query
previous one had to be translated.

### Why is it no longer `ticket` / `issue`

It was the July request, and it gave four groups. She stopped
work without anything breaking: CSV export and settings entries are
came to expand the action groups, and **they pushed the “Tickets” group
below the waterline**. The pallet only went up from the
navigation — “New ticket”, “All tickets”, “Export tickets
in CSV”, “Tickets — Preferences” — that is to say the exact opposite of `alt`
of the location: *“a search that returns tickets AND actions”*.

The script control didn't see it because it **counted** the results (at
minus 7): there were always eight. He now checks what is
actually IN THE FRAME — at least three tickets, at least one action, and
no line cut from the bottom of the list.

## Known pitfalls

- **The overall typing loses characters.** The palette comes to life when opened;
a `keyboard.type` launched immediately produced “ssue” instead of “issue”.
We now type IN the field (`pressSequentially`) and we reread the value
entered before photographing.
- **The query decides the image, and its result AGES.** What the palette
goes back depends on the catalog of actions, which grows with each feature. A
well chosen query today may show nothing in three months,
without any error saying so. This is what happened to `ticket`.
- **A ticket identifier is not searched with `\b` in the head.** The title and
the identifier are two neighboring nodes: the text of the line says
“…from the boardAUR-5”, with no word boundary between `d` and `A`.
- **Counting results says nothing about what we see.** A result under
waterline counts like the others. The control therefore measures the
positions, not lengths.
