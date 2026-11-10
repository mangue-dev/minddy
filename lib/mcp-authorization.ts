import { getDesktopBridge } from "@/lib/desktop/bridge";

/**
 * Carries a provider's answer from the OAuth callback back into the desktop
 * app (MIN-912): `/settings?tab=mcp&mcp_oauth=…`, reached through
 * `/desktop/return` and `minddy://open`. The app redeems it with its own
 * session, so the browser never needs a minddy session of its own.
 */
export const MCP_OAUTH_RETURN_PARAM = "mcp_oauth";

export type McpOAuthReturn = { state: string; code: string; iss?: string };

/**
 * Base64url keeps the value intact through every hop: the return path is
 * decoded once by `/desktop/return` and again by the app's deep-link reader,
 * and a raw code containing `+`, `&` or `%` would not survive both.
 */
export function encodeMcpOAuthReturn(value: McpOAuthReturn): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeMcpOAuthReturn(raw: string): McpOAuthReturn | null {
  try {
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    if (typeof value.state !== "string" || typeof value.code !== "string")
      return null;
    return {
      state: value.state,
      code: value.code,
      ...(typeof value.iss === "string" ? { iss: value.iss } : {}),
    };
  } catch {
    return null;
  }
}

/** Where provider authorization URLs come from; `desktop` marks the app's flow. */
type AuthorizationUrlSource = (options: { desktop: boolean }) => Promise<string>;

/**
 * Reserve a browser tab synchronously on the web. In the desktop app, start
 * OAuth with the app's own session and open only the provider's page in the
 * system browser: the user never meets a second minddy there.
 */
export function prepareMcpAuthorization() {
  const desktop = getDesktopBridge();
  if (desktop) {
    return {
      async authorize(getUrl: AuthorizationUrlSource) {
        desktop.openExternal(await getUrl({ desktop: true }));
      },
      close() {},
    };
  }
  const tab = window.open("about:blank", "_blank");
  if (!tab) return null;
  tab.opener = null;
  return {
    async authorize(getUrl: AuthorizationUrlSource) {
      const url = await getUrl({ desktop: false });
      if (!tab.closed) tab.location.replace(url);
    },
    close: () => tab.close(),
  };
}
