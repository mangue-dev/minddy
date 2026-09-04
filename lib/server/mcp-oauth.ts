import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/client";
import { getServiceClient } from "@/lib/supabase-service";
import { canonicalAppOrigin } from "./app-origin";
import { assertPublicHttpUrl } from "./safe-fetch";
import { encryptMcpToken, decryptMcpToken } from "./mcp-credentials";
import { mcpFetch, MCP_TIMEOUT_MS } from "./mcp-http";
import type { McpConnectionRow } from "./mcp-client";

type OAuthData = {
  client?: Awaited<ReturnType<OAuthClientProvider["clientInformation"]>>;
  tokens?: Awaited<ReturnType<OAuthClientProvider["tokens"]>>;
  discovery?: Awaited<
    ReturnType<NonNullable<OAuthClientProvider["discoveryState"]>>
  >;
  verifier?: string;
};
export const mcpOAuthCallback = () =>
  `${canonicalAppOrigin()}/api/account/mcp-connections/oauth/callback`;

function readData(encrypted: string | null): OAuthData {
  return encrypted
    ? (JSON.parse(decryptMcpToken(encrypted)!) as OAuthData)
    : {};
}
export function initialMcpOAuth(
  clientId?: string,
  clientSecret?: string,
): string {
  return encryptMcpToken(
    JSON.stringify(
      clientId
        ? {
            client: {
              client_id: clientId,
              ...(clientSecret ? { client_secret: clientSecret } : {}),
              token_endpoint_auth_method: clientSecret
                ? "client_secret_post"
                : "none",
            },
          }
        : {},
    ),
  )!;
}

/** The SDK owns discovery, issuer validation, PKCE, token exchange and refresh. */
function providerFor(
  data: OAuthData,
  persist: () => Promise<void>,
  redirect: (url: URL) => Promise<void>,
  state?: string,
): OAuthClientProvider {
  return {
    redirectUrl: mcpOAuthCallback(),
    clientMetadata: {
      client_name: "Minddy Numo",
      redirect_uris: [mcpOAuthCallback()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: data.client?.client_secret
        ? "client_secret_post"
        : "none",
    },
    state: () => {
      if (!state) throw new Error("Reconnect MCP from account settings");
      return state;
    },
    clientInformation: () => data.client,
    saveClientInformation: async (client) => {
      data.client = client;
      await persist();
    },
    tokens: () => data.tokens,
    saveTokens: async (tokens) => {
      data.tokens = tokens;
      await persist();
    },
    saveCodeVerifier: async (verifier) => {
      data.verifier = verifier;
      await persist();
    },
    codeVerifier: () => {
      if (!data.verifier) throw new Error("Missing OAuth verifier");
      return data.verifier;
    },
    saveDiscoveryState: async (discovery) => {
      data.discovery = discovery;
      await persist();
    },
    discoveryState: () => data.discovery,
    redirectToAuthorization: redirect,
    invalidateCredentials: async (scope) => {
      if (scope === "all" || scope === "tokens") delete data.tokens;
      if (scope === "all" || scope === "client") delete data.client;
      if (scope === "all" || scope === "discovery") delete data.discovery;
      if (scope === "all" || scope === "verifier") delete data.verifier;
      await persist();
    },
  };
}

/** A database lease prevents concurrent refreshes from consuming a rotating token twice. */
export async function openMcpOAuth(connection: McpConnectionRow) {
  const service = getServiceClient();
  const lease = randomUUID();
  const now = new Date();
  const { data: claimed, error } = await service
    .from("user_mcp_connections")
    .update({
      oauth_lock_token: lease,
      oauth_lock_until: new Date(
        now.getTime() + MCP_TIMEOUT_MS + 10_000,
      ).toISOString(),
    })
    .eq("id", connection.id)
    .eq("user_id", connection.user_id)
    .eq("url", connection.url)
    .eq("auth_mode", "oauth")
    .or(`oauth_lock_until.is.null,oauth_lock_until.lt.${now.toISOString()}`)
    .select("oauth_encrypted")
    .maybeSingle();
  if (error || !claimed)
    throw new Error("MCP authorization is busy or changed");
  const release = async () => {
    await service
      .from("user_mcp_connections")
      .update({ oauth_lock_token: null, oauth_lock_until: null })
      .eq("id", connection.id)
      .eq("user_id", connection.user_id)
      .eq("oauth_lock_token", lease);
  };
  try {
    const data = readData(claimed.oauth_encrypted);
    const persist = async () => {
      const { data: saved, error: saveError } = await service
        .from("user_mcp_connections")
        .update({
          oauth_encrypted: encryptMcpToken(JSON.stringify(data)),
          oauth_connected: !!data.tokens,
        })
        .eq("id", connection.id)
        .eq("user_id", connection.user_id)
        .eq("oauth_lock_token", lease)
        .select("id")
        .maybeSingle();
      if (saveError || !saved) throw new Error("MCP connection changed");
    };
    const provider = providerFor(data, persist, async () => {
      throw new Error("Reconnect MCP from account settings");
    });
    return {
      provider,
      release,
      secrets: () =>
        [
          data.tokens?.access_token,
          data.tokens?.refresh_token,
          data.client?.client_secret,
        ].filter((value): value is string => !!value),
    };
  } catch (err) {
    await release();
    throw err;
  }
}

export async function startMcpOAuth(
  connection: McpConnectionRow,
): Promise<string> {
  if (connection.auth_mode !== "oauth") throw new Error("OAuth is not enabled");
  const state = randomBytes(32).toString("hex");
  const data = readData(connection.oauth_encrypted);
  delete data.tokens;
  delete data.verifier;
  delete data.discovery;
  let authorizationUrl: string | undefined;
  const provider = providerFor(
    data,
    async () => {},
    async (url) => {
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Invalid OAuth authorization endpoint");
      await assertPublicHttpUrl(url);
      authorizationUrl = url.toString();
    },
    state,
  );
  await auth(provider, {
    serverUrl: connection.url,
    fetchFn: mcpFetch(AbortSignal.timeout(MCP_TIMEOUT_MS)),
    forceReauthorization: true,
  });
  if (!authorizationUrl || !data.verifier || !data.discovery)
    throw new Error("OAuth discovery failed");
  const service = getServiceClient();
  const { error: cleanupError } = await service
    .from("user_mcp_oauth_attempts")
    .delete()
    .eq("user_id", connection.user_id);
  if (cleanupError) throw new Error("Could not replace OAuth transaction");
  const { error } = await service.from("user_mcp_oauth_attempts").insert({
    state,
    user_id: connection.user_id,
    connection_id: connection.id,
    endpoint: connection.url,
    payload_encrypted: encryptMcpToken(JSON.stringify(data)),
  });
  if (error) throw new Error("Could not save OAuth transaction");
  return authorizationUrl;
}

export async function completeMcpOAuth(
  userId: string,
  state: string,
  code: string,
  iss?: string,
): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(state) || !code || code.length > 4096)
    throw new Error("Invalid OAuth callback");
  const service = getServiceClient();
  // Atomic consumption binds the transaction to this user and makes replay impossible.
  const { data: attempt, error } = await service
    .from("user_mcp_oauth_attempts")
    .delete()
    .eq("state", state)
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .select("connection_id,endpoint,payload_encrypted")
    .maybeSingle();
  if (error || !attempt)
    throw new Error("OAuth transaction expired or already used");
  const { data: current } = await service
    .from("user_mcp_connections")
    .select("*")
    .eq("id", attempt.connection_id)
    .eq("user_id", userId)
    .eq("url", attempt.endpoint)
    .eq("auth_mode", "oauth")
    .maybeSingle();
  if (!current) throw new Error("MCP connection changed");
  const oauth = await openMcpOAuth(current);
  try {
    const data = readData(attempt.payload_encrypted);
    const provider = providerFor(
      data,
      async () => {},
      async () => {
        throw new Error("Unexpected OAuth redirect");
      },
    );
    const result = await auth(provider, {
      serverUrl: attempt.endpoint,
      authorizationCode: code,
      iss,
      fetchFn: mcpFetch(AbortSignal.timeout(MCP_TIMEOUT_MS)),
    });
    if (result !== "AUTHORIZED" || !data.tokens)
      throw new Error("OAuth authorization failed");
    // Persist through the leased provider; a deleted or edited connection cannot be resurrected.
    if (data.client) await oauth.provider.saveClientInformation?.(data.client);
    if (data.discovery)
      await oauth.provider.saveDiscoveryState?.(data.discovery);
    await oauth.provider.saveTokens(data.tokens);
  } finally {
    await oauth.release();
  }
}
