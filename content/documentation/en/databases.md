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
  "revision": 20,
  "sourceRevision": 20,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-14",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/global-page-panel.tsx",
      "lib/page-database-number.ts",
      "lib/page-database-schema-patch.ts",
      "lib/use-page-database.ts",
      "lib/undo/undo-context.tsx",
      "components/pages/database-choice.tsx",
      "components/pages/page-document-actions.tsx",
      "lib/server/database-tool-schema.ts",
      "supabase/migrations/20270109200126_page_database_metadata_recurrence_formats.sql"
    ]
  },
  "review": {
    "revision": 20,
    "fact": "agent:claude-code (MIN-990: number calculations and formats, read-only Last edited, Created by and Last edited by columns, recurring dates, option reordering by handle, entry handle menu, sort direction labels, author filters, undo and redo checked against lib/page-database-number.ts, lib/page-databases.ts, lib/page-database-filters.ts, lib/use-page-database.ts, lib/undo/undo-context.tsx and components/pages/page-database-view.tsx, and exercised in the running app against the preview database; agent review, not human acceptance)",
    "language": "agent:claude-code (en changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-14"
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
      "revision": 20,
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
      "alt": "Database column type picker with a search field, then text, number, selections, date, people, checkbox and the four read-only types.",
      "caption": "Choose a column type that matches the values to store.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-11-14",
      "viewport": [
        448,
        453
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
      "revision": 20,
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
      "revision": 20,
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
      "revision": 20,
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
      "alt": "Component preview of Edit options with localized status options, drag handles, trash buttons and the deletion explanation.",
      "caption": "Edit option names, colors and order together. Drag a handle to reorder; the trash button removes an option from the draft; Save applies the changes. Shown with demonstration data.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-11-14",
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
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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

Open Columns and choose Add column, or use the + column at the table's right edge. Name the column and choose Text, Number, Select, Multi-select, Date, People, Checkbox, Created at, Last edited, Created by or Last edited by. Use the searchable type picker to find it. Save, add an entry and verify that the column appears in the table and entry page.


![Component preview of the new-database cards for Numo setup and importing an existing database.](/documentation/en/database-setup-cards.png)

### Choose types and respect limits {#database-types}

A database supports up to 30 property columns besides the entry name. Select permits one option; Multi-select permits several, with up to 100 options per column. Text cells support 2,000 characters. Number accepts a figure written with a dot or a comma, with thousands separators, a currency sign or a percent sign, and rejects letters. It also accepts a calculation: type `14 + 2` and the cell stores 16. Calculations take `+`, `-`, `*`, `/`, `^` and parentheses, and a percentage inside one applies to what precedes it, so `80 + 20 %` gives 96.

A Number column takes its display from what you type. Type an amount with a currency sign or code, such as `12 €`, `$40` or `40 CHF`, and the whole column shows amounts in that currency. Type one figure followed by a percent sign, such as `25 %`, and the column shows percentages. A plain figure or a calculation leaves the column as it is. To return to plain figures, open the column header menu and choose **Show as plain number**. The format changes how values are displayed and never the stored number. A plain number is shown with thousands separators from five digits on, so a year still reads 2026.

Four column types fill themselves from each entry and cannot be edited: Created at and Last edited show when the entry was created and last changed, Created by and Last edited by show who did it. A change made by Numo or by an MCP agent is shown as made by minddy.

People selects project members rather than arbitrary account emails. Newly mentioned members can receive notifications. A database entry is also a full page with normal content, comments and attachments.

Advanced formulas are not available. Choose a text property or a linked document when the required data does not fit a supported type; do not describe an unsupported formula as a functioning column.


![Database column type picker with a search field, then text, number, selections, date, people, checkbox and the four read-only types.](/documentation/en/database-property-types.png)

## Edit database values and entry pages {#database-cells-and-entries}

In the option editor, add an option below the existing rows, even when the list is empty. Give each option a distinct, nonempty name and save. This works for both Select and Multi-select.

Click a table cell or the property above an entry's page body. Enter saves, Escape cancels, and Shift+Enter inserts a text line. Leaving the editor saves. An invalid number keeps the editor open until fixed; a failed save reverts the value and reports an error.

Use a Select cell for one option or Multi-select for several. Search existing options or create a new option from the menu. Open Edit options from a cell, or from the menu of a Select or Multi-select column header (click the column name), to rename or recolor options, then save together or cancel. Date, People and Checkbox use their matching controls; Created at, Last edited, Created by and Last edited by stay read-only.

New options receive a random palette color that is not yet used in the column, whether you create them from a cell or in the options dialog. Once all ten colors are used, colors can repeat. You can still choose a color manually.

In Edit options, drag the handle at the start of a row to reorder options. From the keyboard, focus the handle, press Space, move the option with the Up and Down arrows and press Space again to drop it; Escape cancels. Use the row's trash button to remove an option. Save applies names, colors, order and deletions together; when you deleted options, it first lists them and asks you to confirm with **Delete and save**. A notification then offers **Undo**, which brings the options back with the values that used them. Deleting an option removes it from every entry that uses it, including entries in the trash; other selected options remain. Cancel discards the draft changes.

Choose a day in Date. To include a time, turn on Add a time and fill Time. The value saves as you edit, and the picker stays open. Timed values appear in your device’s time zone, including midnight. Turning off Add a time keeps the displayed day as a date without a time. Date filters match the displayed calendar day.

A date can repeat, like an issue's due date. In the date picker, choose **Recurring** instead of **Once**, then a rhythm: every day, week, month or year. The cell shows a repeat icon and the next occurrence, which moves forward by itself once the day has passed; sorting and filters use that occurrence. Choose **Once** to keep a single date again.

![Component preview of Edit options with localized status options, drag handles, trash buttons and the deletion explanation.](/documentation/en/database-options.png)

![Component preview of the date picker with July 24, 2026 selected, Add a time enabled and Time set to 02:00 AM.](/documentation/en/database-date-time.png)

### Open, select and insert entries {#entry-actions}

An empty entry body displays a placeholder so you can locate the writing area. From a row action or a multi-row selection, duplication asks for confirmation before creating copies. Moving entries to the trash also asks for confirmation and preserves the recoverable trash workflow rather than permanently deleting them.

Open an entry to edit its full page in a floating panel. Extend opens it as a full page after pending document saves finish. If saving fails, the panel stays open so you can resolve it. The panel header also has the entry's **Page options** menu (`…`) between **Expand** and close; moving the entry to the trash from there closes the panel and leaves the table in place. An empty entry stays in the database until deleted.

Use row checkboxes for a selection and Shift-click for a range. Each checkbox's tooltip reads **Select** or **Deselect**. The header checkbox (**Select all entries**, or **Deselect all** once every entry is selected) shows a dash while only some entries are selected and a check when all are; clicking it from a partial selection selects every entry. Hover a row to show its gutter: the handle opens the entry's menu and can reorder entries in manual order, and the + inserts below the entry; Option/Alt inserts above. Adjacent insertion clears the filters of the active view so the new entry is visible. Checked entries open the floating selection bar: choose **Actions**, or press Command+K on macOS or Ctrl+K on Windows/Linux, to promote them to issues, **Duplicate** them or **Move to trash** them, each behind its confirmation, and **Ask Numo** opens Numo with every checked entry in its context. On a touch screen, rows have no gutter and their checkboxes stay visible; the same selection bar acts on the checked entries, and moving an entry up or down is not available there.

The handle menu of a single entry starts with **Open page**, then offers what the sidebar offers for any page: **Add a sub-page**, **Add to favorites**, **Copy**, **Promote to issue**, **Publish…** and **Export**, followed by **Duplicate** and **Move to trash**. A reader sees **Open page**, **Copy** and **Export**. When the menu targets several selected rows, it keeps **Duplicate** and **Move to trash**.

From that menu, the owner or a Member can choose **Promote to issue** to have Numo turn that entry, its content and its properties into one issue. The entry stays in the database. When the menu targets several selected rows, promote them from the selection bar's **Actions** instead: one Numo conversation creates one issue per entry. The [Pages guide](/docs/pages#promote-page-to-issue) describes Numo’s questions and what to do when the entry cannot be saved first.

### Database views {#database-display}

A database shows its entries through views, listed above the table. Each view keeps its own sort, filter and hidden columns, and every project member sees the same views. The owner or a Member adds a view with **New view** (+), which starts from the view on screen, right-clicks a view to choose **Rename view** or **Delete view**, and drags views to reorder them. Sort, filter and column changes are saved to the active view for everyone. A database keeps at least one view; before its first change it shows the default **Table** view. Readers switch between views and can adjust one for themselves until they leave the page. Your browser remembers the view you last opened; search is never saved. Manual order is shared with the page tree. Scroll horizontally with a trackpad gesture, Shift plus mouse wheel or the scrollbar at the bottom of the window. A touch screen shows no such scrollbar: swipe the table instead. A clipped text preview does not shorten the stored value. Entries with column values can be reordered within their database but cannot be moved outside it. Numo can list a database's views and, when you ask, create, rename, reorder or delete them (never the last one), or change their sort, filters (combined with all or any) and hidden columns. On a database page, Numo takes “a view” to mean the database's views, not the issue board's. Column order is not part of a view: it belongs to the database schema. minddy MCP clients cannot manage views.

Open **Sort by** to choose a column, then a direction worded for what the column holds: **A to Z** or **Z to A** for text and people, **First option first** or **Last option first** for a Select or Multi-select column, which sorts in the order of its options, **Smallest first** or **Largest first** for a number, **Oldest first** or **Newest first** for a date, **Unchecked first** or **Checked first** for a checkbox, and **Top to bottom** or **Bottom to top** for the manual order. The column lists of **Sort by** and **Filter** show each column's type icon.

Drag the right edge of a column header to set the column's width; double-click that edge to return to the default width. Under a Number column, hover the bottom of the table and choose **Calculate** to show the **Sum**, **Average**, **Minimum**, **Maximum** or **Count** of the entries the view keeps. Widths and calculations are saved with the view, like its sort and filters.

Open **Filter** to build a list of conditions with **Add a filter**; **Remove this filter** deletes one. Each condition picks a column, a condition and a value, and the conditions depend on the column type. Text offers contains, does not contain, is, is not, is empty and is not empty. Number offers is, is not, greater than, less than, is empty and is not empty. Select offers is, is not, is empty and is not empty. Multi-select and People offer contains, does not contain, is empty and is not empty. Date, Created at and Last edited offer is on, is after, is before, is empty and is not empty. Created by and Last edited by offer is and is not, with a project member. Checkbox matches **Checked** or **Unchecked**. A condition without a value does not filter yet. With two or more conditions, choose **All filters** to keep the entries that match every condition, or **Any filter** for those that match at least one. A view holds up to 10 conditions; a view saved earlier with a single filter keeps it.

Views update live: a view that a teammate or Numo creates or changes appears without reloading the page. Before a database has a saved view, right-click its default view to choose **Rename view**: renaming saves it as a named view with the current settings, and **Delete view** stays unavailable.

On a phone, pick a view from the dropdown above the table; its menu offers **New view**, **Rename view** and **Delete view**. The toolbar shows only search, **View settings** and **New**. **View settings** opens a sheet with **Sort by**, **Filter** and **Columns**, each opening its own sheet. Search opens a field under the toolbar, with a button to close it. The table runs edge to edge, with taller rows and checkboxes that are always visible. Text and number cells open in a bottom sheet with a **Save** button, as selections, people and dates already do.

A database opened in the side panel, from a mention, a backlink, a page attached to an issue or a link in a comment, uses that compact toolbar on a computer too: the view dropdown, whose menu offers **New view**, **Rename view** and **Delete view**, then search, **View settings** and **New**. Search opens a field in a popover. **View settings** opens a menu: **Sort by** lists the columns and the sort direction in a submenu, while **Filter** and **Columns** each open their popover under the button. The table scrolls sideways inside the panel, with its own scrollbar. An entry opened from that table takes its place in the panel; **Back**, at the top left of the panel, returns to the table, and **Expand** opens what the panel shows as a full page.


![Demonstration entry with a text description, duration 2.5, a checked checkbox and an empty selection.](/documentation/en/database-entry.png)

### Undo and redo {#database-undo}

Press ⌘Z (Ctrl+Z on Windows and Linux) to undo your last change in a database, and ⌘⇧Z (Ctrl+Shift+Z) to redo it. This covers a cell value, a column added, renamed, reordered, converted to another type or deleted, edited options, an entry created, duplicated, reordered or moved to the trash, and the settings of a view: sort, filters, hidden columns, column widths and calculations. Undoing a column or option deletion restores the values it removed. A change made to several selected entries is undone in one step.

The history belongs to the open tab and holds your own changes: it is lost when you reload the page, and it leaves out changes made by teammates, Numo or an MCP agent. While the cursor is in a text field or in a page's body, the same keys undo typing instead. If someone else changed the same value in the meantime, the undo is refused and the table shows the current value.

## Change a database schema safely {#change-a-database-schema}

Column dragging starts after pointer movement and stays horizontal. The grabbing cursor appears only while dragging; a normal click still opens the column actions. With a column header focused, Enter or Space opens its actions. Press F8 to start keyboard reordering, use Left or Right, then Enter to confirm or Escape to cancel.

Use Columns to show or hide properties with the eye control, and drag a row's handle in that list to reorder columns. From the keyboard, focus the handle, press Space, move the column with the Up and Down arrows and press Space again to drop it; Escape cancels. Click or right-click a header to open its menu, for example to rename the column, or drag headers to reorder them; the entry-name column stays first. Select or Multi-select options can be edited from the cell menu or Columns, with names and colors saved together.

Hiding a column changes display preferences rather than deleting its values. To delete a custom column, choose **Delete column** in its header menu or its trash button in Columns; both ask for confirmation. Deletion removes the column's values from every entry. A notification then offers **Undo**, and [undo](#database-undo) brings the column and its values back while the page stays open; after that the deletion is final.

### Convert a property type {#convert-column}

Choose Edit column for a custom property and select its new type. The edit dialog converts existing values when saved. If some values are incompatible, its warning states how many cells will be cleared. Continue only if losing those values is acceptable, or cancel to keep the old type and all values.

Changing to Created at, Last edited, Created by or Last edited by replaces existing values with what minddy records for each entry, and warns before doing so. Review representative entries after conversion, especially where a number, selection or date might be interpreted differently.

Numo and MCP agents read and write the same columns: they can add the read-only columns, set a number format, and write a recurring date. Agent schema edits use the current database revision and a conversion preview token. Concurrent changes invalidate that preview. Re-read and preview again instead of forcing an old conversion; clearing incompatible values requires explicit confirmation.


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
