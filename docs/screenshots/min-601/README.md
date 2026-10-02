# MIN-601 billing and usage review

These screenshots show the actual Minddy billing page and account popover, using
the existing mangue-ui components and theme tokens. They were captured against the
local application with the capture demo account. Billing API responses were replaced
with fictional data: 38% consumed, 62% remaining, and a 10 October reset.
No subscription or payment action was performed.

The default view prioritizes remaining budget and its monthly reset. The cumulative
chart uses the full effective usage window, leaves future dates unobserved, and offers
a daily stacked mode. Segment and ledger percentages use the included budget as the
denominator. A date selector supports keyboard access alongside pointer and touch
selection. At 320px, cards stack and ledger rows wrap without horizontal overflow.

Validation covered desktop/mobile layouts, light/dark rendering, keyboard and touch
date selection, popover dismissal, loading/error/empty states, tiny consumption,
overruns, and managed-service variants. Focused billing tests, lint, TypeScript,
the owned-English check, and whitespace validation passed.

The migration was executed in a disposable PGlite PostgreSQL instance to verify
UTC grouping, exact time bounds, full-window aggregation, account isolation, BYOK
and future-entry exclusions, grouped history, pagination, and analytics RPC grants.
The new migration must be applied with the normal deployment process before the
analytics endpoint can return production data; no production migration was applied.
