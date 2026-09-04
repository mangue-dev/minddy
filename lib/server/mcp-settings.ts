import "server-only";
import type { z } from "zod";
import { mcpConnectionInput } from "@/lib/mcp-client";
import { encryptMcpToken } from "./mcp-credentials";
import { initialMcpOAuth } from "./mcp-oauth";
import type { McpConnectionRow } from "./mcp-client";

/** Keep all credential updates out of the browser-facing metadata. */
export function mcpSettingsUpdate(
  input: Partial<z.infer<typeof mcpConnectionInput>>,
  current?: McpConnectionRow,
) {
  const { token, headers, oauth_client_id, oauth_client_secret, ...fields } =
    input;
  const destinationChanged =
    !!current && !!fields.url && fields.url !== current.url;
  const mode =
    fields.auth_mode ?? current?.auth_mode ?? (token ? "bearer" : "none");
  const resetOAuth =
    !current ||
    destinationChanged ||
    mode !== current.auth_mode ||
    oauth_client_id !== undefined ||
    oauth_client_secret !== undefined;
  return {
    ...fields,
    auth_mode: mode,
    ...(!current ||
    token !== undefined ||
    destinationChanged ||
    mode !== "bearer"
      ? {
          token_encrypted:
            mode === "bearer" ? encryptMcpToken(token ?? "") : null,
        }
      : {}),
    ...(!current || headers !== undefined || destinationChanged
      ? {
          headers_encrypted:
            headers && Object.keys(headers).length
              ? encryptMcpToken(JSON.stringify(headers))
              : null,
        }
      : {}),
    ...(resetOAuth
      ? {
          oauth_encrypted:
            mode === "oauth"
              ? initialMcpOAuth(oauth_client_id, oauth_client_secret)
              : null,
          oauth_connected: false,
        }
      : {}),
    // Editing invalidates any in-flight refresh lease so stale credentials cannot overwrite it.
    oauth_lock_token: null,
    oauth_lock_until: null,
  };
}
