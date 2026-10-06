// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import type { Project } from "@/lib/types";
import { projectDraftFromRow, type ProjectDraft } from "@/lib/project-draft";
import { takeSeedHandoff } from "@/lib/project-seed-handoff";
import type { WizardStep } from "@/components/wizard/wizard-dialog";

const mocks = vi.hoisted(() => ({
  push: vi.fn(), createProject: vi.fn(), createPage: vi.fn(),
  updateProject: vi.fn(), deleteDraft: vi.fn(), invalidate: vi.fn(),
  track: vi.fn(), close: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(),
  prepareBrief: vi.fn(), saveDraft: vi.fn(), projects: [] as Project[],
}));
vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => ({ push: mocks.push }) }));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace: keyof typeof en) => (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)).replaceAll(`{${name}, number}`, String(value)),
      (en[namespace] as Record<string, string>)[key] ?? key),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({
  projects: mocks.projects, createProject: mocks.createProject, updateProject: mocks.updateProject,
  saveProjectDraft: mocks.saveDraft, deleteProjectDraft: mocks.deleteDraft,
}) }));
vi.mock("@/lib/use-git-connections-query", () => ({ useGitConnectionsQuery: () => ({ connections: [], providers: [] }) }));
vi.mock("@/lib/pages-api", () => ({ createPageApi: mocks.createPage, prepareInitialBriefApi: mocks.prepareBrief }));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => ({ track: mocks.track }) }));
vi.mock("@/lib/use-track-view", () => ({ useTrackView: vi.fn() }));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("mangue-ui", () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => <button {...props}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  Spinner: () => null, Switch: () => null,
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
}));
vi.mock("@/components/project-orb", () => ({ ProjectOrb: () => null }));
vi.mock("@/components/project-icon-picker", () => ({ ProjectIconPicker: () => null }));
vi.mock("@/components/git/provider-connect-buttons", () => ({ ProviderConnectButtons: () => null }));
vi.mock("@/components/search-select", () => ({ SearchSelect: () => null }));
vi.mock("@/components/import/import-guide", () => ({ ImportGuideBlock: () => null }));
vi.mock("@/components/close-project-draft-dialog", () => ({ CloseProjectDraftDialog: () => null }));
vi.mock("@/components/home/onboarding-join-dialog", () => ({ OnboardingJoinDialog: () => null }));
vi.mock("@/components/wizard/wizard-choice-card", () => ({ WizardChoiceCard: () => null }));
vi.mock("@/components/wizard/wizard-dialog", () => ({
  WizardDialog: ({ steps, stepIndex, submitting, error, onSubmit }: {
    steps: WizardStep[]; stepIndex: number; submitting: boolean; error: string | null;
    onSubmit: (id: string) => void;
  }) => {
    const step = steps[stepIndex];
    return <div>
      <h1>{step.title}</h1><p>{step.subtitle}</p>{step.content}
      {error && <div role="alert">{error}</div>}
      <button data-submit disabled={submitting || step.submitDisabled} onClick={() => onSubmit(step.id)}>
        {step.submitLabel ?? "Continue"}
      </button>
    </div>;
  },
}));

import { CreateProjectWizard } from "./create-project-wizard";

let host: HTMLDivElement;
let root: Root;
const draft: ProjectDraft = {
  id: "11111111-1111-4111-8111-111111111111", name: "New project", key: "NEW",
  orbSeed: null, keyTouched: true, step: "seed", origin: "new", seed: null,
  icon: { kind: "none" }, repo: null, smartAssignEnabled: true,
  autoAssignEnabled: false, updatedAt: "2026-10-06T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.createProject.mockResolvedValue({ id: draft.id, name: draft.name });
  mocks.projects = [];
  mocks.prepareBrief.mockImplementation(async (markdown: string) => ({
    type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: markdown }] }],
  }));
  mocks.saveDraft.mockResolvedValue(draft);
  mocks.createPage.mockResolvedValue({ id: "brief-page" });
  mocks.updateProject.mockResolvedValue(undefined);
  mocks.deleteDraft.mockResolvedValue(undefined);
  takeSeedHandoff();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  takeSeedHandoff();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(overrides: Partial<ProjectDraft> = {}) {
  await act(() => root.render(<CreateProjectWizard open onOpenChange={mocks.close}
    resume={{ draft: { ...draft, ...overrides }, connectionId: null }} />));
}

async function typeBrief(value: string) {
  const input = host.querySelector("textarea")!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  const button = host.querySelector<HTMLButtonElement>("[data-submit]")!;
  expect(button.disabled).toBe(false);
  await act(() => button.click());
}

function expectNormalNavigation() {
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/projects/${draft.id}`);
  expect(takeSeedHandoff()).toBeNull();
}

describe("initial project brief", () => {
  it("saves the full 50,000-character Markdown brief as a page without opening Numo", async () => {
    await mount();
    expect(host.textContent).toContain(en.Projects.wizardSeedBriefDesc);
    expect(host.textContent).not.toContain(en.Projects.wizardSeedNumoLink);
    const text = "# Initial brief\n\n- Build the project\n\n".padEnd(49_992, "x") + "THE END!";
    expect(text.length).toBe(50_000);
    await typeBrief(text);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector(".tabular-nums")!.textContent).toBe("50000 / 50000");
    await submit();
    expect(mocks.createPage).not.toHaveBeenCalled();
    await submit();
    expect(mocks.createPage).toHaveBeenCalledExactlyOnceWith(draft.id, {
      title: en.Projects.wizardBriefPageTitle, icon: "📝",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    });
    expect(mocks.prepareBrief).toHaveBeenCalledExactlyOnceWith(text);
    expectNormalNavigation();
  });

  it("blocks 50,001 characters, preserves the input, and lets the user shorten it", async () => {
    await mount();
    await typeBrief("x".repeat(50_001));
    expect(host.querySelector<HTMLTextAreaElement>("textarea")!.value).toHaveLength(50_001);
    expect(host.querySelector<HTMLButtonElement>("[data-submit]")!.disabled).toBe(true);
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("50000");
    expect(mocks.createProject).not.toHaveBeenCalled();
    await typeBrief("x".repeat(50_000));
    expect(host.querySelector<HTMLButtonElement>("[data-submit]")!.disabled).toBe(false);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("revalidates an oversized saved brief when resuming at the final step", async () => {
    await mount({ step: "finish", seed: { kind: "brief", text: "x".repeat(50_001) } });
    await submit();
    expect(host.querySelector("textarea")).toBeTruthy();
    expect(host.querySelector('[role="alert"]')).toBeTruthy();
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("skips a whitespace-only brief without creating a page or conversation", async () => {
    await mount();
    await typeBrief(" \n\t ");
    expect(host.querySelector("[data-submit]")!.textContent).toBe(en.Common.skip);
    await submit();
    await submit();
    expect(mocks.createPage).not.toHaveBeenCalled();
    expectNormalNavigation();
  });

  it("completes an older Numo draft without starting a conversation", async () => {
    const restored = projectDraftFromRow({
      id: draft.id, name: draft.name, step: "finish", updated_at: draft.updatedAt,
      data: { key: draft.key, origin: "new", seed: { kind: "numo" } },
    });
    await mount(restored);
    await submit();
    expect(mocks.createPage).not.toHaveBeenCalled();
    expectNormalNavigation();
  });


  it("rejects projected page overflow before creating a project and retains the editable brief", async () => {
    const text = "x\n\n".repeat(16_666);
    mocks.prepareBrief.mockRejectedValueOnce(new Error("Projected page too large"));
    await mount({ step: "finish", seed: { kind: "brief", text } });
    await submit();
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.createPage).not.toHaveBeenCalled();
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(text);
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Projected page too large");
    await typeBrief("A shorter brief");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await submit();
    await submit();
    expectNormalNavigation();
  });

  it("retains the full brief and its draft on page-write failure, then retries the same project", async () => {
    const text = "# Brief\n\n".padEnd(50_000, "x");
    mocks.createPage.mockRejectedValueOnce(new Error("Page service unavailable"));
    await mount({ step: "finish", seed: { kind: "brief", text } });
    await submit();
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Page service unavailable");
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: draft.id, step: "finish", seed: { kind: "brief", text },
    }));
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(takeSeedHandoff()).toBeNull();
    await submit();
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expect(mocks.createPage).toHaveBeenCalledTimes(2);
    expect(mocks.createPage.mock.calls[1][1].content.content[0].content[0].text).toBe(text);
    expect(mocks.deleteDraft).toHaveBeenCalledExactlyOnceWith(draft.id);
    expectNormalNavigation();
  });

  it("keeps the wizard retryable even when saving its recovery draft also fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createPage.mockRejectedValueOnce(new Error("Offline"));
    mocks.saveDraft.mockRejectedValueOnce(new Error("Offline"));
    await mount({ step: "finish", seed: { kind: "brief", text: "Keep this brief" } });
    await submit();
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Offline");
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
    await submit();
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expectNormalNavigation();
  });

  it("resumes the saved recovery draft against the already created project", async () => {
    mocks.createPage.mockRejectedValueOnce(new Error("Try again later"));
    await mount({ step: "finish", seed: { kind: "brief", text: "Saved recovery brief" } });
    await submit();
    const saved = mocks.saveDraft.mock.calls[0][0];
    await act(() => root.unmount());
    root = createRoot(host);
    mocks.projects = [{ id: draft.id, name: draft.name, owner_id: "owner" } as Project];
    await mount(saved);
    await submit();
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expect(mocks.createPage).toHaveBeenCalledTimes(2);
    expectNormalNavigation();
  });

  it("retains the CSV handoff for an existing project", async () => {
    await mount({ origin: "existing" });
    const file = new File(["title\nImported issue"], "issues.csv", { type: "text/csv" });
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(() => {
      Object.defineProperty(input, "files", { value: [file] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await submit();
    await submit();
    expect(mocks.createPage).not.toHaveBeenCalled();
    expect(takeSeedHandoff()).toEqual({ kind: "import", file });
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/projects/${draft.id}?setup=import`);
  });
});
