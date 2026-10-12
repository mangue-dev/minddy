// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DesktopAuthLink } from "@/lib/desktop/auth-link";
import { beginDesktopAuthTurn } from "@/lib/desktop/auth-turn";
import { DesktopAuthBridge } from "./desktop-auth-bridge";

const h = vi.hoisted(() => ({
  listener: null as null | ((link: DesktopAuthLink) => void),
  complete: vi.fn(),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ completeDesktopSignIn: h.complete }) }));
vi.mock("@/lib/desktop/bridge", () => ({ getDesktopBridge: () => ({
  onAuthLink: (listener: typeof h.listener) => { h.listener = listener; return () => { h.listener = null; }; },
}) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/icon", () => ({ AppIcon: () => null }));
vi.mock("mangue-ui", () => ({
  Button: (props: React.ComponentProps<"button">) => <button {...props} />,
  Card: (props: React.ComponentProps<"div">) => <div {...props} />,
  CardContent: (props: React.ComponentProps<"div">) => <div {...props} />,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  h.complete.mockReset().mockImplementation(() => new Promise(() => {}));
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(<DesktopAuthBridge />); });
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove(); vi.unstubAllGlobals();
});

it("accepts the current callback after a delayed unrelated callback", async () => {
  const oldTurn = beginDesktopAuthTurn();
  const turn = beginDesktopAuthTurn();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await act(async () => {
      h.listener!({ kind: "code", code: "old", next: "/home", turn: oldTurn });
      h.listener!({ kind: "code", code: "current", next: "/home", turn });
    });
    expect(h.complete).toHaveBeenCalledExactlyOnceWith({ kind: "code", code: "current", next: "/home", turn });
  } finally { warn.mockRestore(); }
});

it("starts only one OTP exchange when confirmation is clicked twice before rendering", async () => {
  const link: DesktopAuthLink = { kind: "otp", tokenHash: "email-token", type: "magiclink", next: "/home" };
  await act(async () => { h.listener!(link); });
  const confirm = host.querySelector("button")!;
  await act(async () => { confirm.click(); confirm.click(); });
  expect(h.complete).toHaveBeenCalledExactlyOnceWith(link);
  expect(host.textContent).toBe("redirecting");
});

it("ignores a later failure callback while a successful sign-in exchange is pending", async () => {
  const turn = beginDesktopAuthTurn();
  const link: DesktopAuthLink = { kind: "code", code: "current", next: "/home", turn };
  await act(async () => {
    h.listener!(link);
    h.listener!({ kind: "error", error: "oauth_denied", reason: "access_denied" });
  });
  expect(h.complete).toHaveBeenCalledExactlyOnceWith(link);
});
