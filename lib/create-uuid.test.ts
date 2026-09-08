import { afterEach, expect, it, vi } from "vitest";
import { createUuid } from "./create-uuid";

afterEach(() => vi.unstubAllGlobals());

it("uses the native cryptographic UUID when available", () => {
  const randomUUID = vi.fn(() => "01234567-89ab-4def-8123-456789abcdef");
  vi.stubGlobal("crypto", { randomUUID });
  expect(createUuid()).toBe("01234567-89ab-4def-8123-456789abcdef");
  expect(randomUUID).toHaveBeenCalledOnce();
});

it("preserves random bytes except the UUID version and variant on private HTTP", () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => {
    bytes.set(Array.from({ length: 16 }, (_, index) => 240 + index));
    return bytes;
  });
  vi.stubGlobal("crypto", { getRandomValues });
  expect(createUuid()).toBe("f0f1f2f3-f4f5-46f7-b8f9-fafbfcfdfeff");
  expect(getRandomValues).toHaveBeenCalledOnce();
});

it("does not fall back to weak randomness if the cryptographic API fails", () => {
  vi.stubGlobal("crypto", { getRandomValues: () => { throw new Error("randomness unavailable"); } });
  expect(createUuid).toThrow("randomness unavailable");
});
