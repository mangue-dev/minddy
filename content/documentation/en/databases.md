---
{
  "id": "databases",
  "locale": "en",
  "title": "Databases",
  "summary": "Create a database, edit values and entry pages, change its schema and import a complete database safely.",
  "topic": "Pages and databases",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P08",
    "P09",
    "P10",
    "P11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 15,
  "sourceRevision": 15,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate; MIN-684 page promotion; MIN-743 destructive-action confirmations; UI/UX refinements batch: Edit options from the column header",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/pages.md",
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts",
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "components/pages/database-column-name.tsx",
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts",
      "lib/database-import/types.ts",
      "lib/database-import/archive.ts",
      "components/pages/page-database-properties.tsx",
      "components/date-time-picker.tsx",
      "lib/page-databases.ts",
      "scripts/page-database-date-times.integration.test.mjs",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx"
    ]
  },
  "review": {
    "revision": 15,
    "fact": "agent:/root (optional-time and option-control source, component and isolated SQL review; unchanged claims retain prior evidence); agent:/root (MIN-690 recapture of create-a-database-steps on next dev at 8371778c4 with a throwaway database; other figures unchanged, evidence retained); agent:/root (MIN-684 page promotion: source and focused unit-test review of the menu entries, reader gating, save-before-promote and the Numo request; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-743 destructive-action confirmations: source review of the confirmation dialogs for option deletion on Save in Edit options; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (UI/UX refinements batch: source review of the Edit options entry of Select and Multi-select column header menus in components/pages/database-column-name.tsx, which opens the same options dialog as the cells; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (en changed-passage and figure parity self-review); agent:/root (en updated alt text for the column type picker; agent review, not human acceptance); agent:/root (en MIN-684 single-entry promotion passage with catalog UI labels; agent review, not human acceptance); agent:/root (en MIN-743 confirmation clauses with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (en Edit options from the column header changed passage with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "pages"
  ],
  "aliases": [
    "create-a-database",
    "database-cells-and-entries",
    "change-a-database-schema",
    "import-a-database"
  ],
  "tags": [
    "Create a database and its columns",
    "Edit database values and entry pages",
    "Change a database schema safely",
    "Import a database with its entry content"
  ],
  "figures": [
    {
      "id": "database-setup-cards-preview",
      "kind": "screenshot",
      "src": "/documentation/en/database-setup-cards.png",
      "alt": "Component preview of the new-database cards for Numo setup and importing an existing database.",
      "caption": "New-database suggestions, shown with demonstration data. Choose Numo setup or import, or dismiss the cards to continue manually.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        712,
        240
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    },
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/en/database-property-types.png",
      "alt": "Database column type picker with a search field, then text, number, selections, dates, people and checkbox.",
      "caption": "Choose a column type that matches the values to store.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-18",
      "viewport": [
        448,
        357
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/en/database-entry.png",
      "alt": "Demonstration entry with a text description, duration 2.5, a checked checkbox and an empty selection.",
      "caption": "Open an entry to read its complete text and edit typed values.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        429
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/en/database-conversion-warning.png",
      "alt": "Conversion warning: changing Text to Number clears one incompatible cell, with Cancel and confirmation buttons.",
      "caption": "Review the real incompatible-cell count before confirming a type change. Cancel preserves the current values.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        456,
        282
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/en/database-import-review.png",
      "alt": "Import review for a local CSV: two entry pages and two property columns, with the Import database button.",
      "caption": "Review the parsed entries and column count before importing into the empty database.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        744,
        511
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-options-preview",
      "kind": "screenshot",
      "src": "/documentation/en/database-options.png",
      "alt": "Component preview of Edit options with localized status options, up and down buttons, trash buttons and the deletion explanation.",
      "caption": "Edit option names, colors and order together. The trash button removes an option from the draft; Save applies the changes. Shown with demonstration data.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        560,
        448
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-date-time-preview",
      "kind": "screenshot",
      "src": "/documentation/en/database-date-time.png",
      "alt": "Component preview of the date picker with October 12, 2026 selected, Add a time enabled and Time set to 14:30.",
      "caption": "Turn on Add a time to enter an hour. This component preview uses demonstration data and the device time zone.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        324,
        444
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "create-a-database-steps",
    "database-cells-and-entries-steps",
    "change-a-database-schema-steps",
    "import-a-database-steps"
  ]
}
---

A database combines a table of typed properties with a full page for each entry. Create columns and edit entries manually or import an existing database into an empty target. Before changing a property type or deleting a column, review which stored values will be replaced or lost.

## Create a database and its columns {#create-a-database}

The new-database setup area offers two cards: ask Numo to prepare the structure or import an existing database. Its close control has a tooltip and dismisses these suggestions; manual editing remains available.

As a project member, open Pages, use + and choose a database. A new database has its entry name and no optional columns. Its new-database banner offers setup with Numo or importing an existing database. Manual setup remains available without AI. Choosing setup with Numo opens a prepared request with this database as page context, after its creation has settled. Review and send that request to ask for the structure you need; merely opening the conversation does not complete the setup. Actual AI work needs a configured provider and available usage or a compatible personal key. Inspect the resulting schema and entries before relying on them.

Open Columns and choose Add column, or use the + column at the table's right edge. Name the column and choose Text, Number, Select, Multi-select, Created at, Date, People or Checkbox. Use the searchable type picker to find it. Save, add an entry and verify that the column appears in the table and entry page.


![Component preview of the new-database cards for Numo setup and importing an existing database.](/documentation/en/database-setup-cards.png)

### Choose types and respect limits {#database-types}

A database supports up to 30 property columns besides the entry name. Select permits one option; Multi-select permits several, with up to 100 options per column. Text cells support 2,000 characters. Number accepts signed decimals with a dot or comma and rejects letters. Created at is the original entry timestamp and cannot be edited.

People selects project members rather than arbitrary account emails. Newly mentioned members can receive notifications. A database entry is also a full page with normal content, comments and attachments.

Advanced formulas and additional database views are not available. Choose a text property or a linked document when the required data does not fit a supported type; do not describe an unsupported formula as a functioning column.


![Database column type picker with a search field, then text, number, selections, dates, people and checkbox.](/documentation/en/database-property-types.png)

## Edit database values and entry pages {#database-cells-and-entries}

In the option editor, add an option below the existing rows, even when the list is empty. Give each option a distinct, nonempty name and save. This works for both Select and Multi-select.

Click a table cell or the property above an entry's page body. Enter saves, Escape cancels, and Shift+Enter inserts a text line. Leaving the editor saves. An invalid number keeps the editor open until fixed; a failed save reverts the value and reports an error.

Use a Select cell for one option or Multi-select for several. Search existing options or create a new option from the menu. Open Edit options from a cell, or from the menu of a Select or Multi-select column header (click the column name), to rename or recolor options, then save together or cancel. Date, People and Checkbox use their matching controls; Created at stays read-only.

New options receive a random palette color that is not yet used in the column, whether you create them from a cell or in the options dialog. Once all ten colors are used, colors can repeat. You can still choose a color manually.

In Edit options, use the up and down buttons beside a row to reorder options. Use its trash button to remove an option. Save applies names, colors, order and deletions together; when you deleted options, it first lists them and asks you to confirm with **Delete and save**, because the deletion cannot be undone. Deleting an option removes it from every entry that uses it, including entries in the trash; other selected options remain. Cancel discards the draft changes.

Choose a day in Date. To include a time, turn on Add a time and fill Time. The value saves as you edit, and the picker stays open. Timed values appear in your device’s time zone, including midnight. Turning off Add a time keeps the displayed day as a date without a time. Date filters match the displayed calendar day.

![Component preview of Edit options with localized status options, up and down buttons, trash buttons and the deletion explanation.](/documentation/en/database-options.png)

![Component preview of the date picker with October 12, 2026 selected, Add a time enabled and Time set to 14:30.](/documentation/en/database-date-time.png)

### Open, select and insert entries {#entry-actions}

An empty entry body displays a placeholder so you can locate the writing area. From a row action or a multi-row selection, duplication asks for confirmation before creating copies. Moving entries to the trash also asks for confirmation and preserves the recoverable trash workflow rather than permanently deleting them.

Open an entry to edit its full page in a floating panel. Extend opens it as a full page after pending document saves finish. If saving fails, the panel stays open so you can resolve it. An empty entry stays in the database until deleted.

Use row checkboxes for a selection and Shift-click for a range. The handle opens actions and can reorder entries in manual order. The gutter + inserts below an entry; Option/Alt inserts above. Adjacent insertion switches back to manual order and clears filters so the new entry is visible.

From the handle menu of a single entry, the owner or a Member can choose **Promote to issue** to have Numo turn that entry, its content and its properties into one issue. The entry stays in the database. The action is absent when the menu targets several selected rows; there is no bulk promotion, so promote each entry separately. The [Pages guide](/docs/pages#promote-page-to-issue) describes Numo’s questions and what to do when the entry cannot be saved first.

### Display preferences {#database-display}

Search, filter, sort and hide columns in the single list view. These preferences are remembered on your device; manual order is shared with the page tree. Scroll horizontally with a trackpad gesture, Shift plus mouse wheel, touch or the bottom scrollbar. A clipped text preview does not shorten the stored value. Entries with column values can be reordered within their database but cannot be moved outside it.


![Demonstration entry with a text description, duration 2.5, a checked checkbox and an empty selection.](/documentation/en/database-entry.png)

## Change a database schema safely {#change-a-database-schema}

Column dragging starts after pointer movement and stays horizontal. The grabbing cursor appears only while dragging; a normal click still opens the column actions. With a column header focused, Enter or Space opens its actions. Press F8 to start keyboard reordering, use Left or Right, then Enter to confirm or Escape to cancel.

Use Columns to show or hide properties with the eye control. Click a header to rename it or drag headers to reorder them; the entry-name column stays first. Select or Multi-select options can be edited from the cell menu or Columns, with names and colors saved together.

Hiding a column changes display preferences rather than deleting its values. Deleting a custom column removes its values from every entry and cannot be undone. Read that consequence before confirming deletion.

### Convert a property type {#convert-column}

Choose Edit column for a custom property and select its new type. The edit dialog converts existing values when saved. If some values are incompatible, its warning states how many cells will be cleared. Continue only if losing those values is acceptable, or cancel to keep the old type and all values.

Changing to Created at uses each entry's original creation date and warns before replacing existing values. Review representative entries after conversion, especially where a number, selection or date might be interpreted differently.

Agent schema edits use the current database revision and a conversion preview token. Concurrent changes invalidate that preview. Re-read and preview again instead of forcing an old conversion; clearing incompatible values requires explicit confirmation.


![Conversion warning: changing Text to Number clears one incompatible cell, with Cancel and confirmation buttons.](/documentation/en/database-conversion-warning.png)

## Import a database with its entry content {#import-a-database}

Create a database with no optional columns or existing entries. From its new-database banner, choose import an existing database. Upload a Notion Markdown & CSV ZIP with subpages, a database CSV or a minddy database archive. If the archive contains several databases, select the one to import.

Review suggested column names and types, then the page count, before confirming. Numo can suggest types from a small sample when import assistance is configured; manual mapping remains available. Unsupported source properties stay as text. Incompatible values block import rather than being silently cleared.

### What is preserved and what needs checking {#database-import-result}

Import includes entry bodies, nested documents and local files present in the archive. A minddy archive also preserves exact schema and option colors, and remaps internal page/file links. People can be matched to destination project members. A Notion export does not contain its original schema, option colors or formula definitions, so those cannot be recovered from absent information.

Archives are limited to 20 MB compressed, 50 MB expanded, 1,000 pages and 100 attachments. Each attachment retains the 10 MB page-file limit. The database write is transactional. A retry of the same attempt in the open dialog keeps its request identifier, so a completed attempt is returned without duplicating rows. Loading another file or reopening a fresh dialog can create a new attempt. After an uncertain network result, inspect the destination before restarting; an already populated database no longer satisfies the empty-target prerequisite.

After success, inspect sample entries, values, nested pages and attachments. Keep the original archive until that check passes. If import fails, read the first error and correct the format or mapping before retrying; do not fill the destination manually and then assume it still meets the empty-database requirement.


![Import review for a local CSV: two entry pages and two property columns, with the Import database button.](/documentation/en/database-import-review.png)


## Routines for new entries {#entry-routines}

The project owner can choose this database as a routine trigger in [Routines](/docs/scheduled-routines#conditions). Conditions use the entry’s typed properties. An empty entry can stay waiting until its properties are filled. Creation, duplication, database import and an allowed move into the database count as arrivals; restoration does not. Removing a referenced property or changing its type requires correcting the routine filter.
