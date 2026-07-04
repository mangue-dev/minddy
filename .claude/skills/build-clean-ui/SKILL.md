---
name: build-clean-ui
description: Plan, design, and implement polished, accessible, responsive user interfaces with clear hierarchy, durable component structure, and intentional motion. Use when Codex needs to create or refine screens, pages, forms, dashboards, landing pages, design-system primitives, or UI code from mockups/screenshots where the result must feel clean, premium, and non-generic.
---

# Build Clean UI

Build UI that feels designed rather than merely assembled. Favor clarity, hierarchy, consistency, and accessible behavior before decoration.

## Workflow

1. Frame the surface before coding.
- Identify the product type, primary user, primary task, density level, and platform constraints.
- Preserve the existing design system when one already exists. Invent a new visual language only for net-new surfaces.
- Choose one visual direction and one signature detail. Avoid stacking multiple competing ideas.

2. Define the system before the screen.
- Extract or define tokens first: color roles, spacing scale, radius scale, elevation, typography, motion, and breakpoints.
- Prefer semantic tokens such as `--color-bg`, `--color-border-strong`, `--space-300`, and `--radius-md` over raw values spread through components.
- Default to an 8px-based spacing rhythm unless the product already uses another scale.
- Limit accent usage. One accent plus neutrals is the default.

3. Compose the layout from hierarchy.
- Start from information priority. Every screen needs one obvious primary action.
- Use grid for repeated or multicolumn structures. Avoid fragile flexbox width math when grid expresses the layout more cleanly.
- Use cards only when elevation communicates grouping or priority. Prefer spacing, dividers, and alignment over card spam.
- Constrain long-form reading widths. Keep labels and helper text close to their controls.
- Prefer `min-h-[100dvh]` over `h-screen` for full-height mobile surfaces.

4. Implement all real states.
- Ship loading, empty, error, disabled, hover, focus, active, success, and validation states whenever relevant.
- Prefer skeletons sized like the final content over generic spinners.
- Keep form labels persistent. Add helper text when it prevents ambiguity. Place error text inline and close to the field.

5. Add motion only when it clarifies.
- Use motion to explain hierarchy, continuity, or cause and effect.
- Keep one or two meaningful transitions instead of many weak ones.
- Animate `transform` and `opacity` by default. Respect reduced-motion preferences.

6. Run the quality gate before calling the work finished.
- Check keyboard order, visible focus, contrast, target sizes, headings, landmarks, mobile overflow, and localization pressure.
- If tradeoffs are necessary, cut decorative effects before cutting clarity or state coverage.

## Decision Rules

- For existing products, preserve established tokens, spacing, radii, interaction patterns, and component semantics.
- For greenfield work, be bolder on typography and composition, but still make the result system-driven.
- For dashboards and data-dense UI, reduce ornament and increase scanning speed, alignment discipline, and state clarity.
- For marketing pages, allow stronger storytelling and visual signature, but keep CTA hierarchy obvious.
- For mockups, screenshots, or Figma-derived work, extract spacing, type scale, colors, component families, and state variants before writing code.

## Implementation Defaults

- Verify dependencies before importing new libraries.
- Prefer the repo's existing primitives over inventing parallel component APIs.
- Keep interactive logic isolated in small client components when using React or Next.js.
- Use semantic HTML first and ARIA only when native elements do not cover the interaction.
- Name components and tokens by role, not by paint or position.
- Write specific button labels and error messages that tell the user what happens next.

## Read On Demand

- Read `references/web-synthesis.md` when choosing direction, defining tokens, or deciding which cross-source rules matter most.
- Read `references/ui-qa-checklist.md` before final delivery or code review.

## Example Triggers

- "Build a cleaner onboarding flow without breaking the design system."
- "Turn this rough wireframe into a polished, accessible page."
- "Refactor this dashboard so it feels premium instead of generic."
- "Create a form UI with proper states, validation, and keyboard support."
- "Implement this mockup in production code while keeping the UI clean."
