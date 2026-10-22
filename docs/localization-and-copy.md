# Localization and interface copy

This guide is the contract for every visible string of Minddy: the English source
copy in `messages/en.json`, its five translations, the public manual that quotes
them, and the screenshots that show them. It records the decisions already taken
so that a change does not reintroduce the errors fixed in MIN-762 and the full
catalog review that followed.

## Sources of truth

| What | Where |
| --- | --- |
| Source copy (English) | `messages/en.json` |
| Translations | `messages/{fr,de,es,it,pt-BR}.json`, same keys and placeholders |
| Supported locales | `i18n/config.ts` |
| Command palette shell strings | `lib/command-palette/i18n.ts` (one built-in set per language) |
| Manual quoting the labels | `content/documentation/<locale>/` |
| Manual figures and diagram fallbacks | `public/documentation/<locale>/` |
| Glossary guard | `lib/i18n-glossary.test.ts` |

French is the product's original language and keeps its deliberate developer
loanwords (`checks`, `reviews`, `pull request`). Every other locale follows the
glossary below.

## Writing the English source

- A label names an action or a thing in two to four words. A button is a verb
  ("Create issue"), a heading or a field is a noun ("Due date").
- One concept, one word, everywhere: "issue" for the work item, "objective",
  "cycle", "view", "page", "board", "inbox", "trash". Do not use "issue" for a
  problem or an error: write "problem" or "error", or translators will render it
  as the product term.
- Product names stay as written and are never translated: minddy (lowercase),
  Numo, Smart Assign, Smart Fill, minddy Cloud, MCP.
- Say who acts. A line composed by the UI as `{actor} {line}` ("Camille created
  the issue") must read as a full sentence after the actor in every language;
  check the call site before writing the string.
- Keep a value short when its control is narrow (select triggers, tabs, filter
  placeholders, toggle labels). A longer translation is clipped in the UI.

## Glossary

### Register

| Locale | Address the user as | Example |
| --- | --- | --- |
| fr | vous | « Choisissez un projet » |
| de | du, never Sie | „Wähle ein Projekt“ |
| es | tú, never usted | «Elige un proyecto» |
| it | tu, never voi or Lei | «Scegli un progetto» |
| pt-BR | você | "Escolha um projeto" |

Button labels use the infinitive in German and Portuguese ("Projekt erstellen",
"Criar projeto"); sentences and hints use the register above. The manual
follows the same register as the UI.

### Product terms

| English | fr | de | es | it | pt-BR |
| --- | --- | --- | --- | --- | --- |
| issue | ticket | Ticket | incidencia | ticket | ticket |
| sub-issue | sous-ticket | Unterticket | subincidencia | sottoticket | subticket |
| objective | objectif | Ziel | objetivo | obiettivo | objetivo |
| cycle | cycle | Zyklus | ciclo | ciclo | ciclo |
| view | vue | Ansicht | vista | vista | visualização |
| board (feedback) | tableau | Board | tablero | bacheca | quadro |
| inbox | Inbox | Posteingang | bandeja de entrada | Posta in arrivo | caixa de entrada |
| trash | corbeille | Papierkorb | papelera | Cestino | lixeira |
| assignee | assigné | Zuständig | responsable | assegnatario | responsável |
| unassigned | non assigné | nicht zugewiesen | sin asignar | non assegnato | sem responsável |
| settings area | paramètres | Einstellungen | ajustes | impostazioni | configurações |
| pricing plan | offre | Plan | plan | piano | plano |
| AI | IA | KI | IA | IA | IA |
| reasoning (model) | raisonnement | Reasoning | razonamiento | ragionamento | raciocínio |
| merge (pull request) | fusionner | zusammenführen | fusionar | unire | mesclar |
| Delete | Supprimer | Löschen | Eliminar | Elimina | Excluir |
| Dismiss | Ignorer | Verwerfen | Descartar | Ignora | Dispensar |
| Filter {items}… | Filtrer {items}… | {items} filtern… | Filtrar {items}… | Filtra {items}… | Filtrar {items}… |

Forge objects keep their own names: a GitHub or GitLab "issue", a GitLab
"merge request", "Issues" as a permission. Developer terms stay in English:
pull request, commit, branch, prompt, webhook, token, API, backlog.

### Issue statuses

| Status | fr | de | es | it | pt-BR |
| --- | --- | --- | --- | --- | --- |
| triage | Triage | Triage | Clasificación | Triage | Triagem |
| backlog | Backlog | Backlog | Backlog | Backlog | Backlog |
| todo | À faire | Zu erledigen | Pendiente | Da fare | A fazer |
| in_progress | En cours | In Bearbeitung | En curso | In corso | Em andamento |
| in_review | En revue | In Prüfung | En revisión | In revisione | Em revisão |
| done | Terminé | Erledigt | Hecha | Completato | Concluído |
| canceled | Annulé | Abgebrochen | Cancelada | Annullato | Cancelado |
| duplicate | Doublon | Duplikat | Duplicada | Duplicato | Duplicado |

Adjectives agree with the issue term: masculine in Italian and Portuguese
("ticket"), feminine in Spanish ("incidencia").

## Translating

- Never ship machine translation that nobody reviewed. Review key by key
  against `messages/en.json`: meaning first, then grammar, register and the
  glossary. A literal word in the wrong sense ("Invio" for Inbox, "Problem" for
  issue, "Begründung" for reasoning, "galleta" for cookie) is the most common
  defect.
- Keep the ICU structure exactly: every `{placeholder}`, `plural`/`select`
  branch, `#` and rich-text tag. Translate only the text around them.
- Plural rules differ: Portuguese and French treat 0 as singular. Every pt-BR
  plural that has `one` and `other` also carries `=0` with the plural form
  ("0 dias", not "0 dia"); the glossary test enforces it.
- German composed activity lines start with the auxiliary ("hat das Ticket
  erstellt"), because the UI prefixes the actor's name.
- Keep identifiers, cookie names, storage keys, URLs, commands, file names and
  keyboard keys untranslated, including inside legal pages. Legal pages
  (Terms, Privacy, Cookies, Legal) change wording only, never substance.
- A translation must not carry more or less meaning than the English. When the
  English changes, update every catalog in the same change.
- Run `npx vitest run lib/i18n-contract.test.ts lib/i18n-glossary.test.ts` after
  any catalog change, and `lib/seo-surface.test.ts` when a `metaTitle` or
  `metaDescription` changes (titles ≤ 70 characters, descriptions ≤ 170).

## Keeping the manual aligned

- The manual quotes labels exactly as the catalog of its locale says them, in
  bold. When a label changes, search every article of that locale for the old
  value and update it, including figure `alt` and `caption`.
- A figure's alt text appears twice, in the frontmatter `figures` entry and in
  the Markdown image; keep both identical. A diagram's text appears in the
  frontmatter and in its SVG fallback under `public/documentation/<locale>/`;
  keep both identical.
- A changed locale increments its `revision`, sets `review.revision` to it,
  appends a `review` entry and keeps every `figures[].revision` equal to the
  article revision. `sourceRevision` always equals the English article's
  revision; when the English article changes, every locale moves with it.
- The public route of a page whose copy changed gets a new `lastModified` date
  in `lib/public-routes.ts`.

## Keeping the screenshots aligned

A label change in a locale makes every figure that shows it stale. Recapture with
the existing scripts rather than leaving the old image:

| Figures | Script |
| --- | --- |
| Settings, profile, MCP, installers, Numo, web and mobile | `captures/shots/documentation-refresh/` |
| Board, issue panel, inbox, search, views, notebook | `captures/shots/documentation-work/` |
| Issue creation, statuses, pages, objectives | `captures/shots/documentation-product/` |
| Triage, trash, cycle, date picker, public feedback board | `captures/shots/documentation-reader/` |
| Pull request review, forge sync, repository skills, push devices | `captures/shots/documentation-forge/` |
| Instance administration | `captures/shots/documentation-admin/` |
| Routine trigger editor | `captures/shots/routine-triggers/` |

Lessons that keep captures correct:

- Demo prose (issue titles, descriptions, page text) is translated in read
  responses by exact match through `captures/lib/demo-prose.mjs`; add new demo
  strings to the script's localized fixture in every locale.
- Resolve the demo project and issue ids at runtime: the preview and
  production demo worlds have different ids.
- The demo account's saved app tabs reopen pages and clutter the tab strip;
  open settings tabs explicitly (`?tab=general`, `?tab=overview`) and clear the
  tab strip before full-window captures.
- New demo data goes through the `capture-world` seeds and their guards, with
  the owner's approval, never through the application API.
- Open every produced image before accepting it: localized UI, populated data,
  no spinner, toast or clipped control.
