import { describe, expect, it } from "vitest";

import { cookieRequiresSecure } from "./session-cookies";

describe("cookieRequiresSecure", () => {
  it("keeps public and browser HTTPS sessions secure", () => {
    expect(cookieRequiresSecure({ appUrl: "https://tickets.example.com", production: true })).toBe(true);
    expect(cookieRequiresSecure({ browserProtocol: "https:", browserHostname: "tickets.example.com", production: false })).toBe(true);
  });

  it("allows sessions on an explicitly configured private HTTP origin", () => {
    expect(cookieRequiresSecure({ appUrl: "http://192.168.1.50", production: true })).toBe(false);
    expect(cookieRequiresSecure({ browserProtocol: "http:", browserHostname: "192.168.1.50", production: true })).toBe(false);
    expect(cookieRequiresSecure({ browserProtocol: "http:", browserHostname: "tickets.example.com", production: false })).toBe(true);
    expect(cookieRequiresSecure({ appUrl: "http://tickets.example.com", production: false })).toBe(true);
  });

  it("uses the production-safe default when no origin is configured", () => {
    expect(cookieRequiresSecure({ production: true })).toBe(true);
    expect(cookieRequiresSecure({ production: false })).toBe(false);
    expect(cookieRequiresSecure({ appUrl: "not a URL", production: false })).toBe(true);
  });
});
