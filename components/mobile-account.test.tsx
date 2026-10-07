// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MobileMenuFooter } from "./mobile-account";

const billing = vi.hoisted(() => ({
  status: null as { planId: "free" | "go" | "pro" } | null,
  usage: null as { planId: "free" | "go" | "pro" } | null,
}));
vi.mock("@/lib/use-billing-query", () => ({ useBillingSummary: () => billing }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { email: "private@example.com", user_metadata: { name: "Camille" } } }) }));
vi.mock("@/lib/use-my-avatar", () => ({ useMyAvatarSource: () => "avatar" }));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/lib/desktop/bridge", () => ({ getDesktopBridge: () => null }));
vi.mock("mangue-ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  billing.status = null; billing.usage = null;
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it.each([
  { status: "free", usage: null, expected: "Free" },
  { status: "go", usage: null, expected: "Go" },
  { status: "pro", usage: null, expected: "Pro" },
  { status: null, usage: "pro", expected: "Pro" },
  { status: "free", usage: "go", expected: "Go" },
  { status: null, usage: null, expected: null },
] as const)("shows $expected from the available billing data without exposing the email", async ({ status, usage, expected }) => {
  billing.status = status ? { planId: status } : null;
  billing.usage = usage ? { planId: usage } : null;
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={{ Nav: { accountFallback: "Account", webVersion: "Web version", appVersion: "App version" }, Billing: { planFree: "Free", planGo: "Go", planPro: "Pro" } }}><MobileMenuFooter /></NextIntlClientProvider>));
  expect(container.textContent).toContain("Camille");
  expect(container.textContent).not.toContain("private@example.com");
  expect(container.querySelector(".min-w-0")?.children).toHaveLength(expected ? 2 : 1);
  if (expected) expect(container.textContent).toContain(expected);
});
