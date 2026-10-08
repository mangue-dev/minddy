# Lowercase documentation branding

The public documentation uses `minddy` in every article, heading, summary, search tag, caption, image alternative and welcome label across all six locales. The operating-responsibility diagrams use the same spelling.

`welcome-fr.png` and `mcp-fr.png` show the local documentation in light mode after the change. The twelve MCP picker and Numo connection-form images in `public/documentation` were recaptured from the real settings components at the original 1440 × 1800 browser viewport. A temporary development fixture supplied an empty MCP-connections query result because the local backend was unavailable. The fixture was removed after capture. No form was submitted, no connection was created and no OAuth consent was executed. These images verify the interface text, not backend connectivity.

`captures.json` records the component bounds and capture method. Existing historical review records retain their original observations. Environment variables, API headers, routes, identifiers and code examples retain their technical spelling.

Validation: `npm run check:documentation`, `npm run check:owned-english`, and `git diff --check`. A corpus audit confirms the changes only alter brand casing and capture dates; OCR checks the two recaptured controls in each locale.
