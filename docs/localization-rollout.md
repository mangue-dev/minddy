# Localization rollout and measurement

## Goal

Minddy provides complete product parity in English, French, German, Brazilian Portuguese, Italian, and Spanish. Each locale covers the marketing site, authentication, onboarding, the authenticated application, legal and help content, transactional messages, notifications, date and emoji behavior, and Numo's user-facing responses. A selected supported locale must never receive English copy as a translation fallback.

The initial rollout order is still informed by the seven-day Vercel Analytics sample: four German visitors, three Brazilian Portuguese visitors, one Italian visit attributed to a ChatGPT query, and no observed Spanish traffic. That sample determines acquisition priority, not translation completeness.

## Rollout order

1. German (`de`) and Brazilian Portuguese (`pt-BR`) receive the first acquisition campaigns because they combine observed demand with relevant SaaS audiences.
2. Italian (`it`) follows as an acquisition experiment to test whether the ChatGPT referral signal repeats.
3. Spanish (`es`) follows quickly because of its international reach, despite the absence of traffic in the initial sample.
4. English (`en`) and French (`fr`) remain the established baselines used to verify feature and translation parity.

Every new product string must be added to all six catalogs in the same change. Product work must not ship a partially translated feature to any supported locale.

## URLs and acquisition

Every public page has a dedicated URL in each locale. English remains unprefixed, while French, German, Brazilian Portuguese, Italian, and Spanish use explicit language prefixes and translated slugs. Authenticated pages keep stable application URLs and use the account locale.

Use the localized public paths as the acquisition dimension. Vercel Analytics provides visits, referrers, countries, page paths, and time on page. PostHog carries the locale and first localized landing path as registered properties so signup, onboarding, project, issue, and agent events can be segmented by acquisition locale.

For each locale, review a rolling 28-day cohort and record:

- unique visitors and acquisition source;
- account creation rate;
- activation rate, defined as completing onboarding or creating the first project or issue;
- median engaged time and pages per session;
- the highest-converting call to action;
- sample size and confidence limits, so a single conversion does not outrank a larger stable cohort.

UTM parameters and referrer domains remain the source of acquisition. Do not add search queries, email addresses, issue content, or other free text to analytics properties.

## Prioritization criteria

Review acquisition performance monthly. Increase investment in a locale when it has at least 100 unique visitors in the review window and either:

- its signup rate is at least 80% of the English baseline; or
- it produces at least 10 activated accounts with an activation rate above the English baseline.

Reduce acquisition investment when a locale has at least 100 visitors but converts below 50% of the English signup baseline. Keep the complete locale available to existing users, revisit its positioning and acquisition mix, and rank market investment by activated accounts and conversion rather than visitor volume alone.
