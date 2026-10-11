# MIN-680 file reader

Show the actual shared React reader with a localized CSV example, the large
Close control and the File actions menu. The isolated fixture uses the real
`FileViewer`, `ImageViewer`, `PreviewViewer`, Mangue buttons/theme provider and
sandboxed CSV renderer. It does not navigate an authenticated account or write
business data. Page-file authorization is covered by the route tests.

Run `node captures/shots/file-preview/shot.mjs <locale>` for each of `en`, `fr`,
`de`, `es`, `it` and `pt-BR`. Each invocation starts one browser/context/page
and closes it in `finally`. The English run checks desktop CSV, phone CSV and
phone dark text. The other runs capture one localized desktop screen. Build
before opening the browser; do not run a compiler or another server during a
capture batch. The script's temporary HTTP server serves only its static
fixture and sample file responses.

Run `node captures/shots/file-preview/shot.mjs en formats` for formatted,
sanitized Markdown and the image reader's click-to-close behavior. It verifies
the two formats and a real cross-origin blob download without adding documentation assets.

Documentation PNGs use native device pixels at scale two, sRGB/grayscale text,
light mode, loaded fonts, full modal/footer bounds and 24 CSS pixels of
transparent margin through `captureDocumentationControl`. Phone screenshots
and assertion records stay under `output/playwright/file-preview`.
