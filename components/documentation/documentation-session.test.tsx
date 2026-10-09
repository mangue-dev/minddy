// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { DocumentationAccountActions, DocumentationSession } from "./documentation-session";

const h = vi.hoisted(() => ({ configured: false, authenticated: false }));
vi.mock("@/lib/runtime-config-provider", () => ({ useRuntimeConfig: () => h.configured ? { supabaseUrl: "https://example.test", supabaseAnonKey: "public" } : {} }));
vi.mock("@/lib/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuthOptional: () => h.configured ? { user: h.authenticated ? { id: "reader" } : null, loading: false } : null,
  useAuth: () => ({ user: h.authenticated ? { id: "reader" } : null, loading: false, signOut: vi.fn() }),
}));
vi.mock("@/lib/account-query-provider", () => ({ AccountQueryProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/use-my-avatar", () => ({ useMyAvatarSource: () => "reader" }));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));
vi.mock("@/components/numo-face", () => ({ NumoFace: () => null }));
vi.mock("@/components/lazy-toaster", () => ({ LazyToaster: () => null }));
vi.mock("mangue-ui", async () => ({ ...await import("mangue-ui/components/ui/button"), ...await import("mangue-ui/components/ui/dropdown-menu") }));
vi.mock("next/dynamic", () => ({ default: () => ({ open, authenticated }: { open: boolean; authenticated: boolean }) => <aside id="documentation-numo" hidden={!open} data-authenticated={authenticated} /> }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.configured = false; h.authenticated = false;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function render() {
  act(() => root.render(<NextIntlClientProvider locale="en" messages={en}>
    <DocumentationSession locale="en"><DocumentationAccountActions currentId="installation" sections={[]} locale="en" /></DocumentationSession>
  </NextIntlClientProvider>));
}
it.each([false, true])("always opens guest help, including without backend configuration: %s", configured => {
  h.configured = configured; render();
  const launcher = host.querySelector<HTMLButtonElement>("[data-documentation-numo-launcher]")!;
  expect(launcher).toBeTruthy();
  act(() => launcher.click());
  expect(launcher.getAttribute("aria-expanded")).toBe("true");
  expect(host.querySelector("#documentation-numo")?.getAttribute("data-authenticated")).toBe("false");
  act(() => launcher.click());
  expect(launcher.getAttribute("aria-expanded")).toBe("true");
});
it("keeps help open when a guest becomes authenticated", () => {
  h.configured = true; render();
  act(() => host.querySelector<HTMLButtonElement>("[data-documentation-numo-launcher]")!.click());
  h.authenticated = true; render();
  expect(host.querySelector("#documentation-numo")?.getAttribute("data-authenticated")).toBe("true");
  expect(host.querySelector("#documentation-numo")?.hasAttribute("hidden")).toBe(false);
});
