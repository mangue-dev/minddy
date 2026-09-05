# MIN-494 MCP server page redesign

Continue PR #133 on `codex/min-494-landing-redesign`, following the landing,
pricing, and download pages already reviewed in this branch.

- [x] Rebuild the hero with shared sans-serif typography and spacing, a pastel
  endpoint card, and a matching authorization summary.
- [x] Present the seven agents and assistant setup prompt in a unified pastel
  grid. Keep configurations generated from `MCP_AGENTS` and present in server
  HTML, with exact copy actions and readable, scrollable code blocks.
- [x] Add a localized, expandable product screenshot alongside capabilities;
  redesign practical prompts and authorization as spacious colored cards.
- [x] Refine the six locale catalogs while retaining configuration values,
  prompt interpolation, FAQ/SEO data, anchors, and tracked signup access.
- [x] Verify clipboard values, keyboard scrolling/focus, FAQ expansion,
  screenshots, no-JavaScript content, responsive locales/themes, focused tests,
  lint, TypeScript, owned English, and the signed PR. Synchronize MIN-494.

- [x] Place the wider assistant setup card first, remove copy buttons from the
  three workflow examples, and remove the pricing link below the FAQ.

## Validation

- 96 tests passed across translated messages, locale parity, public client
  message boundaries, agent logos, SEO, and public routes.
- Focused Oxlint, TypeScript, owned-English, and whitespace checks passed.
- Browser layout checks passed in six locales at 320, 390, 768, 1024, and
  1440 px, in light and dark themes (60 configurations), without horizontal
  page overflow. Verified the wider first setup card and all code regions.
- 54 copy actions returned the exact endpoint, agent artifact, or localized
  assistant prompt. Clipboard writes were captured in an isolated browser stub;
  commands were compared with the shared registry and were not executed.
- Verified all three example prompts remain visible without copy buttons,
  the FAQ has no pricing link, and FAQ expansion works in every locale.
- With JavaScript disabled, verified all seven configurations, assistant prompt,
  FAQ answer text, structured data, and localized full-image links in six locales.
- Checked keyboard code scrolling and copying, the connection anchor, and the
  screenshot preview with Escape/focus return and uncropped mobile geometry.
- Visually reviewed the hero, connection cards, workflow examples, dark product
  section, and final desktop/mobile layout after review feedback.
- Changes are limited to the MCP page, its six translation catalogs, and this
  checklist. Generated artifacts, dependencies, migrations, deployment files,
  and excluded source paths are untouched.
