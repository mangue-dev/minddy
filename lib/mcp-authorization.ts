import { getDesktopBridge } from "@/lib/desktop/bridge";

export const MCP_AUTHORIZATION_PARAM = "mcp_authorize";

/** Reserve a browser tab synchronously, or hand off to the system browser. */
export function prepareMcpAuthorization() {
  const desktop = getDesktopBridge();
  if (desktop) {
    return {
      async authorize(connectionId: string, _getUrl: () => Promise<string>) {
        // Start OAuth in the browser session that will receive its callback.
        const url = new URL("/settings", window.location.origin);
        url.searchParams.set("tab", "mcp-clients");
        url.searchParams.set(MCP_AUTHORIZATION_PARAM, connectionId);
        desktop.openExternal(url.href);
      },
      close() {},
    };
  }
  const tab = window.open("about:blank", "_blank");
  if (!tab) return null;
  tab.opener = null;
  return {
    async authorize(_connectionId: string, getUrl: () => Promise<string>) {
      const url = await getUrl();
      if (!tab.closed) tab.location.replace(url);
    },
    close: () => tab.close(),
  };
}
