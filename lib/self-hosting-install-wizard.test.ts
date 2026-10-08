// @vitest-environment jsdom
import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelfHostingInstallWizard } from "@/components/marketing/self-hosting-install-wizard";
import en from "@/messages/en.json";

vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/components/icon", () => ({ AppIcon: () => null }));
vi.mock("@/components/actor-avatars", () => ({ McpAvatar: () => null }));
vi.mock("@/components/marketing/copy-button", () => ({
  CopyButton: ({ text }: { text: string }) => createElement("button", { "data-copy": text }, "Copy"),
}));
vi.mock("mangue-ui/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => children,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
  PopoverContent: () => null,
}));
vi.mock("mangue-ui/components/ui/accordion", () => ({
  Accordion: ({ children }: { children: React.ReactNode }) => children,
  AccordionItem: ({ children }: { children: React.ReactNode }) => children,
  AccordionTrigger: ({ children }: { children: React.ReactNode }) => children,
  AccordionContent: ({ children }: { children: React.ReactNode }) => children,
}));

const copy = en.SelfHostingInstall;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.scrollTo = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(SelfHostingInstallWizard, {
    copy,
    links: { guide: "https://example.test/install", download: "https://example.test/download", release: "https://example.test/release", operations: "https://example.test/operations", encryption: "https://example.test/docs/workspace-encryption", localInstallation: "https://example.test/docs/install-locally", serverInstallation: "https://example.test/docs/install-a-server" },
    guidePath: "/self-hosting",
    emailTemplates: { confirmSignup: { subject: "Confirm", body: "Confirm" }, resetPassword: { subject: "Reset", body: "Reset" } },
    repositoryUrl: "https://github.com/mangue-dev/minddy", releaseTag: "v0.11.0", pnpmVersion: "10.28.0",
  })));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function clickCard(title: string) {
  const heading = [...host.querySelectorAll("h3")].find((item) => item.textContent === title);
  const button = heading?.closest("button");
  expect(button, title).toBeTruthy();
  act(() => button!.click());
}

function next() {
  const button = host.querySelectorAll<HTMLButtonElement>("button");
  const last = button[button.length - 1];
  expect(last.disabled, host.querySelector("h1")?.textContent ?? "stage").toBe(false);
  act(() => last.click());
}

function reach(title: string) {
  for (let index = 0; index < 20 && host.querySelector("h1")?.textContent !== title; index++) {
    // Populate the server address and administrator inputs at their real stage.
    for (const input of host.querySelectorAll<HTMLInputElement>("input")) {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      act(() => {
        set.call(input, input.type === "email" ? "ops@example.test" : "192.168.1.50");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    next();
  }
  expect(host.querySelector("h1")?.textContent).toBe(title);
}

function choose(path: "local" | "team", method: "agent" | "manual", full = false) {
  reach(copy.routeTitle);
  clickCard(path === "local" ? copy.localTitle : copy.teamTitle);
  reach(copy.encryptionReleaseTitle);
  expect(host.textContent).toContain("v0.11.0");
  expect(host.textContent).toContain(copy.encryptionReleaseKeyNote);
  expect(host.querySelector(`a[href="https://example.test/docs/workspace-encryption"]`)).toBeTruthy();
  expect(host.textContent).not.toContain(copy.encryptionEnabled);
  reach(copy.migrateTitle);
  clickCard(copy.migrateNo);
  if (path === "team" && full) {
    reach(copy.backendTitle);
    clickCard(copy.fullTitle);
  }
  reach(copy.methodTitle);
  clickCard(method === "agent" ? copy.methodAgentTitle : copy.methodManualTitle);
}

function copiedText() {
  return [...host.querySelectorAll("[data-copy]")].map((item) => item.getAttribute("data-copy")).join("\n");
}

describe("published self-hosting installation capabilities", () => {
  for (const path of ["local", "team", "full"] as const) {
    it(`${path} manual commands omit the unsupported encryption flag`, () => {
      choose(path === "full" ? "team" : path, "manual", path === "full");
      reach(path === "local" ? copy.manualLocalTitle : path === "full" ? copy.fullPreparationTitle : copy.installerTitle);
      const command = copiedText();
      expect(command).not.toContain("--encryption");
      expect(command).not.toContain("MINDDY_CONTENT_ENCRYPTION_ENABLED=");
      expect(command).toContain(path === "local" ? "bootstrap:supabase" : "self-host:install");
      if (path === "local") expect(command).toContain("git clone --branch v0.11.0");
      if (path === "full") {
        expect(command).toContain("--mode full --skip-start");
        expect(host.querySelector(`a[href="https://example.test/docs/install-a-server#adapted-start"]`)).toBeTruthy();
        expect(host.textContent).toContain(copy.fullPreparedDone);
      }
    });
    it(`${path} assistant prompt distinguishes published installation from candidate encryption tooling`, () => {
      choose(path === "full" ? "team" : path, "agent", path === "full");
      reach(copy.agentTitle);
      const prompt = copiedText();
      expect(prompt).not.toMatch(/--encryption (enabled|disabled)/);
      expect(prompt).not.toContain("MINDDY_CONTENT_ENCRYPTION_ENABLED=");
      expect(prompt).toContain("Exact release: v0.11.0");
      expect(prompt).toContain("0.11.1 candidate");
      expect(prompt).toContain("MINDDY_DATA_ROOT_KEY");
      expect(prompt).toContain("https://example.test/docs/workspace-encryption");
      if (path === "full") {
        expect(prompt).toContain("--mode full --skip-start");
        expect(prompt).toContain(copy.fullPreparationBody);
        expect(prompt).toContain("https://example.test/docs/install-a-server#adapted-start");
      }
      expect(prompt).not.toContain("MINDDY_ENCRYPTION_SETUP");
    });
  }
});
