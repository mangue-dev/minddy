import { NextResponse } from "next/server";

/**
 * The SHA of the deployment that REALLY serves the traffic (MIN-157).
 *
 * The client compares this value to `NEXT_PUBLIC_GIT_COMMIT_SHA`, fixed in its
 * bundle to the build (see next.config.mjs): a gap means that a deployment
 * newer is online, and the tab offers to reload.
 *
 * No authentication: the SHA of the build is already in the client bundle, and
 * the production one is public on the repository anyway.
 *
 * `force-dynamic` + `no-store` are the essence of the contract. A response put into
 * cache — by the Vercel CDN or by the browser — would be that of the OLD
 * deployment, that is to say an SHA always equal to that of the bundle: the
 * detection would never trigger.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
