import { describe, expect, it, vi } from "vitest";

import {
  AI_CONSENT_HEADER,
  AI_CONSENT_REQUEST_EVENT,
  aiConsentMissing,
  installAiConsentFetchGuard,
  readAiConsent,
} from "./ai-consent";

const APP = "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 minddy-mobile/0.30.1";
const SAFARI = "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Safari/604.1";

describe("aiConsentMissing", () => {
  it("blocks the app until the person allowed AI", () => {
    expect(aiConsentMissing(APP, undefined)).toBe(true);
    expect(aiConsentMissing(APP, "declined")).toBe(true);
    expect(aiConsentMissing(APP, "yes")).toBe(true);
    expect(aiConsentMissing(APP, "granted")).toBe(false);
  });

  it("never blocks the web or the desktop app", () => {
    expect(aiConsentMissing(SAFARI, undefined)).toBe(false);
    expect(aiConsentMissing("Mozilla/5.0 (Macintosh) minddy-desktop/0.40.0", undefined)).toBe(false);
    expect(aiConsentMissing(null, undefined)).toBe(false);
  });
});

describe("readAiConsent", () => {
  it("reads the answer among other cookies", () => {
    expect(readAiConsent("a=1; minddy-ai-consent=granted; b=2")).toBe("granted");
    expect(readAiConsent("minddy-ai-consent=declined")).toBe("declined");
    expect(readAiConsent("minddy-ai-consent=")).toBeNull();
    expect(readAiConsent("")).toBeNull();
  });
});

describe("installAiConsentFetchGuard", () => {
  function fakeWindow(response: Response) {
    const target = new EventTarget() as EventTarget & { fetch: typeof fetch };
    target.fetch = vi.fn(async () => response);
    return target;
  }

  it("asks again when the server refuses for want of consent", async () => {
    const refusal = new Response("{}", { status: 403, headers: { [AI_CONSENT_HEADER]: "required" } });
    const target = fakeWindow(refusal);
    const asked = vi.fn();
    target.addEventListener(AI_CONSENT_REQUEST_EVENT, asked);
    const restore = installAiConsentFetchGuard(target as unknown as Window);

    expect(await target.fetch("/api/transcribe")).toBe(refusal);
    expect(asked).toHaveBeenCalledOnce();
    restore();
  });

  it("lets other answers through, a plain 403 included, and restores fetch", async () => {
    const forbidden = new Response("{}", { status: 403 });
    const target = fakeWindow(forbidden);
    const original = target.fetch;
    const asked = vi.fn();
    target.addEventListener(AI_CONSENT_REQUEST_EVENT, asked);
    const restore = installAiConsentFetchGuard(target as unknown as Window);

    await target.fetch("/api/projects");
    expect(asked).not.toHaveBeenCalled();
    restore();
    expect(target.fetch).toBe(original);
  });
});
