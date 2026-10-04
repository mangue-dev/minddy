# Keyboard navigation cheat sheet

MIN-635 adds Control+Shift number-row shortcuts for tabs 1–10, Mod+Shift
horizontal arrows for adjacent tabs, and Mod+Shift vertical arrows for visible
sidebar options. Control is also used on macOS so the numbered shortcuts avoid
the system's Command+Shift screenshot combinations.

The light-mode English and French PNGs show the actual `KeyboardCheatsheet`
component, rendered with the application's compiled CSS and message catalogs in
an isolated browser fixture. The fixture mounts `KeyboardProvider` and
`SidebarNavRail` with a local tab-session stub; it does not use an authenticated
account or contact the application backend. Screenshots are cropped to the
unfiltered dialog at a 1280 × 1000 viewport.

The first five Navigation rows must be visible with their modifier, Shift, and
number/arrow key caps. The numbered row explains that 0 selects tab 10. Sidebar
labels refer to the displayed sidebar. The dialog remains scrollable because
all existing shortcuts follow the new rows.

These are pull-request review captures, not marketing screenshot slots.
