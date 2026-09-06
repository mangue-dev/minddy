# Focused marketing visuals

The landing uses two complementary kinds of illustration:

- The hero keeps the full board to introduce the workspace at its largest size.
- The feature cards use native status, priority, effort, and checkbox components for the board, notebook, and execution plan. These remain readable on small screens. The notebook interaction is local to the demo.
- Documentation, feedback, keyboard commands, code review, and Numo use focused product photography. The feature cards retain the original 16:10 or 4:3 image ratio. Their lightboxes open the original captures for context.

## Regenerate the focused assets

Run from the repository root:

```sh
node captures/focus-marketing.mjs
```

The script reads the lossless PNGs in `captures/shots/*/out/` and writes 72 WebP variants to `public/captures/focused/`: six shots, six locales, and two themes. It does not connect to an account or change demo data. Original PNGs and full-size public captures stay intact.

The normalized crop rectangles live in the script. The palette and feedback crops include padding so the frame does not cut through menu items or a suggestion. After refreshing a source capture, inspect the corresponding focused light/dark variants in every locale; update the crop if the product layout moved. Preview the landing at mobile, tablet, and desktop widths before committing regenerated assets.

`ScreenshotSlot` opts into these assets with `focused`. Only the six published slots support it. Both picture sources receive responsive `sizes`, and the browser selects the system theme before hydration.
