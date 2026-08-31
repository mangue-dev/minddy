import { describe, expect, it } from "vitest";
import {
  preventPrivateCaching,
  withPrivateNoStore,
} from "./private-response";

describe("private response caching", () => {
  it("preserves the response while disabling browser and CDN caches", async () => {
    const response = preventPrivateCaching(
      new Response("fresh content", {
        status: 202,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe("no-store");
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(await response.text()).toBe("fresh content");
  });

  it("also protects error responses returned before application data loads", async () => {
    const handler = withPrivateNoStore(async () =>
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await handler();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
