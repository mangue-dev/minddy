import "server-only";
import { z } from "zod";
import {
  MCP_PRESETS,
  type McpPreset,
} from "@/lib/mcp-catalog";
import {
  mcpConnectionId,
  mcpConnectionInput,
  mcpConnectionNeedsAuth,
  mcpConnectionPatch,
  mcpSettingsHref,
  type McpConnection,
} from "@/lib/mcp-client";
import { MCP_SETUP_TOOL_NAMES } from "@/lib/mcp-client-tools";
import { getServiceClient } from "@/lib/supabase-service";
import { assertPublicHttpUrl } from "./safe-fetch";
import { checkSessionRateLimit } from "./session-rate-limit";
import {
  getMcpConnection,
  listMcpConnections,
} from "./mcp-client";
import { mcpSettingsUpdate } from "./mcp-settings";
import { mcpOAuthCallback, startMcpOAuth } from "./mcp-oauth";

/**
 * Numo-side MCP connection setup (MIN-541): create or update the user's
 * personal connections on their behalf, then hand back the exact
 * authentication step — the OAuth authorization URL to open, or where the
 * credentials go. Same storage, validation and OAuth machinery as the
 * Account settings routes; secrets are encrypted at rest and never echoed
 * back into the conversation.
 */

type ToolExecution = { success: boolean; result: unknown };

const failure = (error: string): ToolExecution => ({
  success: false,
  result: { error },
});

/** Provider prerequisites, in the words of the product knowledge article. */
const SETUP_NOTES: Record<McpPreset["setup"], string> = {
  standard:
    "Standard OAuth: minddy handles discovery, dynamic registration, PKCE and refresh tokens.",
  oauthApp:
    "This provider requires an OAuth application registered with the provider first: register one with minddy's callback URL, then save its client id and secret on the connection.",
  googlePreview:
    "Google Workspace MCP servers are in developer preview: the account needs preview access and an OAuth app registered at Google with minddy's callback URL.",
  approvedClient:
    "The provider must approve the MCP client before authorization can succeed.",
  slackApp:
    "Requires an internal or Marketplace Slack app with MCP enabled.",
};

const configureArgs = z.object({
  preset_id: z.string().trim().min(1).max(80).optional(),
  connection_id: mcpConnectionId.optional(),
  name: z.string().trim().min(1).max(80).optional(),
  url: z.string().trim().min(1).max(2048).optional(),
  auth_mode: z.enum(["oauth", "bearer", "none"]).optional(),
  token: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  transport: z.enum(["http", "sse"]).optional(),
  oauth_client_id: z.string().optional(),
  oauth_client_secret: z.string().optional(),
  enabled: z.boolean().optional(),
});

const AUTHENTICATION_INVALID =
  "Invalid connection details: the URL must be a public HTTPS endpoint without embedded credentials, the name 1–80 characters, and headers a flat object of custom header names.";

function presetForUrl(url: string): McpPreset | undefined {
  return MCP_PRESETS.find((preset) => preset.url === url);
}

/** The fields the summaries expose — never the encrypted columns. */
type ConnectionSummaryInput = Pick<
  McpConnection,
  | "id"
  | "name"
  | "url"
  | "transport"
  | "auth_mode"
  | "enabled"
  | "oauth_connected"
> & {
  has_token?: boolean;
  has_headers?: boolean;
};

function summarize(connection: ConnectionSummaryInput) {
  return {
    id: connection.id,
    name: connection.name,
    url: connection.url,
    transport: connection.transport,
    auth_mode: connection.auth_mode,
    enabled: connection.enabled,
    oauth_connected: connection.oauth_connected,
    needs_auth: mcpConnectionNeedsAuth({
      auth_mode: connection.auth_mode,
      oauth_connected: connection.oauth_connected,
      has_token: !!connection.has_token,
    }),
  };
}

async function listMcpPresets(userId: string): Promise<ToolExecution> {
  let connections: McpConnection[];
  try {
    connections = await listMcpConnections(userId);
  } catch {
    return failure("Could not load the existing MCP connections.");
  }
  return {
    success: true,
    result: {
      presets: MCP_PRESETS.map(({ id, name, url, auth, setup, docs }) => ({
        id,
        name,
        url,
        auth,
        setup_note: SETUP_NOTES[setup],
        docs,
      })),
      connections: connections.map(summarize),
      settings_url: mcpSettingsHref(),
    },
  };
}

/**
 * The authentication step, shared by creation and update: start the OAuth
 * flow when possible so the user only has to open the URL, and always say
 * exactly what is still on their side.
 */
async function authenticationResult(
  userId: string,
  connectionId: string,
  preset: McpPreset | undefined,
  extra: Record<string, unknown> = {},
): Promise<ToolExecution> {
  const row = await getMcpConnection(userId, connectionId);
  if (!row) return failure("Connection not found.");
  // A full row carries the encrypted secrets, not the summaries the
  // authentication check reads — recompute them here.
  const summary = summarize({
    ...row,
    has_token: !!row.token_encrypted,
    has_headers: !!row.headers_encrypted,
  });
  const nextSteps: string[] = [];
  let authorizationUrl: string | undefined;

  if (row.auth_mode === "oauth" && !row.oauth_connected) {
    try {
      authorizationUrl = await startMcpOAuth(row);
    } catch {
      // The connection stays saved; the user retries from the settings page.
    }
    if (authorizationUrl) {
      nextSteps.push(
        "Open the authorization URL and approve access — the connection is ready as soon as the provider redirects back to minddy.",
      );
    } else {
      nextSteps.push(
        "Automatic OAuth discovery did not complete. Open Account settings → MCP for Numo and press Sign in on this connection to retry; if the provider requires a pre-registered OAuth app, register one with the callback URL below, then update this connection with its client id and secret.",
      );
    }
    if (preset && preset.setup !== "standard")
      nextSteps.push(SETUP_NOTES[preset.setup]);
  } else if (summary.needs_auth) {
    nextSteps.push(
      row.auth_mode === "bearer"
        ? "The connection is saved without a bearer token. Have the user provide the provider's API token to save on this connection, or enter it in Account settings → MCP for Numo (edit the connection → Bearer token). Until then, calls to this connection fail authentication."
        : "The connection is saved but not authenticated yet. Finish its credentials in Account settings → MCP for Numo.",
    );
  } else {
    nextSteps.push(
      "No authentication is required — the connection is ready to use.",
    );
  }

  return {
    success: true,
    result: {
      connection: summary,
      ...(authorizationUrl ? { authorization_url: authorizationUrl } : {}),
      ...(row.auth_mode === "oauth" ? { callback_url: mcpOAuthCallback() } : {}),
      settings_url: mcpSettingsHref(row.id),
      next_steps: nextSteps,
      ...extra,
    },
  };
}

async function createConnection(
  userId: string,
  args: z.infer<typeof configureArgs>,
): Promise<ToolExecution> {
  const preset = args.preset_id
    ? MCP_PRESETS.find((candidate) => candidate.id === args.preset_id)
    : undefined;
  if (args.preset_id && !preset)
    return failure(
      `Unknown preset_id "${args.preset_id}". Call list_mcp_presets for the catalog.`,
    );
  const name = preset?.name ?? args.name;
  const url = preset?.url ?? args.url;
  if (!name || !url)
    return failure(
      "A connection needs a preset_id, or an explicit name and url.",
    );

  // Creation always lands enabled and in the mode the user's details imply:
  // a pasted token means bearer, a catalog service brings its own mode, and
  // anything else starts with OAuth like the settings dialog does.
  const fields = {
    name,
    url,
    enabled: true,
    auth_mode:
      args.auth_mode ??
      (args.token?.trim() ? "bearer" : (preset?.auth ?? "oauth")),
    ...(args.transport ? { transport: args.transport } : {}),
    ...(args.token?.trim() ? { token: args.token.trim() } : {}),
    ...(args.headers ? { headers: args.headers } : {}),
    ...(args.oauth_client_id ? { oauth_client_id: args.oauth_client_id } : {}),
    ...(args.oauth_client_secret
      ? { oauth_client_secret: args.oauth_client_secret }
      : {}),
  };
  const parsed = mcpConnectionInput.safeParse(fields);
  if (!parsed.success) return failure(AUTHENTICATION_INVALID);
  try {
    await assertPublicHttpUrl(parsed.data.url);
  } catch {
    return failure(
      "The endpoint is not reachable: only public HTTPS endpoints are supported.",
    );
  }

  // One connection per endpoint: point at the existing one instead of piling up duplicates.
  let existing: McpConnection | undefined;
  try {
    existing = (await listMcpConnections(userId)).find(
      (candidate) => candidate.url === parsed.data.url,
    );
  } catch {
    return failure("Could not load the existing MCP connections.");
  }
  if (existing) {
    return authenticationResult(userId, existing.id, presetForUrl(existing.url), {
      reused: true,
      note: "A connection for this endpoint already exists; nothing was created. Pass its id as connection_id to update it.",
    });
  }

  let values;
  try {
    values = mcpSettingsUpdate(parsed.data);
  } catch {
    return failure("Could not encrypt the credentials.");
  }
  const { data, error } = await getServiceClient()
    .from("user_mcp_connections")
    .insert({ ...values, user_id: userId })
    .select("id")
    .single();
  if (error || !data) return failure("Could not save the connection.");
  return authenticationResult(userId, data.id, preset, { created: true });
}

async function updateConnection(
  userId: string,
  args: z.infer<typeof configureArgs>,
): Promise<ToolExecution> {
  const current = await getMcpConnection(userId, args.connection_id!);
  if (!current) return failure("Connection not found.");
  const patch = {
    ...(args.name !== undefined ? { name: args.name } : {}),
    ...(args.url !== undefined ? { url: args.url } : {}),
    ...(args.auth_mode !== undefined ? { auth_mode: args.auth_mode } : {}),
    ...(args.transport !== undefined ? { transport: args.transport } : {}),
    ...(args.token?.trim() ? { token: args.token.trim() } : {}),
    ...(args.headers !== undefined ? { headers: args.headers } : {}),
    ...(args.oauth_client_id ? { oauth_client_id: args.oauth_client_id } : {}),
    ...(args.oauth_client_secret
      ? { oauth_client_secret: args.oauth_client_secret }
      : {}),
    ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
  };
  const preset = presetForUrl(args.url ?? current.url);
  if (Object.keys(patch).length === 0) {
    // No changes asked: re-run the authentication step (e.g. re-mint an
    // expired OAuth authorization URL).
    return authenticationResult(userId, current.id, preset, { updated: false });
  }
  const parsed = mcpConnectionPatch.safeParse(patch);
  if (!parsed.success) return failure(AUTHENTICATION_INVALID);
  if (parsed.data.url && parsed.data.url !== current.url) {
    try {
      await assertPublicHttpUrl(parsed.data.url);
    } catch {
      return failure(
        "The endpoint is not reachable: only public HTTPS endpoints are supported.",
      );
    }
  }
  let values;
  try {
    values = mcpSettingsUpdate(parsed.data, current);
  } catch {
    return failure("Could not encrypt the credentials.");
  }
  // An edit invalidates the pending OAuth transaction, like the settings route.
  const service = getServiceClient();
  const { error: pendingError } = await service
    .from("user_mcp_oauth_attempts")
    .delete()
    .eq("connection_id", current.id)
    .eq("user_id", userId);
  if (pendingError) return failure("Could not save the connection.");
  const { data, error } = await service
    .from("user_mcp_connections")
    .update(values)
    .eq("user_id", userId)
    .eq("id", current.id)
    .eq("url", current.url)
    .select("id")
    .maybeSingle();
  if (error) return failure("Could not save the connection.");
  if (!data) return failure("Connection not found.");
  return authenticationResult(userId, current.id, preset, { updated: true });
}

async function configureMcpConnection(
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolExecution> {
  const parsed = configureArgs.safeParse(args);
  if (!parsed.success) return failure(AUTHENTICATION_INVALID);
  const input = parsed.data;
  if (
    !checkSessionRateLimit(userId, "mcp-settings", { limit: 10 }).allowed
  ) {
    return failure(
      "Too many connection changes in one minute. Ask the user to retry shortly.",
    );
  }
  if (input.connection_id) return updateConnection(userId, input);
  return createConnection(userId, input);
}

export async function executeMcpSetupTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolExecution> {
  if (!MCP_SETUP_TOOL_NAMES.has(name)) return failure("Unknown MCP setup tool.");
  try {
    if (name === "list_mcp_presets") return await listMcpPresets(userId);
    return await configureMcpConnection(userId, args);
  } catch {
    return failure(
      "The connection could not be configured. Check the endpoint and credentials in Account settings → MCP for Numo.",
    );
  }
}
