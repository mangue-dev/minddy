# The ticket and its implementation plan

> **This capture is no longer connected to the landing.** Since 2026-07-26,
> location `workflowIssue` is served by `shots/issue-create`: the first
> time is called “You describe” and now shows the gesture of
> the user — the creation modal — instead of the plan written by the agent.
>
> The file is kept as is: the script works, the intention is correct, and the
> plan remains the best visual proof that tasks are monitored data.
> If he had to be shown again, his place would be SECOND time (“Agent Numo
> executes"), the text of which now says "he writes his plan". It would be necessary
> then a location of its own, `workflowAgent` being taken by the run.

Landing location (historical): `workflowIssue`, first of three stages of the section
“From ticket to pull request”. The text next to the image says: *“The agent
transforms the description into an implementation plan: ordered tasks that
name the files to touch, stored on the ticket itself. »* It is this
phrase que l'image doit prouver.

## Ce que l'image doit montrer

- The open **AUR-2** ticket: its identifier, its title.
- The **Plan** tab selected, with its `2/6` counter and the bar
progress — proof that tasks are tracked data, not a
  paragraphe.
- The **six tasks** in three states visible at a glance: two checked and
crossed out, one in progress (full box, bold text), three to do.
- **real file paths** in tasks (`lib/palette/actions.ts`,
`components/palette/row.tsx`, `components/palette/provider.tsx`): this is
literally what the landing sentence promises.
- The project board behind, blurred by the veil of the panel — the ticket is
opened *in* the application, not in an isolated page.

## Or

`/projects/6cd36606-c297-4920-8ce3-31b5f3697be8` on `https://www.minddy.app`,
connected to Camille Roy, AUR-2 card clicked then Plan tab.

## The instruction in the catalog is false, and on two points

`screenshot-slots.ts` asks for “the details of an issue with its description **AND**
its visible implementation plan", on the road
`/projects/<id>/issues/<identifier>`.

1. **This route does not exist.** There is no detail page: a ticket
opens in a side panel placed on the board (`IssueSidePanel`), and the
deep link is `?issue=<uuid>`.
2. **Description and plan are two tabs**, therefore mutually exclusive
(`Tabs value={tab}` in `issue-side-panel.tsx`). Show them together
would require modification of the product.

The intention follows the product: it is the **Plan** tab that we photograph. It is
also the one that the landing describes — the description is in two sentences that we
already reads in the text of the section, the plan is what cannot be shown
qu'en image.

## Framing — why 1447 × 1085 and not 1736 × 1085

The frame of this location is **4/3**, and `<ScreenshotSlot>` renders the image in
`object-cover`. A 16/10 capture would lose 17% of its width, cropped separately
equal on both sides — i.e. ~145 px on the right, where the
the panel. The image would be cut right into the shot.

We therefore keep the **common height of 1085 px** and reduce the width to
**1447** (= 1085 × 4/3). Two effects, both intended:

- the vertical composition remains that of the captures already published — even
header, same height of columns, same amount of empty space at the bottom;
- the panel occupies 32% of the width instead of 26%, and the plan remains
readable in a frame displayed around 530 px on the landing.

The scale increases by 20% compared to 16/10 captures. This is the assumed price:
extending the window to 1302 px would have kept the scale the same but left
a third of the image in empty gray, the board like the panel stopping well
before the bottom of the frame.

**This is the rule of five slots in 4/3 frame** — `workflowIssue`,
`workflowAgent`, `workflowPr`, `numoPanel`, `scratchpad`. Locations
16/10 gardent 1736 × 1085.

## Variations

fr/light, fr/dark, en/light, en/dark

## Known pitfalls

- **The Plan tab is designated by its rank, not by its label.** The label
is “Plan” in both languages ​​today, but the `2/6` counter is there
pasted (`Plan2/6` in accessibility tree): an exact match on
the text would break on the first ticket whose plan changes size.
- **The panel always opens to Description** (`initialTab = "description"`,
and deep link `?issue=` forces it). You have to click on the tab.
- **Check contents by file paths.** `lib/palette/actions.ts`
is a piece of data, identical in FR and EN: it is the control anchor. A
checking “To do” or “finished” would break every other variation.
- **The board tab bar arrives after the tickets** (separate request):
she is blurred behind the panel, but her absence would be noticeable. We wait
the default view tab before opening the ticket, as for the palette.
