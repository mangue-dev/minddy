# Version changelog review captures

These review images show the public release changelog using its verified local
history fallback. They are PR evidence and have no landing-page slot or runtime
asset import.

- `changelog-light.webp`: English desktop, 1440 × 1100, with the large lead tile
  and adjacent illustrated feature.
- `changelog-detail.webp`: the lead feature's full details in a native modal.
- `changelog-fr-mobile.webp`: French mobile, 390 × 844, with a single-column bento.

The browser used light mode, reduced motion, loaded local fonts, and no account
or production database. Each WebP is a lossless conversion of its browser PNG.
The page was also checked in all six locales for overflow at 390 px, in French
at 320 px, for keyboard focus, pagination, and historical feature/version links.
A temporary local harness verified nested detail Escape behavior in the actual
in-app responsive dialog at 1440 and 390 px; that harness was removed afterward.
