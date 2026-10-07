# UI and UX refinement previews

These Playwright captures render the actual objective header, creation relation
pills, comment mention composer, skill badges, cycle activation state, pull
request insights, and BYOK connection panel with fixture data and mocked host
contexts. They verify component appearance in light and dark mode; they are not
an authenticated end-to-end session.

- `overview-light.png` and `overview-dark.png`: long objective title truncation,
  hidden empty relations, issue status in a comment mention, borderless skill
  badges, running review logo, and the isometric cycle activation state.
- `pr-actions-light.png`: correction actions use a dropdown menu.
- `byok-confirmation-light.png`: removing a provider connection requires a
  confirmation dialog naming the provider.

Browser checks also sampled the shared assistant sheet geometry: expansion
interpolated from 450 × 600 to 1108 × 920 at a 1440 × 1000 viewport, and collapse
interpolated back through intermediate sizes. The view context menu retained
its position through its closing animation. Conversation values opened their
sidebar callback directly without creating a popover.
