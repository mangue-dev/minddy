# Relation visibility (MIN-603)

Show the same dependency model on issue cards, side panels and objective boards.
The screenshots use the Aurora demo account with browser-only API response
fixtures: no issues, objectives or relations are created or edited in the database.

- `compact-card.png`: incoming blockers, outgoing blockers and related targets grouped independently; the issue identifier stays on one line.
- `inherited-blockers.png`: an issue and an objective blocking the ticket through its objective membership.
- `issue-sidebar.png`: grouped relations, distinct objective identity and links back to the objective responsible for an inherited blocker.
- `objective-board-header.png`: the relation summary follows the objective target date.
- `objective-board-relations.png`: navigable issue and objective targets in the board relation panel.
- `objective-detail.png`: the objective detail screen exposes outgoing blockers and related issues with clickable targets.
- `objective-picker-dark.png`: searchable objective targets with their color and status, in dark mode.
- `resolved-blockers.png`: completed blockers stay inspectable with a resolved badge while inherited warnings disappear from member cards.

Captured against the local development server at a 1792 × 1120 viewport. Narrow
390 × 844 rendering was also checked: the issue panel fits the viewport, and issue
identifiers retain `white-space: nowrap`. Clicking a target closes its relation
popover and opens the correct issue panel. Objective and issue relation titles
were verified to use the same computed font size of 14 px.
