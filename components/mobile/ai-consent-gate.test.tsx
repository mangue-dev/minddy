// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AI_CONSENT_COOKIE, readAiConsent } from "@/lib/mobile/ai-consent";

const h = vi.hoisted(() => ({ metadata: {} as Record<string, unknown> }));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => Object.assign((key: string) => key, { rich: (key: string) => key }),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "user-1", user_metadata: h.metadata }, updateUserMetadata: vi.fn(async () => undefined) }),
}));
vi.mock("@/lib/native-app", () => ({ useNativeMobile: () => true }));
vi.mock("@/components/ui/alert-dialog", () => {
  const pass = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return {
    AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? createElement("div", { role: "alertdialog" }, children) : null,
    AlertDialogContent: pass, AlertDialogHeader: pass, AlertDialogFooter: pass,
    AlertDialogTitle: pass, AlertDialogDescription: pass,
    AlertDialogAction: pass, AlertDialogCancel: pass,
  };
});

import { AiConsentGate } from "./ai-consent-gate";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.cookie = `${AI_CONSENT_COOKIE}=; Path=/; Max-Age=0`;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("restores the account's answer after signing back in instead of asking again", async () => {
  h.metadata = { ai_consent: "granted" };
  await act(() => root.render(createElement(AiConsentGate)));
  expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  expect(readAiConsent()).toBe("granted");
});

it("asks an account that never answered", async () => {
  h.metadata = {};
  await act(() => root.render(createElement(AiConsentGate)));
  expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(readAiConsent()).toBeNull();
});
