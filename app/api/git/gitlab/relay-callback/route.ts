import { type NextRequest, NextResponse } from "next/server";

import { isForgeRelayClientConfigured, relayRequest } from "@/lib/server/forge-relay/client";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import { safeRelayReturnPath } from "@/lib/server/forge-relay/user-broker";
import { upsertGitlabConnection } from "@/lib/server/git/connections";

/**
 * GET /api/git/gitlab/relay-callback?delivery=<id> — the browser hop of the
 * brokered GitLab connection (docs/managed-forge-relay-plan.md). The browser
 * carries only a random delivery id; the token pair travels over the signed
 * relay channel and is stored exactly like the local flow, so the lazy
 * refresh in `getGitlabAccessToken` keeps working instance-side.
 *
 * The optional `return` param (mirrored from the instance-signed authorize
 * state by Cloud) leads back where the connect was started from — project
 * settings, creation wizard — instead of the account git settings.
 */
const DELIVERY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function redirectTo(
  outcome: "connected" | "error",
  returnPath?: string | null,
  connectionId?: string | null,
) {
  const base = safeRelayReturnPath(returnPath);
  const url = new URL(base, canonicalAppOrigin());
  url.searchParams.set("git", outcome);
  // The plain account-settings page ignores the connection id; every other
  // return page uses it to resume exactly like the local callback does.
  if (connectionId && base !== "/settings?tab=git") {
    url.searchParams.set("connection", connectionId);
  }
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
  const returnPath = request.nextUrl.searchParams.get("return");

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
      return redirectTo("error", returnPath);
    }

    const connectionId = await upsertGitlabConnection({
      userId: result.data.userId as string,
      providerAccountId: String(result.data.account.id),
      accountLogin: result.data.account.login || null,
      tokens: result.data.tokens,
      // The token pair belongs to the MANAGED app's client: the marker routes
      // its refresh grants through the relay instead of a local app.
      source: "relay",
    });
    return redirectTo("connected", returnPath, connectionId);
  } catch (err) {
    console.error("[git/gitlab/relay-callback] failed:", err);
    return redirectTo("error", returnPath);
  }
}
