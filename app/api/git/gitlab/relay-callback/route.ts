import { type NextRequest, NextResponse } from "next/server";

import { isForgeRelayClientConfigured, relayRequest } from "@/lib/server/forge-relay/client";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import { upsertGitlabConnection } from "@/lib/server/git/connections";

/**
 * GET /api/git/gitlab/relay-callback?delivery=<id> — the browser hop of the
 * brokered GitLab connection (docs/managed-forge-relay-plan.md). The browser
 * carries only a random delivery id; the token pair travels over the signed
 * relay channel and is stored exactly like the local flow, so the lazy
 * refresh in `getGitlabAccessToken` keeps working instance-side.
 */
const DELIVERY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function redirectTo(outcome: "connected" | "error") {
  const url = new URL("/settings?tab=git", canonicalAppOrigin());
  url.searchParams.set("git", outcome);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  if (!isForgeRelayClientConfigured()) {
    return redirectTo("error");
  }
  const deliveryId = request.nextUrl.searchParams.get("delivery");
  if (!deliveryId || !DELIVERY_ID_PATTERN.test(deliveryId)) {
    return redirectTo("error");
  }

  try {
    const result = await relayRequest<{
      status: "pending" | "delivered";
      userId?: string;
      account?: { id: number; login: string; avatarUrl: string | null };
      tokens?: {
        accessToken: string;
        expiresAt: string;
        refreshToken: string;
        scope: string;
      };
    }>("/api/relay/gitlab/delivery", { deliveryId });

    if (
      !result.ok ||
      !result.data ||
      result.data.status !== "delivered" ||
      !result.data.tokens ||
      !result.data.account
    ) {
      console.error("[git/gitlab/relay-callback] delivery unavailable:", result.error);
      return redirectTo("error");
    }

    await upsertGitlabConnection({
      userId: result.data.userId as string,
      providerAccountId: String(result.data.account.id),
      accountLogin: result.data.account.login || null,
      tokens: result.data.tokens,
      // The token pair belongs to the MANAGED app's client: the marker routes
      // its refresh grants through the relay instead of a local app.
      source: "relay",
    });
    return redirectTo("connected");
  } catch (err) {
    console.error("[git/gitlab/relay-callback] failed:", err);
    return redirectTo("error");
  }
}
