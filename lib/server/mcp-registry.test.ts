import { describe, expect, it } from "vitest";
import {
  MCP_REGISTRY_URL,
  normalizeMcpRegistryPayload,
  pickRegistryIcon,
} from "@/lib/mcp-registry";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    server: {
      name: "io.github.acme/tools",
      title: "Acme Tools",
      description: "Acme tools for agents.",
      version: "1.0.0",
      remotes: [{ type: "streamable-http", url: "https://mcp.acme.dev/mcp" }],
      ...overrides,
    },
    _meta: {
      "io.modelcontextprotocol.registry/official": {
        status: "active",
        isLatest: true,
      },
    },
  };
}

describe("normalizeMcpRegistryPayload", () => {
  it("maps a latest, active server with a remote endpoint", () => {
    const servers = normalizeMcpRegistryPayload(
      { servers: [entry()] },
      12,
    );
    expect(servers).toEqual([
      {
        id: "io.github.acme/tools",
        name: "Acme Tools",
        description: "Acme tools for agents.",
        url: "https://mcp.acme.dev/mcp",
        transport: "http",
      },
    ]);
  });

  it("drops older versions and inactive or deprecated servers", () => {
    const payload = {
      servers: [
        entry({
          version: "0.9.0",
          remotes: [{ type: "streamable-http", url: "https://old.acme.dev/mcp" }],
        }),
        entry(),
      ],
    };
    payload.servers[0]._meta["io.modelcontextprotocol.registry/official"].isLatest = false;
    const servers = normalizeMcpRegistryPayload(payload, 12);
    expect(servers.map((server) => server.url)).toEqual([
      "https://mcp.acme.dev/mcp",
    ]);

    const inactive = normalizeMcpRegistryPayload(
      {
        servers: [
          {
            server: entry().server,
            _meta: {
              "io.modelcontextprotocol.registry/official": {
                status: "deleted",
                isLatest: true,
              },
            },
          },
        ],
      },
      12,
    );
    expect(inactive).toEqual([]);
  });

  it("skips servers without a connectable remote endpoint", () => {
    const servers = normalizeMcpRegistryPayload(
      {
        servers: [
          entry({ remotes: [] }),
          entry({ name: "io.github.acme/local", remotes: undefined }),
        ],
      },
      12,
    );
    expect(servers).toEqual([]);
  });

  it("prefers streamable HTTP over SSE and maps the transports", () => {
    const servers = normalizeMcpRegistryPayload(
      {
        servers: [
          entry({
            remotes: [
              { type: "sse", url: "https://mcp.acme.dev/sse" },
              { type: "streamable-http", url: "https://mcp.acme.dev/mcp" },
            ],
          }),
          entry({
            name: "io.github.acme/sse",
            remotes: [{ type: "sse", url: "https://sse.acme.dev/mcp" }],
          }),
        ],
      },
      12,
    );
    expect(servers.map((server) => [server.url, server.transport])).toEqual([
      ["https://mcp.acme.dev/mcp", "http"],
      ["https://sse.acme.dev/mcp", "sse"],
    ]);
  });

  it("falls back to the identifier tail when no title exists and dedupes repeats", () => {
    const servers = normalizeMcpRegistryPayload(
      { servers: [entry({ title: undefined }), entry()] },
      12,
    );
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe("tools");
    expect(servers[0].description).toBe("Acme tools for agents.");
  });

  it("caps the page and survives garbage payloads", () => {
    const servers = Array.from({ length: 20 }, (_, index) =>
      entry({ name: `io.github.acme/server-${index}` }),
    );
    expect(normalizeMcpRegistryPayload({ servers }, 3)).toHaveLength(3);
    expect(normalizeMcpRegistryPayload(null, 12)).toEqual([]);
    expect(normalizeMcpRegistryPayload({ servers: "no" }, 12)).toEqual([]);
    expect(normalizeMcpRegistryPayload({ servers: [42, "x", {}] }, 12)).toEqual(
      [],
    );
  });

  it("points at the official registry search endpoint", () => {
    expect(MCP_REGISTRY_URL).toBe(
      "https://registry.modelcontextprotocol.io/v0/servers",
    );
  });
});

describe("pickRegistryIcon", () => {
  it("carries the icon of an entry onto the normalized server", () => {
    const servers = normalizeMcpRegistryPayload(
      {
        servers: [
          entry({
            icons: [
              { src: "https://acme.dev/icon.png", mimeType: "image/png", sizes: ["128x128"] },
            ],
          }),
        ],
      },
      12,
    );
    expect(servers[0].icon).toBe("https://acme.dev/icon.png");
  });

  it("an entry without icons stays icon-less", () => {
    const servers = normalizeMcpRegistryPayload({ servers: [entry()] }, 12);
    expect(servers[0].icon).toBeUndefined();
  });

  it("prefers the raster closest to the display size", () => {
    expect(
      pickRegistryIcon([
        { src: "https://a.dev/1024.png", sizes: ["1024x1024"] },
        { src: "https://a.dev/64.png", sizes: ["64x64"] },
        { src: "https://a.dev/icon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
      ]),
    ).toBe("https://a.dev/64.png");
  });

  it("falls back to the scalable SVG when no raster fits", () => {
    expect(
      pickRegistryIcon([
        { src: "https://a.dev/1024.png", sizes: ["1024x1024"] },
        { src: "https://a.dev/icon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
      ]),
    ).toBe("https://a.dev/icon.svg");
  });

  it("resolves the MIME type from the extension when undeclared", () => {
    expect(pickRegistryIcon([{ src: "https://a.dev/favicon.svg" }])).toBe(
      "https://a.dev/favicon.svg",
    );
  });

  it("keeps a non-https or non-image src out", () => {
    expect(
      pickRegistryIcon([
        { src: "http://a.dev/icon.png", sizes: ["64x64"] },
        { src: "https://a.dev/malware.exe" },
        { src: "https://a.dev/page.html", mimeType: "text/html" },
      ]),
    ).toBeUndefined();
  });

  it("survives garbage icon lists", () => {
    expect(pickRegistryIcon(undefined)).toBeUndefined();
    expect(pickRegistryIcon([42, "x", {}, { src: "" }])).toBeUndefined();
    expect(pickRegistryIcon([{ src: "not a url" }])).toBeUndefined();
  });
});
