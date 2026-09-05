# MIN-494: Pricing page refinement

Extend the approved pastel marketing style to the pricing page without changing plan data or billing behavior.

- [x] Restyle the hero and section headings in `app/(marketing)/pricing/page.tsx`; remove section dividers there and in `components/marketing/section-faq.tsx`.
- [x] Add an optional pastel presentation to `feature-table.tsx` and enable it in `pricing-comparison.tsx`, matching the plan cards while retaining semantic tables, translated hints, and mobile scrolling.
- [x] Verify billing values and controls, comparison hints, responsive layouts and themes, then run focused tests, lint, TypeScript, owned-English and whitespace checks. Update the existing signed PR and issue.

## Verification

72 tests passed across billing plans, SEO, and public client translation boundaries. Focused Oxlint, TypeScript, owned-English, and whitespace checks passed.

Browser checks covered all six locales at 320, 768, and 1440 px in both themes (36 configurations), without page or cell overflow. All six semantic comparison tables retain their 32 feature rows. Monthly/yearly prices, annual totals, project/issue/member limits, usage multipliers, and annual availability match the billing model.

Verified keyboard hint opening and Escape dismissal, horizontal scrolling with arrow keys and a stationary feature column, removal of the landing FAQ divider, and preservation of the existing framed competitor comparison. Desktop, mobile, and dark-mode screenshots were visually reviewed. Changes are limited to pricing presentation, the shared FAQ section divider, and this checklist.
