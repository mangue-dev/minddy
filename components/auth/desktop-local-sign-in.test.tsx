// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { DesktopLocalSignIn } from "./desktop-local-sign-in";

const state = vi.hoisted(() => ({
  bridge: null as Record<string, unknown> | null,
  replace: vi.fn(),
  setSession: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/lib/desktop/bridge", () => ({ getDesktopBridge: () => state.bridge }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: { setSession: state.setSession } }) }));

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DesktopLocalSignIn />
      </NextIntlClientProvider>,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/login?redirect=%2Fprojects");
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DesktopLocalSignIn", () => {
  it("adopts the app's local session and goes on to the requested page", async () => {
    state.bridge = { localSession: vi.fn().mockResolvedValue({ access_token: "a", refresh_token: "r" }) };
    state.setSession.mockResolvedValue({ error: null });
    await render();
    expect(state.setSession).toHaveBeenCalledWith({ access_token: "a", refresh_token: "r" });
    expect(state.replace).toHaveBeenCalledWith("/projects");
    expect(container.textContent).toContain(messages.Auth.localSignIn);
  });

  it("leaves the forms alone when the app manages no account here", async () => {
    state.bridge = { localSession: vi.fn().mockResolvedValue(null) };
    await render();
    expect(state.setSession).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });

  it("does nothing in a browser", async () => {
    state.bridge = null;
    await render();
    expect(container.textContent).toBe("");
  });

  it("does nothing in an older desktop app", async () => {
    state.bridge = { version: "0.20.0" };
    await render();
    expect(container.textContent).toBe("");
  });

  it("falls back to the forms when the session is refused", async () => {
    state.bridge = { localSession: vi.fn().mockResolvedValue({ access_token: "a", refresh_token: "r" }) };
    state.setSession.mockResolvedValue({ error: new Error("expired") });
    await render();
    expect(state.replace).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });
});
