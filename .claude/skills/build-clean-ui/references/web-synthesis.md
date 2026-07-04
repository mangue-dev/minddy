# Web Synthesis

Use this reference when the task is ambiguous, when a new UI direction must be chosen, or when a surface needs both polish and production discipline.

## Cross-Source Consensus

### 1. Pick a direction before styling

- Start from user goals, page purpose, and constraints before touching colors or effects.
- Commit to one visual thesis and one memorable detail instead of combining many unrelated ideas.
- Make the interface feel intentional, not random.

This principle is reinforced by existing UI skills such as `frontend-design` and `frontend-agent`, which both start from purpose, target surfaces, constraints, and desired polish before implementation.

### 2. Make the system do most of the work

- Define semantic tokens for color, spacing, radius, typography, elevation, and motion.
- Reuse a limited spacing scale and radius scale. Resist ad hoc values.
- Prefer component roles over one-off styling.

Material Design and Atlassian both push a consistent grid-and-token mindset. Material anchors layout to an 8dp baseline and a responsive column system. Atlassian explicitly frames tokens as the single source of truth for UI decisions and builds spacing from an 8px base unit.

### 3. Organize layout by hierarchy, not decoration

- Give every screen one obvious primary action.
- Use grid for repeatable structure and predictable reflow.
- Constrain reading width for text-heavy surfaces.
- Use cards only when elevation communicates hierarchy. Do not box every region by default.

Existing UI skills repeatedly favor hierarchy, density control, and state clarity over extra chrome. This is where many generic agent-built interfaces fail.

### 4. Design responsive behavior as a first-class concern

- Start mobile-first.
- Let content decide breakpoints when possible.
- Use container queries for components whose layout depends on their own available space.
- Avoid viewport assumptions and JS layout measurement when CSS can solve the problem.

Material Design emphasizes breakpoint-driven reflow and a 12-column grid. MDN and platform-oriented web-design skills emphasize container queries and content-based breakpoints for more robust components.

### 5. Treat accessibility as part of the design, not a finishing pass

- Use semantic HTML before ARIA.
- Keep heading order logical.
- Give every control an accessible name.
- Keep focus visible and unobscured.
- Label forms explicitly.
- Link errors to fields.
- Provide keyboard access for every interaction.
- Meet contrast and target-size requirements.

W3C WCAG 2.2, WAI tutorials, Vercel's Web Interface Guidelines, and platform-design skills all converge here. The consensus is strong: clean UI is inseparable from accessible structure and states.

### 6. Implement the full state model

- Include loading, empty, error, disabled, hover, focus, active, success, and validation states.
- Prefer skeletons or layout-matching placeholders to generic spinners.
- Make error copy actionable.

This theme appears in both UI-specific skills and Vercel's review checklist. Polished UI is mostly the discipline of state coverage.

### 7. Use motion with restraint and intent

- Animate only when it improves continuity, hierarchy, or tactile feedback.
- Prefer `transform` and `opacity`.
- Never default to `transition: all`.
- Honor `prefers-reduced-motion`.

Existing frontend skills encourage motion for polish, while Vercel and MDN add the production constraints: motion must be interruptible, cheap to render, and reducible.

### 8. Improve copy and typography as part of UI quality

- Use specific action labels.
- Make error messages explain the next step.
- Use balanced headings and readable line lengths.
- Use tabular numerals for dense numeric comparisons.

Vercel's guidelines are unusually strong here and worth borrowing. Clean UI is partly content design.

## Repeated Anti-Patterns

- Generic purple-on-white gradients with no product reason.
- Raw color and spacing values duplicated across components.
- Centered-everything layouts regardless of content type.
- Card-inside-card-inside-card composition.
- Placeholder-only labels.
- `outline: none` without a replacement.
- Icon buttons without accessible names.
- `transition: all`.
- `h-screen` for mobile full-height sections.
- Heavy motion without a reduced-motion variant.
- No empty, loading, or error states.

## Practical Defaults

- Default to one accent color plus neutrals.
- Default to an 8px spacing rhythm.
- Default to semantic tokens and shared primitives.
- Default to grid for multi-column structures.
- Default to visible focus rings with strong contrast.
- Default to minimum touch targets that satisfy WCAG, and prefer larger comfortable targets for primary controls.
- Default to trimming decoration before trimming clarity.

## Source Notes

- skillcreatorai `frontend-design`: strong visual direction, anti-generic aesthetics, typography and composition discipline.
- bskimball `frontend-agent` / `frontend-design`: inputs, scope, responsive behavior, micro-interactions, maintainability.
- ehmo `web-design-guidelines`: semantic HTML, ARIA discipline, focus, labels, contrast, responsive rules.
- Vercel Web Interface Guidelines: actionable implementation and review checklist for accessibility, forms, motion, copy, and performance.
- W3C WAI / WCAG 2.2: normative accessibility expectations for headings, focus, target size, and keyboard visibility.
- Material Design: responsive grids, 8dp baseline, layout reflow.
- Atlassian Design System: tokens, spacing system, density and grouping guidance.
- MDN: `prefers-reduced-motion`, container queries, and modern text wrapping behavior.
