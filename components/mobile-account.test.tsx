// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMobileAccountIdentity } from "./mobile-account";

const auth = vi.hoisted(() => ({ name: "Camille" as string | undefined }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { email: "private@example.com", user_metadata: { name: auth.name } } }) }));
vi.mock("mangue-ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function Identity() {
  return <output>{JSON.stringify(useMobileAccountIdentity())}</output>;
}

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.name = "Camille";
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it.each([
  { name: "Camille", expected: "Camille" },
  { name: undefined, expected: "Account" },
])("shows $expected without an email fallback or billing subtitle", async ({ name, expected }) => {
  auth.name = name;
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={{ Nav: { accountFallback: "Account" } }}><Identity /></NextIntlClientProvider>));
  expect(container.textContent).not.toContain("private@example.com");
  expect(JSON.parse(container.textContent ?? "{}")).toEqual({ name: expected });
});
