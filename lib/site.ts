interface PublicSiteEnvironment {
  appUrl?: string;
  siteName?: string;
  contactEmail?: string;
  productFeedbackUrl?: string;
  vercel?: string;
  vercelProjectProductionUrl?: string;
}

import { isOfficialMinddyCloud } from "@/lib/deployment-profile";

function optionalPublicUrl(value: string | undefined, variable: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("invalid");
    }
    return parsed.toString();
  } catch {
    throw new Error(`Invalid ${variable}: expected an absolute http(s) URL without credentials`);
  }
}

/** Pure public configuration, shared by client build and tests. */
export function resolvePublicSite(env: PublicSiteEnvironment) {
  const officialCloud = isOfficialMinddyCloud({
    NEXT_PUBLIC_APP_URL: env.appUrl,
    VERCEL: env.vercel,
    VERCEL_PROJECT_PRODUCTION_URL: env.vercelProjectProductionUrl,
  });
  const vercelOrigin = env.vercelProjectProductionUrl?.trim();
  const rawUrl = env.appUrl?.trim() ||
    (officialCloud && vercelOrigin
      ? (vercelOrigin.includes("://") ? vercelOrigin : `https://${vercelOrigin}`)
      : "http://localhost:3000");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      "Invalid NEXT_PUBLIC_APP_URL: expected an absolute http(s) origin, for example https://minddy.example.com",
    );
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "Invalid NEXT_PUBLIC_APP_URL: expected an absolute http(s) origin without path, query or credentials",
    );
  }
  return {
    url: parsed.origin,
    name: env.siteName?.trim() || "minddy",
    // A self-hosted installation should never publish the operator's address
    // cloud by default. The derived address remains specific to the domain of the instance
    // and NEXT_PUBLIC_CONTACT_EMAIL allows you to explicitly replace it.
    contactEmail:
      env.contactEmail?.trim() ||
      (officialCloud ? "hello@minddy.app" : `contact@${parsed.hostname}`),
    productFeedbackUrl: optionalPublicUrl(
      env.productFeedbackUrl || (officialCloud ? "https://feedback.minddy.app" : undefined),
      "NEXT_PUBLIC_PRODUCT_FEEDBACK_URL",
    ),
  };
}

const publicSite = resolvePublicSite({
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  siteName: process.env.NEXT_PUBLIC_SITE_NAME,
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
  productFeedbackUrl: process.env.NEXT_PUBLIC_PRODUCT_FEEDBACK_URL,
  vercel: process.env.VERCEL,
  vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
});

/** Canonical origin of this instance, never that of the default minddy infrastructure. */
export const SITE_URL = publicSite.url;

/**
 * The brand, as it appears in a tab title. The root layout en
 * makes the template “%s · minddy”; the rare titles placed on the client side (the
 * ticket opened in panel) recompose it by hand and read the same
 * constant.
 */
export const SITE_NAME = publicSite.name;

/** Entry point of the MCP server, as pasted into an agent. */
export const MCP_ENDPOINT = `${SITE_URL}/api/mcp`;

export const CONTACT_EMAIL = publicSite.contactEmail;

/** Canonical public source repository for the minddy project. */
export const MINDDY_REPOSITORY_URL = "https://github.com/mangue-dev/minddy";

/** Board where the operator wants to collect feedback on the product. */
export const PRODUCT_FEEDBACK_URL = publicSite.productFeedbackUrl;

/**
 * Ownership verification tokens (MIN-88), placed in `<meta>` by the root
 * layout. Hardcoded and not an environment variable: these are public
 * values, served in the HTML of each page, and a property lost because
 * a variable jumped from an environment is a silent failure.
 *
 * Empty string = not yet checked, the tag is not emitted. We retrieve the
 * tokens from Google Search Console ("HTML Tag") and Bing Webmaster Tools,
 * then paste them here — the following deployment validates the property.
 *
 * Bing also accepts direct import from Search Console once Google
 * has been verified, in which case `bing` may remain empty.
 */
export const SITE_VERIFICATION = {
  /** `<meta name="google-site-verification">` */
  google: "",
  /** `<meta name="msvalidate.01">` */
  bing: "",
} as const;
