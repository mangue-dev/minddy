import { describe, expect, it } from "vitest";

import { normalizeDesktopServerOrigin } from "./server-origin";

describe("normalizeDesktopServerOrigin", () => {
  it("accepts HTTPS servers and removes a trailing slash", () => {
    expect(normalizeDesktopServerOrigin(" https://tickets.example.com/ ")).toBe(
      "https://tickets.example.com",
    );
  });

  it("allows HTTP for loopback and private network servers", () => {
    expect(normalizeDesktopServerOrigin("http://localhost:6463")).toBe(
      "http://localhost:6463",
    );
    expect(normalizeDesktopServerOrigin("http://127.0.0.1:6463")).toBe(
      "http://127.0.0.1:6463",
    );
    expect(normalizeDesktopServerOrigin("http://192.168.1.20")).toBe("http://192.168.1.20");
    expect(normalizeDesktopServerOrigin("http://10.0.0.8")).toBe("http://10.0.0.8");
    expect(normalizeDesktopServerOrigin("http://[fd12::8]")).toBe("http://[fd12::8]");
    expect(() => normalizeDesktopServerOrigin("http://203.0.113.20")).toThrow(/must use HTTPS/);
  });

  it("rejects ambiguous or privileged addresses", () => {
    for (const address of [
      "tickets.example.com",
      "ftp://tickets.example.com",
      "https://user:secret@tickets.example.com",
      "https://tickets.example.com/signup",
      "https://tickets.example.com?next=/home",
    ]) {
      expect(() => normalizeDesktopServerOrigin(address)).toThrow();
    }
  });
});
