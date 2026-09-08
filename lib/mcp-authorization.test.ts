import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareMcpAuthorization } from "./mcp-authorization";

afterEach(() => vi.unstubAllGlobals());

describe("MCP authorization launch", () => {
  it("hands desktop authorization to the browser without opening a popup or using desktop OAuth state", async () => {
    const openExternal = vi.fn();
    const open = vi.fn(() => null);
    const getUrl = vi.fn();
    vi.stubGlobal("window", {
      minddy: { openExternal },
      open,
      location: { origin: "https://preview.minddy.app" },
    });
    const target = prepareMcpAuthorization();
    expect(target).not.toBeNull();
    await target!.authorize("connection-id", getUrl);
    expect(openExternal).toHaveBeenCalledWith(
      "https://preview.minddy.app/settings?tab=mcp-clients&mcp_authorize=connection-id",
    );
    expect(open).not.toHaveBeenCalled();
    expect(getUrl).not.toHaveBeenCalled();
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
    await target!.authorize("id", getUrl);
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
    await prepareMcpAuthorization()!.authorize("id", async () => "https://provider.example");
    expect(replace).not.toHaveBeenCalled();
  });
});
