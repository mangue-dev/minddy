import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { generateClaimCode, isValidClaimCode } from "@/lib/server/forge-relay/claims";
import {
  forgeRelayConfig,
  isForgeRelayClientConfigured,
  relayRequest,
  startGithubRelayClaim,
} from "@/lib/server/forge-relay/client";
import { upsertGithubConnection } from "@/lib/server/git/connections";

/**
 * Installation claim against the managed forge relay, instance side
 * (docs/managed-forge-relay-plan.md, "Installation claim").
 *
 * `POST` starts a claim: it hands back the Cloud claim URL the operator's
 * browser must open, plus the single-use code the client then presents to the
 * `GET` poll. The code never touches the instance database — the client holds
 * it, and Cloud only ever stores its hash.
 *
 * `GET ?code=…` polls the outcome over the signed relay channel; on success it
 * stores the local connection flagged `source: "relay"`, which is what routes
 * this connection's token mints to the relay provider from then on.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!isForgeRelayClientConfigured()) {
    return NextResponse.json(
      { error: "The managed forge relay is not configured on this instance" },
      { status: 400 },
    );
  }
  const code = generateClaimCode();
  try {
    const claimUrl = await startGithubRelayClaim(code);
    return NextResponse.json({ claimUrl, code });
  } catch (err) {
    console.error("[git/github/relay-claim] claim start failed:", err);
    return NextResponse.json(
      { error: "Failed to register the GitHub installation setup" },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!isForgeRelayClientConfigured()) {
    return NextResponse.json(
      { error: "The managed forge relay is not configured on this instance" },
      { status: 400 },
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!isValidClaimCode(code)) {
    return NextResponse.json({ error: "Invalid claim code" }, { status: 400 });
  }

  // The claim URL is ALWAYS derived server-side from the pinned relay
  // configuration and handed back to the interstitial: the page never opens
  // a URL it received through its own query string.
  const config = forgeRelayConfig();
  const claimUrl = `${config!.url.replace(/\/$/, "")}/api/relay/github/claim?instance=${encodeURIComponent(config!.instanceId)}&code=${encodeURIComponent(code)}`;

  const result = await relayRequest<{
    status: "pending" | "claimed";
    installationId?: number;
    accountLogin?: string | null;
  }>("/api/relay/github/claim-result", { code });
  if (!result.ok || !result.data) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  if (result.data.status !== "claimed" || !result.data.installationId) {
    return NextResponse.json({ status: "pending", claimUrl });
  }

  try {
    const connectionId = await upsertGithubConnection({
      userId: auth.user.id,
      installationId: result.data.installationId,
      accountLogin: result.data.accountLogin ?? null,
      accountType: null,
      repositorySelection: null,
      source: "relay",
    });
    return NextResponse.json({ status: "connected", connectionId });
  } catch (err) {
    console.error("[git/github/relay-claim] connection store failed:", err);
    return NextResponse.json({ error: "Failed to store the relayed connection" }, { status: 500 });
  }
}
