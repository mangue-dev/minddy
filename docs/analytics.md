# PostHog analytics

PostHog is Minddy's only browser analytics provider. The root lazy integration
captures initial pageviews and SPA navigation throughout the site and app.
Vercel Web Analytics and Speed Insights are removed. Web Vitals follow the
PostHog project setting; DOM autocapture and session replay remain disabled.
Error tracking still requires `MINDDY_PUBLIC_ERROR_TRACKING=1`.

## Consent and anonymous visitors

The device's `cookie_consent` preference is authoritative:

| Choice | Measurement | Analytics storage |
| --- | --- | --- |
| Not chosen, hashing disabled | Anonymous identity per page load | Page memory only |
| Not chosen, hashing enabled | Anonymous server-hashed identity | No persistent browser analytics identifier |
| Accepted | Persistent identity; current account and project context restored | First-party cookie and localStorage |
| Declined | No browser event capture, including pageviews and Web Vitals | Analytics persistence disabled and cleared |

Hard refusal applies even though the SDK's `on_reject` cookieless mode normally
continues anonymous collection. Minddy clears that mode before opting out and
also checks the saved choice in `before_send`. Local banner events and cross-tab
storage changes apply without reloading. A refusal during SDK download takes
effect before initial pageviews or queued application events can be captured.
Technical server events retain their separate existing behavior.

Account identity and person/group context stay in memory until acceptance.
Only current context is retained; signing out clears it. Anonymous hash visits
are not retroactively stitched to the accepted account. SDK configuration,
cookie/storage restrictions, blockers, changing browsers/devices and the hash
lifetime still affect visitor counts. A visitor count is not a count of known
people, and historical inflated identities cannot be repaired by this rollout.

## Enable anonymous server hashing

1. In the PostHog project matching `MINDDY_PUBLIC_POSTHOG_KEY`, open project
   settings, then **Web analytics**, and enable **Cookieless server hash mode**.
2. Set `MINDDY_PUBLIC_POSTHOG_COOKIELESS=1` in the Minddy runtime environment.
   Leave it empty for projects that do not accept cookieless events. This flag
   is not a build-time variable; restart/redeploy the instance to refresh it.
3. With an undecided cookie preference, reload and check that `$pageview` events
   arrive with `$cookieless_mode: true`. The browser must not store a persistent
   `ph_*` analytics identifier. Test a full reload rather than only SPA navigation.
4. Accept, then verify persistent identified events; decline, then verify that
   navigation, custom events and Web Vitals stop. Repeat from another open tab.
5. Keep Web Vitals enabled in the same project and inspect its `$web_vitals` feed.

Enable the hosted setting before the runtime flag: PostHog can discard hashed
events when the project does not accept them. The connected MCP app currently
lacks `project:write`, so it cannot activate that setting. No production runtime
change or deployment is implied by this code change. Operators must assess their
audience-measurement configuration against their own privacy requirements;
cookieless storage alone does not establish a legal exemption.

See [PostHog cookieless tracking](https://posthog.com/tutorials/cookieless-tracking)
and [SDK persistence](https://posthog.com/docs/libraries/js/persistence).

## Compare scopes consistently

Filter production traffic by `$host` (`www.minddy.app` / `minddy.app`). Use the
same date window, timezone and internal/test-user setting for comparisons.
Separate public marketing/legal routes from the signed-in app: the former
Vercel integration only covered marketing and legal layouts, while PostHog
covers the entire application. Public route prefixes currently include `/`,
`/pricing`, `/download`, `/changelog`, `/mcp`, `/self-hosting`, `/alternatives`,
`/legal`, `/terms`, `/privacy` and `/cookies`. Custom boards and shared views are
another public surface and were not covered by the former Vercel layouts.
Include all localized equivalents from `lib/public-routes.ts` in public-only
comparisons; an English-only path filter undercounts localized marketing traffic.

Browser page titles and URL query strings/fragments are removed before sending
events, so private issue titles and authentication query values do not enter
pageview properties. Route paths and campaign attribution remain available.

Once the client removal is deployed, disable Vercel Web Analytics in the project
settings and verify any paid add-ons separately. Hosted history remains useful
for comparison; source removal does not cancel a subscription. The existing
PR prefetch/backstop polls and Numo/agent compact FAB behavior are unaffected.
