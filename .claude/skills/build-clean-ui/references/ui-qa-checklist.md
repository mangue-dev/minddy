# UI QA Checklist

Use this checklist before final delivery, review, or merge.

## Structure

- Keep exactly one clear primary action per major screen region.
- Use one `h1` and a logical heading order.
- Use semantic landmarks such as `header`, `nav`, `main`, `aside`, and `footer` where appropriate.
- Prevent horizontal overflow on small screens.
- Keep sticky UI from hiding the currently focused control.

## Tokens and Visual System

- Reuse semantic tokens instead of ad hoc values.
- Keep spacing on a deliberate scale.
- Keep radius and shadow usage consistent.
- Limit accents and keep hierarchy obvious.
- Use cards only when they clarify grouping or elevation.

## Forms and Inputs

- Associate every field with a real label.
- Use meaningful `name`, `autocomplete`, `type`, and `inputmode` values.
- Keep labels above or tightly paired with controls.
- Put helper text and error text near the field.
- Link validation errors to the field with accessible attributes.
- Never use placeholder text as the only label.
- Never block paste without a compelling reason.

## Keyboard and Focus

- Reach every interactive element by keyboard.
- Keep tab order logical.
- Show a visible focus indicator with strong contrast.
- Trap focus in modal dialogs and restore focus on close.
- Add skip navigation when repeated chrome precedes main content.

## Accessibility

- Give icon-only controls an accessible name.
- Mark decorative icons and images as hidden or empty-alt.
- Meet text contrast and UI contrast requirements.
- Avoid conveying meaning by color alone.
- Announce important async feedback with polite or assertive live regions as appropriate.

## Responsive and Touch

- Start from the smallest practical layout first.
- Let content trigger reflow; avoid overfitting to named devices.
- Ensure touch targets meet at least WCAG minimum sizing and spacing.
- Prefer more comfortable 44px to 48px targets for primary controls.
- Respect safe areas and avoid brittle viewport-height tricks.

## Motion and Performance

- Honor `prefers-reduced-motion`.
- Animate `transform` and `opacity` when possible.
- Avoid `transition: all`.
- Avoid expensive perpetual animations unless they are isolated and justified.
- Virtualize very large lists.
- Avoid layout reads in hot render paths.

## States and Content

- Provide loading, empty, error, disabled, hover, focus, active, and success states.
- Make skeletons resemble final structure.
- Use specific button labels and actionable error copy.
- Check long text, short text, empty values, and localized strings.
- Use truncation or wrapping rules intentionally, not accidentally.
