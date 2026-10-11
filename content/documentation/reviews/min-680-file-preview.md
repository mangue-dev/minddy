# MIN-680 shared file reader review

Date: 2026-10-12. Reviewer: agent:/root. This is agent factual, language and
visual review, not human reader acceptance or an authenticated account rehearsal.

The audience is a project member reading issue resources or page attachments.
Workflows W08 and P04 retain their stable sections in `issues` revision 10 and
`pages` revision 9, respectively, in all six locales. The changed outcome is a
full-window file preview with Close and a File actions menu. Unsupported files
retain downloads; published and external file blocks retain their signed
download dispositions. Published images use the common reader without Remove.

## Factual evidence

`components/image-viewer.tsx` supplies the native top-layer dialog and body
portal, scroll containment, focus restoration, reduced-motion behavior and
image thumbnail transition. `components/file-viewer.tsx` shares inert text,
sanitized Markdown, sandboxed document/CSV frames and audio/video controls.
`ResourcePills` preserves each resource's removal gate. Page blocks expose
removal only when the editor is editable; that action removes the document
block rather than promising immediate deletion of stored bytes.

The page file route checks authentication, project access, the file row and
its storage namespace before redirecting preview requests to the existing
attachment proxy. The proxy retains its response-level sandbox and CSV
renderer. Explicit downloads take precedence over preview parameters. URL
helpers leave published/external signatures and download dispositions intact.
Cross-origin image downloads save fetched bytes through a temporary blob URL.

Focused tests cover the body portal under a transformed ancestor, literal
text, CSV with generic/plain MIME metadata, loading failure and fetch abort,
menu navigation/Escape/Space, read-only and per-resource removal permissions,
blob downloads and visible download failures, unmount scroll/focus restoration, private page-file previews,
modified-click downloads and denied project/storage access.

## Language and illustration review

The complete new instructions in en, fr, de, es, it and pt-BR retain the same
formats, entry points, exact translated controls, keyboard dismissal, removal
permissions and publication/download boundaries. All three new runtime keys
have equivalents in each message set. Existing article procedures, screenshots,
capture dates and compatibility evidence remain applicable. Their figure
revision markers advance with the guides without claiming new captures.

Figures `issue-file-preview` and `page-file-preview` share a new localized
`file-preview.png` in each locale. They show the actual shared React reader
and CSV renderer with sample data in an isolated fixture. They demonstrate
controls and layout, not a completed project upload or account operation.
`captures/shots/file-preview/shot.mjs` records viewport-wide native dialog
bounds despite a transformed source pane, keyboard focus and menu containment.
It uses one browser/context/page per bounded locale run, scale two, sRGB,
grayscale text and `captureDocumentationControl` with transparent 24-pixel
margins. Desktop light, phone light and phone dark layouts were inspected.
A separate two-format run verifies sanitized Markdown, content interaction,
image dismissal, focus restoration and a real cross-origin blob download. No demo account or business data was
written. The localized browser evidence is in
`min-680-file-preview-captures.json`.

## Verification

- Eight focused suites pass, 135 tests covering the reader, callers, file URLs,
  authorization and CSV rendering.
- TypeScript, targeted lint, documentation, knowledge, owned-English and
  whitespace checks pass. The publication check also passes: 252 locale
  articles and 92/92 workflows published across all six locales. This ticket
  does not deploy or freeze a desktop release.
