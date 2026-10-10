// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { DocumentationErrorReport } from "./report-error";

const h = vi.hoisted(() => ({ configured: true, authenticated: false, loading: false }));
vi.mock("@/lib/runtime-config-provider", () => ({ useRuntimeConfig: () => ({ documentationFeedbackIntegrationEnabled: h.configured }) }));
vi.mock("@/lib/auth-context", () => ({ useAuthOptional: () => ({ user: h.authenticated ? { id: "reader" } : null, loading: h.loading }) }));
vi.mock("next/dynamic", async () => {
  const { ProductFeedbackDialog } = await import("@/components/product-feedback-dialog");
  return { default: () => ProductFeedbackDialog };
});
vi.mock("@/lib/mobile-sheet-focus", () => ({ allowInputAutoFocus: () => false }));
vi.mock("@/components/form-dialog", () => ({
  FormDialog: ({ open, title, children, onSubmit, submitDisabled, onCancel }: {
    open: boolean; title: string; children: React.ReactNode; onSubmit: () => Promise<void>; submitDisabled: boolean; onCancel: () => void;
  }) => open ? <div role="dialog" aria-label={title}>{children}<button disabled={submitDisabled} onClick={() => void onSubmit()}>Submit</button><button onClick={onCancel}>Cancel</button></div> : null,
}));
vi.mock("mangue-ui", async () => ({
  ...await import("mangue-ui/components/ui/button"),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} onInput={props.onChange as never} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  toast: { success: vi.fn(), error: vi.fn() },
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 201 })));
  h.configured = true; h.authenticated = false; h.loading = false;
  window.history.replaceState({}, "", "/fr/documentation/issues?q=shortcut#details");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function render() {
  act(() => root.render(<NextIntlClientProvider locale="en" messages={en}>
    <DocumentationErrorReport articleId="issues" locale="fr" label="Report an error" />
  </NextIntlClientProvider>));
}

it("takes guests to login with an article return path and preserves query and section", () => {
  render();
  const link = host.querySelector<HTMLAnchorElement>("a")!;
  link.addEventListener("click", event => event.preventDefault());
  act(() => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
  const redirect = new URL(link.href).searchParams.get("redirect");
  expect(redirect).toBe("/fr/documentation/issues?q=shortcut&report-error=1#details");
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("opens the existing empty feedback form after login and consumes the resume flag", () => {
  window.history.replaceState({}, "", "/fr/documentation/issues?q=shortcut&report-error=1#details");
  h.loading = true; render();
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  h.authenticated = true; h.loading = false; render();
  expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Share feedback");
  expect(host.querySelector<HTMLInputElement>("input")!.value).toBe("");
  expect(host.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("");
  expect(host.textContent).not.toContain("Article:");
  expect(window.location.pathname + window.location.search + window.location.hash).toBe("/fr/documentation/issues?q=shortcut#details");
  act(() => [...host.querySelectorAll("button")].find(button => button.textContent === "Cancel")!.click());
  render();
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it("keeps article context separate from the editable submission", async () => {
  h.authenticated = true; render();
  act(() => host.querySelector<HTMLButtonElement>("button")!.click());
  const input = host.querySelector<HTMLInputElement>("input")!;
  act(() => {
    input.value = "The example has a typo";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Submit")!.click());
  expect(fetch).toHaveBeenCalledWith("/api/product-feedback", expect.objectContaining({
    body: JSON.stringify({ title: "The example has a typo", description: "", source: "documentation", documentationContext: { articleId: "issues", locale: "fr" } }),
  }));
});

it("does not offer mail or general feedback as a fallback when reporting is unconfigured", () => {
  h.configured = false; h.authenticated = true; render();
  expect(host.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true);
  expect(host.querySelector("a")).toBeNull();
  expect(host.textContent).toContain("Error reporting is unavailable on this instance.");
});
