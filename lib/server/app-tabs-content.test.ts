import { describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { EncryptedStore } from "./encryption/store";

const keys = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
const store = new EncryptedStore({
  current: async () => ({ version: 2, bytes: Buffer.from(keys.get(2)!) }),
  byVersion: async (_scope, version) => ({ version,
    bytes: Buffer.from(keys.get(version)!) }),
});
vi.mock("./encryption/registry", () => ({ getEncryptedStore: () => store }));

const { encodeAppTabValue, decodeAppTabValue, decodeAppTab,
  appTabValueVersion } = await import("./app-tabs-content");

describe("personal application tab content", () => {
  it("seals destinations and labels with an owner, row, and column binding", async () => {
    const user = randomUUID();
    const id = randomUUID();
    const href = "/projects/private/triage?view=secret";
    const label = "Private issue queue";
    const sealedHref = await encodeAppTabValue(user, id, "href", href);
    const sealedName = await encodeAppTabValue(user, id, "custom_name", label);
    expect(sealedHref).toMatch(/^mdye3:/);
    expect(sealedHref).not.toContain(href);
    expect(sealedName).not.toContain(label);
    expect(appTabValueVersion(sealedHref)).toBe(2);
    expect(await decodeAppTabValue(user, id, "href", sealedHref)).toBe(href);
    expect(await decodeAppTabValue(user, id, "custom_name", sealedName)).toBe(label);
    await expect(decodeAppTabValue(randomUUID(), id, "href", sealedHref)).rejects.toThrow();
    await expect(decodeAppTabValue(user, randomUUID(), "href", sealedHref)).rejects.toThrow();
    await expect(decodeAppTabValue(user, id, "custom_name", sealedHref)).rejects.toThrow();
    await expect(decodeAppTab(user, { id, user_id: randomUUID(), href: sealedHref,
      custom_name: sealedName } as never)).rejects.toThrow();
    expect(await decodeAppTabValue(user, id, "href", "/home")).toBe("/home");
    await expect(encodeAppTabValue(user, id, "href", "https://evil.example"))
      .rejects.toThrow();
  });
});
