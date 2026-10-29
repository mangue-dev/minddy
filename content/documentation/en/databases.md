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
  "revision": 19,
  "sourceRevision": 19,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-28",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/database-view-strip.tsx",
      "lib/use-page-database-views.ts",
      "lib/server/page-database-views.ts",
      "components/pages/database-table-scroll.tsx",
      "components/ui/checkbox.tsx",
      "lib/server/database-view-tools.ts",
      "lib/page-database-filters.ts",
      "components/pages/database-filter-editor.tsx",
      "supabase/migrations/20270109200092_page_database_views_realtime.sql",
      "components/pages/page-peek-panel.tsx",
      "components/pages/pages-shell.tsx",
      "components/global-page-panel.tsx"
    ]
  },
  "review": {
    "revision": 19,
    "fact": "agent:claude-code (column header menu Delete column with confirmation and right-click opening, hover-only row gutter, touch-screen rows without gutter, checkbox tooltips and partial header state, bottom scrollbar hidden on touch screens, view rename/delete by right-click, column reordering by handle in Columns, Numo view tools and no MCP view tools checked against components/pages/database-column-name.tsx, page-database-view.tsx, database-view-strip.tsx, database-table-scroll.tsx, components/ui/checkbox.tsx, lib/server/assistant/tools.ts and lib/server/database-view-tools.ts; several filter conditions with All/Any match, operators per column type, up to 10 conditions, single filters kept, live view updates, default view rename, phone view dropdown, View settings sheets, search field and cell sheets checked against lib/page-database-filters.ts, components/pages/database-filter-editor.tsx, lib/use-page-database-views.ts, supabase/migrations/20270109200092_page_database_views_realtime.sql, components/pages/database-view-strip.tsx, components/pages/page-database-view.tsx and components/pages/database-cell-editor.tsx; Page options in the entry side panel checked against components/pages/page-peek-panel.tsx and components/pages/pages-shell.tsx; the side panel's compact database toolbar (view dropdown, search popover, View settings menu with a Sort by submenu and Filter and Columns popovers, in-panel horizontal scrollbar, entries opened in place with Back) checked against components/pages/page-database-view.tsx, components/pages/database-view-strip.tsx, components/pages/database-table-scroll.tsx, components/global-page-panel.tsx and components/pages/page-peek-panel.tsx; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the changed controls)",
    "language": "agent:claude-code (en changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-28"
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
      "revision": 19,
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
      "revision": 19,
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
      "revision": 19,
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
      "revision": 19,
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
      "revision": 19,
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
      "revision": 19,
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
      "alt": "Component preview of the date picker with July 24, 2026 selected, Add a time enabled and Time set to 02:00 AM.",
      "caption": "Turn on Add a time to enter an hour. This component preview uses demonstration data and the device time zone.",
      "revision": 19,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        324,
        498
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

The new-database setup area offers two cards: **Create with Numo** to prepare the structure, and **Import an existing database**. Its close control, labeled **Dismiss database setup**, dismisses these suggestions; manual editing remains available.

As the project owner or a Member, open Pages, use + and choose a database. A new database has its entry name and no optional columns. Its new-database banner offers setup with Numo or importing an existing database. Manual setup remains available without AI. Choosing **Create with Numo** opens a prepared request with this database as page context, after its creation has settled. Review and send that request to ask for the structure you need; merely opening the conversation does not complete the setup. Actual AI work needs a configured provider and available usage or a compatible personal key. Inspect the resulting schema and entries before relying on them.

Open Columns and choose Add column, or use the + column at the table's right edge. Name the column and choose Text, Number, Select, Multi-select, Created at, Date, People or Checkbox. Use the searchable type picker to find it. Save, add an entry and verify that the column appears in the table and entry page.


![Component preview of the new-database cards for Numo setup and importing an existing database.](/documentation/en/database-setup-cards.png)

### Choose types and respect limits {#database-types}

A database supports up to 30 property columns besides the entry name. Select permits one option; Multi-select permits several, with up to 100 options per column. Text cells support 2,000 characters. Number accepts signed decimals with a dot or comma and rejects letters. Created at is the original entry timestamp and cannot be edited.

People selects project members rather than arbitrary account emails. Newly mentioned members can receive notifications. A database entry is also a full page with normal content, comments and attachments.

Advanced formulas are not available. Choose a text property or a linked document when the required data does not fit a supported type; do not describe an unsupported formula as a functioning column.


![Database column type picker with a search field, then text, number, selections, dates, people and checkbox.](/documentation/en/database-property-types.png)

## Edit database values and entry pages {#database-cells-and-entries}

In the option editor, add an option below the existing rows, even when the list is empty. Give each option a distinct, nonempty name and save. This works for both Select and Multi-select.

Click a table cell or the property above an entry's page body. Enter saves, Escape cancels, and Shift+Enter inserts a text line. Leaving the editor saves. An invalid number keeps the editor open until fixed; a failed save reverts the value and reports an error.

Use a Select cell for one option or Multi-select for several. Search existing options or create a new option from the menu. Open Edit options from a cell, or from the menu of a Select or Multi-select column header (click the column name), to rename or recolor options, then save together or cancel. Date, People and Checkbox use their matching controls; Created at stays read-only.

New options receive a random palette color that is not yet used in the column, whether you create them from a cell or in the options dialog. Once all ten colors are used, colors can repeat. You can still choose a color manually.

In Edit options, use the up and down buttons beside a row to reorder options. Use its trash button to remove an option. Save applies names, colors, order and deletions together; when you deleted options, it first lists them and asks you to confirm with **Delete and save**, because the deletion cannot be undone. Deleting an option removes it from every entry that uses it, including entries in the trash; other selected options remain. Cancel discards the draft changes.

Choose a day in Date. To include a time, turn on Add a time and fill Time. The value saves as you edit, and the picker stays open. Timed values appear in your device’s time zone, including midnight. Turning off Add a time keeps the displayed day as a date without a time. Date filters match the displayed calendar day.

![Component preview of Edit options with localized status options, up and down buttons, trash buttons and the deletion explanation.](/documentation/en/database-options.png)

![Component preview of the date picker with July 24, 2026 selected, Add a time enabled and Time set to 02:00 AM.](/documentation/en/database-date-time.png)

### Open, select and insert entries {#entry-actions}

An empty entry body displays a placeholder so you can locate the writing area. From a row action or a multi-row selection, duplication asks for confirmation before creating copies. Moving entries to the trash also asks for confirmation and preserves the recoverable trash workflow rather than permanently deleting them.

Open an entry to edit its full page in a floating panel. Extend opens it as a full page after pending document saves finish. If saving fails, the panel stays open so you can resolve it. The panel header also has the entry's **Page options** menu (`…`) between **Expand** and close; moving the entry to the trash from there closes the panel and leaves the table in place. An empty entry stays in the database until deleted.

Use row checkboxes for a selection and Shift-click for a range. Each checkbox's tooltip reads **Select** or **Deselect**. The header checkbox (**Select all entries**, or **Deselect all** once every entry is selected) shows a dash while only some entries are selected and a check when all are; clicking it from a partial selection selects every entry. Hover a row to show its gutter: the handle opens actions and can reorder entries in manual order, and the + inserts below the entry; Option/Alt inserts above. Adjacent insertion clears the filters of the active view so the new entry is visible. On a touch screen, rows have no gutter and their checkboxes stay visible: select entries, then use **Duplicate** or **Move to trash** in the selection bar. **Promote to issue** and moving an entry up or down are not available there.

From the handle menu of a single entry, the owner or a Member can choose **Promote to issue** to have Numo turn that entry, its content and its properties into one issue. The entry stays in the database. The action is absent when the menu targets several selected rows; there is no bulk promotion, so promote each entry separately. The [Pages guide](/docs/pages#promote-page-to-issue) describes Numo’s questions and what to do when the entry cannot be saved first.

### Database views {#database-display}

A database shows its entries through views, listed above the table. Each view keeps its own sort, filter and hidden columns, and every project member sees the same views. The owner or a Member adds a view with **New view** (+), which starts from the view on screen, right-clicks a view to choose **Rename view** or **Delete view**, and drags views to reorder them. Sort, filter and column changes are saved to the active view for everyone. A database keeps at least one view; before its first change it shows the default **Table** view. Readers switch between views and can adjust one for themselves until they leave the page. Your browser remembers the view you last opened; search is never saved. Manual order is shared with the page tree. Scroll horizontally with a trackpad gesture, Shift plus mouse wheel or the scrollbar at the bottom of the window. A touch screen shows no such scrollbar: swipe the table instead. A clipped text preview does not shorten the stored value. Entries with column values can be reordered within their database but cannot be moved outside it. Numo can list a database's views and, when you ask, create, rename, reorder or delete them (never the last one), or change their sort, filters (combined with all or any) and hidden columns. On a database page, Numo takes “a view” to mean the database's views, not the issue board's. Column order is not part of a view: it belongs to the database schema. minddy MCP clients cannot manage views.

Open **Filter** to build a list of conditions with **Add a filter**; **Remove this filter** deletes one. Each condition picks a column, a condition and a value, and the conditions depend on the column type. Text offers contains, does not contain, is, is not, is empty and is not empty. Number offers is, is not, greater than, less than, is empty and is not empty. Select offers is, is not, is empty and is not empty. Multi-select and People offer contains, does not contain, is empty and is not empty. Date and Created at offer is on, is after, is before, is empty and is not empty. Checkbox matches **Checked** or **Unchecked**. A condition without a value does not filter yet. With two or more conditions, choose **All filters** to keep the entries that match every condition, or **Any filter** for those that match at least one. A view holds up to 10 conditions; a view saved earlier with a single filter keeps it.

Views update live: a view that a teammate or Numo creates or changes appears without reloading the page. Before a database has a saved view, right-click its default view to choose **Rename view**: renaming saves it as a named view with the current settings, and **Delete view** stays unavailable.

On a phone, pick a view from the dropdown above the table; its menu offers **New view**, **Rename view** and **Delete view**. The toolbar shows only search, **View settings** and **New**. **View settings** opens a sheet with **Sort by**, **Filter** and **Columns**, each opening its own sheet. Search opens a field under the toolbar, with a button to close it. The table runs edge to edge, with taller rows and checkboxes that are always visible. Text and number cells open in a bottom sheet with a **Save** button, as selections, people and dates already do.

A database opened in the side panel, from a mention, a backlink, a page attached to an issue or a link in a comment, uses that compact toolbar on a computer too: the view dropdown, whose menu offers **New view**, **Rename view** and **Delete view**, then search, **View settings** and **New**. Search opens a field in a popover. **View settings** opens a menu: **Sort by** lists the columns and the sort direction in a submenu, while **Filter** and **Columns** each open their popover under the button. The table scrolls sideways inside the panel, with its own scrollbar. An entry opened from that table takes its place in the panel; **Back**, at the top left of the panel, returns to the table, and **Expand** opens what the panel shows as a full page.


![Demonstration entry with a text description, duration 2.5, a checked checkbox and an empty selection.](/documentation/en/database-entry.png)

## Change a database schema safely {#change-a-database-schema}

Column dragging starts after pointer movement and stays horizontal. The grabbing cursor appears only while dragging; a normal click still opens the column actions. With a column header focused, Enter or Space opens its actions. Press F8 to start keyboard reordering, use Left or Right, then Enter to confirm or Escape to cancel.

Use Columns to show or hide properties with the eye control, and drag a row's handle in that list to reorder columns. From the keyboard, focus the handle, press Space, move the column with the Up and Down arrows and press Space again to drop it; Escape cancels. Click or right-click a header to open its menu, for example to rename the column, or drag headers to reorder them; the entry-name column stays first. Select or Multi-select options can be edited from the cell menu or Columns, with names and colors saved together.

Hiding a column changes display preferences rather than deleting its values. To delete a custom column, choose **Delete column** in its header menu or its trash button in Columns; both ask for confirmation. Deletion removes the column's values from every entry and cannot be undone. Read that consequence before confirming deletion.

### Convert a property type {#convert-column}

Choose Edit column for a custom property and select its new type. The edit dialog converts existing values when saved. If some values are incompatible, its warning states how many cells will be cleared. Continue only if losing those values is acceptable, or cancel to keep the old type and all values.

Changing to Created at uses each entry's original creation date and warns before replacing existing values. Review representative entries after conversion, especially where a number, selection or date might be interpreted differently.

Agent schema edits use the current database revision and a conversion preview token. Concurrent changes invalidate that preview. Re-read and preview again instead of forcing an old conversion; clearing incompatible values requires explicit confirmation.


![Conversion warning: changing Text to Number clears one incompatible cell, with Cancel and confirmation buttons.](/documentation/en/database-conversion-warning.png)

## Import a database with its entry content {#import-a-database}

Create a database with no optional columns or existing entries. From its new-database banner, choose **Import an existing database**. Upload a Notion Markdown & CSV ZIP with subpages, a database CSV or a minddy database archive. If the archive contains several databases, select the one to import.

Review suggested column names and types, then the page count, before confirming. Numo can suggest types from a small sample when import assistance is configured; manual mapping remains available. Unsupported source properties stay as text. Incompatible values block import rather than being silently cleared.

### What is preserved and what needs checking {#database-import-result}

Import includes entry bodies, nested documents and local files present in the archive. A minddy archive also preserves exact schema and option colors, and remaps internal page/file links. People can be matched to destination project members. A Notion export does not contain its original schema, option colors or formula definitions, so those cannot be recovered from absent information.

Archives are limited to 20 MB compressed, 50 MB expanded, 1,000 pages and 100 attachments. Each attachment retains the 10 MB page-file limit. The database write is transactional. A retry of the same attempt in the open dialog keeps its request identifier, so a completed attempt is returned without duplicating rows. Loading another file or reopening a fresh dialog can create a new attempt. After an uncertain network result, inspect the destination before restarting; an already populated database no longer satisfies the empty-target prerequisite.

After success, inspect sample entries, values, nested pages and attachments. Keep the original archive until that check passes. If import fails, read the first error and correct the format or mapping before retrying; do not fill the destination manually and then assume it still meets the empty-database requirement.


![Import review for a local CSV: two entry pages and two property columns, with the Import database button.](/documentation/en/database-import-review.png)


## Routines for new entries {#entry-routines}

The project owner can choose this database as a routine trigger in [Routines](/docs/scheduled-routines#conditions). Conditions use the entry’s typed properties. An empty entry can stay waiting until its properties are filled. Creation, duplication, database import and an allowed move into the database count as arrivals; restoration does not. Removing a referenced property or changing its type requires correcting the routine filter.
