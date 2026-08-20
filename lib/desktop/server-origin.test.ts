import { describe, expect, it } from "vitest";

import { normalizeDesktopServerOrigin } from "./server-origin";

describe("normalizeDesktopServerOrigin", () => {
  it("accepts HTTPS servers and removes a trailing slash", () => {
    expect(normalizeDesktopServerOrigin(" https://tickets.example.com/ ")).toBe(
      "https://tickets.example.com",
    );
  });

  it("allows HTTP only for a loopback server", () => {
    expect(normalizeDesktopServerOrigin("http://localhost:6463")).toBe(
      "http://localhost:6463",
    );
    expect(normalizeDesktopServerOrigin("http://127.0.0.1:6463")).toBe(
      "http://127.0.0.1:6463",
    );
    expect(() => normalizeDesktopServerOrigin("http://192.168.1.20:6463")).toThrow(
      /must use HTTPS/,
    );
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
