import { describe, expect, it } from "vitest";

import { normalizeDesktopServerOrigin } from "./server-origin";

describe("normalizeDesktopServerOrigin", () => {
  it("accepts HTTPS servers and removes a trailing slash", () => {
    expect(normalizeDesktopServerOrigin(" https://tickets.example.com/ ")).toBe(
      "https://tickets.example.com",
    );
  });

  it("allows HTTP only for loopback servers", () => {
    expect(normalizeDesktopServerOrigin("http://localhost:6463")).toBe(
      "http://localhost:6463",
    );
    expect(normalizeDesktopServerOrigin("http://127.0.0.1:6463")).toBe(
      "http://127.0.0.1:6463",
    );
    for (const address of [
      "http://192.168.1.20",
      "http://10.0.0.8",
      "http://[fd12::8]",
      "http://203.0.113.20",
    ]) {
      expect(() => normalizeDesktopServerOrigin(address)).toThrow(/must use HTTPS/);
    }
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
