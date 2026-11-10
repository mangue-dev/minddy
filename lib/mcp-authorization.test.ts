import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeMcpOAuthReturn,
  encodeMcpOAuthReturn,
  prepareMcpAuthorization,
} from "./mcp-authorization";
import { buildDesktopOpenUrl, parseDesktopOpenLink } from "./desktop/open-link";

afterEach(() => vi.unstubAllGlobals());

describe("MCP authorization launch", () => {
  it("starts a desktop flow with the app's session and opens only the provider page", async () => {
    const openExternal = vi.fn();
    const open = vi.fn(() => null);
    const getUrl = vi.fn(async () => "https://provider.example/authorize");
    vi.stubGlobal("window", { minddy: { openExternal }, open });
    const target = prepareMcpAuthorization();
    expect(target).not.toBeNull();
    await target!.authorize(getUrl);
    expect(getUrl).toHaveBeenCalledWith({ desktop: true });
    expect(openExternal).toHaveBeenCalledWith("https://provider.example/authorize");
    expect(open).not.toHaveBeenCalled();
    target!.close();
  });

  it("reserves a web tab before fetching OAuth and detaches its opener", async () => {
    const tab = { opener: {}, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.fn(() => tab);
    const getUrl = vi.fn(async () => "https://provider.example/authorize");
    vi.stubGlobal("window", { open });
    const target = prepareMcpAuthorization();
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(tab.opener).toBeNull();
    expect(getUrl).not.toHaveBeenCalled();
    await target!.authorize(getUrl);
    expect(getUrl).toHaveBeenCalledWith({ desktop: false });
    expect(tab.location.replace).toHaveBeenCalledWith("https://provider.example/authorize");
    target!.close();
    expect(tab.close).toHaveBeenCalledOnce();
  });

  it("reports actual browser popup blocking", () => {
    vi.stubGlobal("window", { open: () => null });
    expect(prepareMcpAuthorization()).toBeNull();
  });

  it("does not navigate a tab the user already closed", async () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { open: () => ({ closed: true, location: { replace } }) });
    await prepareMcpAuthorization()!.authorize(async () => "https://provider.example");
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("MCP OAuth return to the desktop app", () => {
  it("survives the bounce page and the deep-link reader unchanged", () => {
    // Codes carry characters that a second URL decoding would corrupt.
    const value = { state: `d${"a".repeat(64)}`, code: "4/0A+b&c%2F=é", iss: "https://accounts.google.com" };
    const path = `/settings?tab=mcp&mcp_oauth=${encodeMcpOAuthReturn(value)}`;
    const opened = parseDesktopOpenLink(buildDesktopOpenUrl(path));
    const raw = new URL(opened!, "https://minddy.invalid").searchParams.get("mcp_oauth");
    expect(decodeMcpOAuthReturn(raw!)).toEqual(value);
  });

  it("rejects anything that is not a return payload", () => {
    expect(decodeMcpOAuthReturn("not base64 !")).toBeNull();
    expect(decodeMcpOAuthReturn(encodeMcpOAuthReturn({ state: "s" } as never))).toBeNull();
  });
});
