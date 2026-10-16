// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/agent-api";
import { HttpResponseError } from "@/lib/backend-availability";
import en from "@/messages/en.json";
import { ReadFailureNotice } from "./read-failure-notice";

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const onRetry = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  onRetry.mockClear();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function render(error: unknown) {
  await act(() => root.render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ReadFailureNotice error={error} message="Surface message" retryLabel="Try again" onRetry={onRetry} />
    </NextIntlClientProvider>,
  ));
}
const button = () => container.querySelector("button")!;

it("shows the surface message with Retry for access and temporary failures", async () => {
  await render(new HttpResponseError("Forbidden", 403));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Surface message");
  await act(() => button().click());
  expect(onRetry).toHaveBeenCalledOnce();
});

it.each([
  [new HttpResponseError("Unauthorized", 401), en.Common.readSessionEnded],
  [new HttpResponseError("MFA", 403, "mfa_required"), en.Common.readSecondFactor],
])("offers sign-in instead of a retry that cannot succeed", async (error, text) => {
  await render(error);
  expect(container.textContent).toContain(text);
  expect(button().textContent).toBe(en.Common.readSignInAgain);
});

it("keeps Retry disabled until the rate limit deadline", async () => {
  await render(Object.assign(new ApiError("Too many requests"), { status: 429, retryAt: Date.now() + 90_000 }));
  expect(button().disabled).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
  expect(button().disabled).toBe(false);
});
