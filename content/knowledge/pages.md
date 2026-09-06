---
id: pages
title: Project pages
summary: A nested wiki for specifications, decisions, and durable project knowledge.
category: collaboration
audience: end-user
tags: [wiki, page, documentation, spec, notes, markdown]
lastReviewed: 2026-09-06
---

Every project can have a nested wiki of pages. Pages are for durable context: specifications, decisions, conventions, runbooks, onboarding, and the reasoning a ticket depends on. Issues remain the right place for work to be done. Pages support markdown, subpages, attachments, read-only sharing, export, and history.

Page content supports headings, lists, tasks, code, collapsible sections, and colored callouts with editable emoji icons. Callouts keep their icon and palette color in Markdown exports and when agents read or write a page. Published pages can also be shown as tabs beside the project's public feedback board.

Numo and MCP-connected agents can search, read, write, and attach pages to issues or objectives. When answering a question about project-specific decisions, Numo should search and read the relevant pages instead of guessing. A linked page is a live resource: its title continues to update if the page is renamed.

## Page databases

Use the **+** menu in Pages to create a page or a database. A database starts with Date, People, and Checkbox columns. Add Text, Number, Select, Multi-select, Created at, or more columns of the initial types using **Add column** in **Columns** or the **+** column at the right edge of the table. The creation dialog has a searchable column-type picker. Numbers accept signed decimals (with a dot or comma) and reject letters. Created at shows the entry’s original creation timestamp and cannot be edited.

Select allows one option; Multi-select allows several. Search existing options or create a new one directly in the cell menu. Choose **Edit options** there or in Columns to open the options dialog. Edit names in fixed-size fields, choose colors with compact swatches, then save all changes together or cancel. Single-select badges are pills; multi-select badges have square corners. Both use tinted backgrounds and matching text without color dots.

Use the eye beside a column to show or hide it. Click a column header to rename it, or choose **Edit column** to change the type of a custom column. The edit dialog converts existing values when you save a new type. If some values cannot be converted, a warning tells you how many cells will be cleared. Continue to convert compatible values and clear only incompatible cells, or cancel to keep the column and all its values. Changing to Created at uses each entry’s original creation date and warns before replacing existing values.

The header highlights on hover and uses a pointer cursor. Drag a header to reorder columns; the Name column always stays first. The cursor changes when dragging starts. You can also reorder or delete columns in the Columns menu. Deleting a column removes its values from every entry and cannot be undone.

Each database entry is a full page. Open an entry from the list to edit it in a floating panel, then choose **Extend** to open it as a full page. Extend waits for pending document saves and keeps the panel open if saving fails. An empty entry remains in the database until you delete it.

Edit values by clicking anywhere in their list cell or above an entry's page content. List rows are 40 px tall and clip long values; text previews are shortened without changing the saved text. Text and number editors overlay the cell, expand without moving other rows, and remain inside the visible viewport. Enter saves, Escape cancels, and Shift+Enter adds a line to text. Leaving the editor saves; a failed save keeps the draft open. One person appears with an avatar and name, while multiple people appear as overlapping avatars. People selects one or more project members and notifies newly mentioned members. Search, filter, sort, and hide columns in the single list view. These display preferences are remembered on your device. Manual ordering is shared with the page tree. The table reaches the right edge while the page title and controls keep their margins. All data columns scroll horizontally. Only the row-selection checkbox stays overlaid at the left edge; it appears on row hover or while selected, and remains accessible by keyboard. Horizontal scrolling is available at the bottom of the screen, with keyboard support, and does not cover the table rows.

Hover over an entry to reveal its gutter. The handle opens entry actions and can drag entries in manual order. Select several entries with their checkboxes, or Shift-click to select a range, then duplicate or delete the selection. The gutter **+** inserts below that entry; hold **Option/Alt** to insert above. Adjacent insertion returns to manual order and clears filters so the new entry is visible.

Database entries support the usual rich text editor, comments, attachments, duplication, and trash restoration. Markdown and PDF exports include database entries and their column values. Published database pages only show entries included in the published branch; publishing a database without its children keeps their content private. Numo reads database schemas, option definitions, entry values, and creation timestamps through page tools. It can create databases and entry pages and update schemas or individual values using the same access checks and conflict protection as the interface.

Advanced formulas, automations, and additional database views are not part of page databases.
