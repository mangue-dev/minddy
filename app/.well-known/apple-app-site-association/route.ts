import { appleAppSiteAssociation } from "@/lib/apple-app-site-association";

/**
 * The universal links of the iOS app (MIN-907); the paths and the reasons for
 * each exclusion are in `lib/apple-app-site-association.ts`.
 *
 * Apple requires JSON at this exact path, without a file extension, served
 * over HTTPS with no redirect and no authentication: `/.well-known/` is
 * public in the proxy. Apple's CDN fetches it when the app is installed and
 * caches it on its side; a device in developer mode fetches it directly.
 */
export function GET(): Response {
  return Response.json(appleAppSiteAssociation(), {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
