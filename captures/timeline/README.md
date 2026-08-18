# captures/timeline/

**Local** tool, to watch Minddy's interface move. Not a product, not
deployed, no one else launches it.

```bash
npm run captures:timeline     # → http://localhost:4321
```

## Why does it exist

Captures overwrite: `out/en-light.png` is rewritten every run, and it's
the commit that keeps the old version. Git stores each version **in full**
(PNGs do not “differ”, each commit carries a complete blob), so everything
the visual history is already there — it just lacked something to look at it.

## The two histories

L'outil en croise deux, qui **ne se superposent pas** :

| Source | What she says | Granularity |
| --- | --- | --- |
| git | what the image looked like | one version per commit that affects it |
| `history.jsonl` | why it was redone | one line per run, verdict included |

hero-board has 7 runs for 4 image versions: several attempts before a `ok`
fall in the same commit. The run log is therefore displayed **next** to the
versions, not matched line by line — automatically bringing them together would be a
invented correspondence.

## What is measured

- **Retard en commits** — commits touchant `app/`, `components/` ou `lib/` entre
the capture commit and HEAD. It's the number that says which image lies
on the state of the interface. You already wrote it down by hand in the notes
(“refresh after 210 commits”); it is calculated now.
- **Difference in pixels** between two successive versions, via `sharp`. The pictures
are reduced to 480 px wide before comparison: at full resolution the
figure is the same to within 0.1% for additional seconds of calculation. A delta
channel under 12 is ignored — that's re-encoding, not interfacing.
- **Folded identical blobs**: a restarted capture which renders exactly the
same image does not add a version.
- **Work in progress**: an uncommitted modified PNG appears at the top of the timeline,
in purple. This is the version we want to compare during a pass.

When the framing changes (hero-board went from 1440×900 to 1736×1085), the
curtain stretches the image to superimpose: the tool says it clearly under the
comparison rather than believing in the percentage.

## The curtain

Two superimposed versions, a handle that slides. Click on a version of the
rail to put it in **A**, shift+click for **B**. `←` `→` move the handle
(shift to go faster), shift+hover makes it follow the cursor.

## Cache

`.cache/` (ignored) contains the extracted blobs and metrics. Everything is derived
from git: deleting it loses nothing, the first subsequent launch rebuilds it
(~8 s for 128 blobs). **Refresh** rereads the repository without restarting, and does not
as new blobs.
