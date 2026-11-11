import { DESKTOP_CALLBACK_FLAG } from "@/lib/desktop/config";
import { PROTECTED_PREFIXES } from "@/lib/protected-prefixes";

/**
 * The universal links of the iOS app (MIN-907): which `https://` links of a
 * minddy server iOS opens in the app rather than in Safari.
 *
 * iOS reads this file from `/.well-known/apple-app-site-association` on each
 * domain the app declares in its `com.apple.developer.associated-domains`
 * entitlement (`mobile/ios/App/App/App.entitlements`). The list of domains is
 * compiled into the app, so only minddy Cloud's links can open it: a
 * self-hosted server may serve this file, but no installed app trusts it.
 *
 * The app opens the product's own screens and the e-mail links that sign
 * someone in. Everything else stays in the browser:
 *
 * - the public site, the manual, the legal pages and `/api` match no
 *   component: they are reading material or machine endpoints, not screens of
 *   the app;
 * - the public links (`/share/`, `/f/`, `/p/`) are read by people who often
 *   have no account, and need none;
 * - the product prefixes listed in `EXCLUDED_PREFIXES`, each for its reason.
 *
 * iOS takes the first component that matches, so exclusions come first.
 */

export const IOS_APP_ID = "Y5D87P5VYK.app.minddy.ios";

/**
 * Product prefixes that keep their links in the browser. A new prefix in
 * `PROTECTED_PREFIXES` opens in the app unless it is listed here;
 * `lib/apple-app-site-association.test.ts` keeps the two lists in step.
 */
export const EXCLUDED_PREFIXES: Readonly<Record<string, string>> = {
  "/billing":
    "Nothing is sold in the app (guideline 3.1.3): a link to billing, from a receipt or an upgrade e-mail, must reach the web, where the plan can be bought.",
  "/oauth":
    "An MCP client waits for the end of its consent round in the browser that started it; the app would keep the code from it.",
  "/connect":
    "The forge-relay claim opens minddy Cloud in a new tab and polls until the installation is bound, a round that lives in the browser.",
  "/admin": "The operator console is not part of the product the app ships, and shows the billing figures the app hides.",
  "/lab": "Development testbenches, already 404 in production.",
};

type Component = {
  "/": string;
  "?"?: Record<string, string>;
  exclude?: true;
  comment: string;
};

/** A query item that is present with any value: `*` would also match an absent one. */
const PRESENT = "?*";

function appComponents(): Component[] {
  const excluded: Component[] = [];
  const opened: Component[] = [];
  for (const prefix of PROTECTED_PREFIXES) {
    const reason = EXCLUDED_PREFIXES[prefix];
    for (const path of [prefix, `${prefix}/*`]) {
      if (reason) excluded.push({ "/": path, exclude: true, comment: reason });
      else opened.push({ "/": path, comment: "A screen of the product." });
    }
  }
  return [
    ...excluded,
    {
      "/": "/projects/*/pages-print/*",
      exclude: true,
      comment: "The print layout of a page is made for the browser's print dialog.",
    },
    ...opened,
  ];
}

/**
 * The e-mail links. Confirming a sign-up and resetting a password both land
 * on `/auth/callback?token_hash=…` (`supabase/email-templates/`), which keeps
 * the token in a cookie of the WebView and asks for a tap on `/auth/confirm`
 * before any session opens (`lib/auth-otp-pending.ts`). An invitation links to
 * `/signup?invite=…` (`lib/server/invitation-email.ts`).
 */
function emailComponents(): Component[] {
  return [
    {
      "/": "/auth/callback",
      "?": { [DESKTOP_CALLBACK_FLAG]: PRESENT },
      exclude: true,
      comment: "A round of the desktop app hands its code to that app, on the Mac that started it.",
    },
    {
      "/": "/auth/callback",
      "?": { token_hash: PRESENT },
      comment: "Sign-up confirmation and password reset.",
    },
    // Any other `/auth/callback` is an OAuth return, which needs the PKCE
    // verifier kept by the browser that started the round: no component.
    {
      "/": "/signup",
      "?": { invite: PRESENT },
      comment: "An invitation to a project.",
    },
  ];
}

export function appleAppSiteAssociation() {
  return {
    applinks: {
      details: [
        {
          appIDs: [IOS_APP_ID],
          components: [...emailComponents(), ...appComponents()],
        },
      ],
    },
  };
}
