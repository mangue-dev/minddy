# MIN-494 self-hosting redesign

Continue PR #133 on its existing branch. Extend the shared marketing style to
both the self-hosting overview and the installation wizard.

- [x] Restyle the overview hero, local/team routes, architecture, migration,
  included features, and operations with shared headings and pastel surfaces.
  Include an expandable localized screenshot and preserve release-pinned links.
- [x] Give the wizard readable desktop step navigation, compact mobile progress,
  clear selected cards, spacious content panels, and accessible copy/navigation
  controls. Respect reduced motion and focus the heading after step changes.
- [x] Preserve commands, prompt templates, email templates, validation, branches,
  acknowledgements, migration, optional services, and restart/back behavior.
- [x] Verify representative complete paths and all layout states, clipboard
  content, keyboard interaction, responsive locales/themes, focused tests,
  TypeScript, lint, owned English, whitespace, and DCO. Update the PR and issue.

## Validation

- Focused lint, TypeScript, owned-English checks, and `git diff --check` passed.
- 92 tests passed across five suites covering translations, locale parity,
  public client messages, SEO, and public routes.
- Both pages passed 120 locale/viewport/theme layout checks: six locales,
  320/390/768/1024/1440 px, and light/dark themes. Reviewed desktop and mobile
  screenshots, including expanded email templates and long installation commands.
- Completed 12 browser paths covering local/team, agent/manual, private/public
  access, managed/full Supabase, migration, and optional email/push services.
  Confirmed invalid settings and missing acknowledgements prevent continuation.
- Verified copied commands, prompts, and email templates against rendered source
  values using an isolated clipboard stub. Checked origins, installation modes,
  optional flags, Supabase host selection, and migration instructions. Commands
  were inspected and copied only; no installation was performed.
- Compared 19 generated expressions with the prior wizard source; command,
  prompt, feature, capacity, origin, and validation expressions are unchanged.
- Verified past-step navigation, back/reset, acknowledgement persistence,
  keyboard activation, heading focus after navigation, and reduced motion.
- Verified the overview lightbox with keyboard/Escape and focus return; headings,
  installation links, and the image fallback remain usable without JavaScript.
- Fixed intrinsic grid sizing that allowed email templates to overflow on mobile.
  Only the overview, wizard, six locale catalogs, and this plan changed.
