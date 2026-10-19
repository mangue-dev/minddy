// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import type { Collaborator, Project } from "@/lib/types";
import { projectDraftFromRow, projectDraftToRow, type ProjectDraft } from "@/lib/project-draft";
import { takeSeedHandoff } from "@/lib/project-seed-handoff";
import type { WizardStep } from "@/components/wizard/wizard-dialog";

const mocks = vi.hoisted(() => ({
  push: vi.fn(), createProject: vi.fn(), createPage: vi.fn(),
  updateProject: vi.fn(), deleteDraft: vi.fn(), invalidate: vi.fn(),
  track: vi.fn(), close: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(),
  prepareBrief: vi.fn(), saveDraft: vi.fn(), projects: [] as Project[],
  invite: vi.fn(), memberLimit: null as number | null, events: [] as string[],
  closeDialog: null as { onSave: () => void; onDiscard: () => void } | null,
  inviteCollaborator: vi.fn(), collaborators: [] as Collaborator[],
}));
vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => ({ push: mocks.push }) }));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace: keyof typeof en) => (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)).replaceAll(`{${name}, number}`, String(value)),
      (en[namespace] as Record<string, string>)[key] ?? key),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: () => ({ data: mocks.collaborators }),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "owner", email: "Owner@Example.com" } }) }));
vi.mock("@/lib/members-api", () => ({
  inviteMemberApi: mocks.invite, inviteCollaboratorApi: mocks.inviteCollaborator, fetchCollaboratorsApi: vi.fn(),
}));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: ({ seed }: { seed: string }) => <span data-avatar={seed} /> }));
vi.mock("@/lib/use-billing-query", () => ({ usePlanGates: () => ({ maxMembersPerProject: mocks.memberLimit }) }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({
  projects: mocks.projects, createProject: mocks.createProject, updateProject: mocks.updateProject,
  saveProjectDraft: mocks.saveDraft, deleteProjectDraft: mocks.deleteDraft,
}) }));
vi.mock("@/lib/use-git-connections-query", () => ({ useGitConnectionsQuery: () => ({ connections: [], providers: [] }) }));
vi.mock("@/lib/pages-api", () => ({ createPageApi: mocks.createPage, prepareInitialBriefApi: mocks.prepareBrief }));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => ({ track: mocks.track }) }));
vi.mock("@/lib/use-track-view", () => ({ useTrackView: vi.fn() }));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/components/ui/button", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Button: ({ children, variant: _variant, size: _size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/input", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("@/components/ui/textarea", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));
vi.mock("@/components/ui/spinner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Spinner: () => null,
}));
vi.mock("@/components/ui/switch", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Switch: () => null,
}));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
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
vi.mock("@/components/close-project-draft-dialog", () => ({
  CloseProjectDraftDialog: (props: { onSave: () => void; onDiscard: () => void }) => {
    mocks.closeDialog = props;
    return null;
  },
}));
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
  autoAssignEnabled: false, invitees: [], inviteeUsers: [], updatedAt: "2026-10-06T10:00:00Z",
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
  mocks.memberLimit = null;
  mocks.collaborators = [];
  mocks.inviteCollaborator.mockImplementation(async (_projectId: string, userId: string) => {
    mocks.events.push(`invite-user:${userId}`);
  });
  mocks.events = [];
  mocks.createProject.mockImplementation(async () => {
    mocks.events.push("create");
    return { id: draft.id, name: draft.name };
  });
  mocks.invite.mockImplementation(async (_projectId: string, email: string) => {
    mocks.events.push(`invite:${email}`);
  });
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
    await submit();
    expect(mocks.createPage).not.toHaveBeenCalled();
    expect(takeSeedHandoff()).toEqual({ kind: "import", file });
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/projects/${draft.id}?setup=import`);
  });
});

async function typeInvitee(value: string) {
  const input = host.querySelector<HTMLInputElement>("#project-invitee")!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pressEnterInInvitee() {
  const input = host.querySelector<HTMLInputElement>("#project-invitee")!;
  await act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
}

const queued = () => [...host.querySelectorAll(`[aria-label="${en.Projects.wizardMembersListLabel}"] li`)].map((li) => li.textContent);
const suggested = () => [...host.querySelectorAll('[role="option"]')].map((li) => li.textContent);
const inviteeError = () => host.querySelector("#project-invitee-error")?.textContent ?? null;

describe("member invitations", () => {
  it("queues normalized addresses, refuses invalid, duplicate and own ones, and sends nothing before Finish", async () => {
    await mount({ step: "members" });
    expect(host.textContent).toContain(en.Projects.wizardMembersTitle);
    expect(host.querySelector("[data-submit]")!.textContent).toBe(en.Common.skip);

    await typeInvitee("  Ana@Example.com ");
    await pressEnterInInvitee();
    expect(queued()).toEqual(["ana@example.com"]);
    expect(host.querySelector<HTMLInputElement>("#project-invitee")!.value).toBe("");
    expect(host.querySelector("[data-submit]")!.textContent).toBe("Continue");

    await typeInvitee("not-an-email");
    await pressEnterInInvitee();
    expect(inviteeError()).toBe(en.Projects.wizardMembersInvalid);
    await typeInvitee("ANA@example.com");
    await pressEnterInInvitee();
    expect(inviteeError()).toBe(en.Projects.wizardMembersDuplicate.replace("{email}", "ana@example.com"));
    await typeInvitee("owner@example.com");
    await pressEnterInInvitee();
    expect(inviteeError()).toBe(en.Projects.wizardMembersSelf);
    expect(queued()).toEqual(["ana@example.com"]);

    await typeInvitee("li@example.com");
    await pressEnterInInvitee();
    const remove = host.querySelector<HTMLButtonElement>(
      `[aria-label="${en.Projects.wizardMembersRemove.replace("{email}", "ana@example.com")}"]`,
    )!;
    await act(() => remove.click());
    expect(queued()).toEqual(["li@example.com"]);
    expect(mocks.invite).not.toHaveBeenCalled();
  });

  it("adds a typed address on Continue instead of dropping it, and stays when it is invalid", async () => {
    await mount({ step: "members" });
    await typeInvitee("typo@");
    await submit();
    expect(inviteeError()).toBe(en.Projects.wizardMembersInvalid);
    expect(host.textContent).toContain(en.Projects.wizardMembersTitle);
    await typeInvitee("kept@example.com");
    await submit();
    expect(host.textContent).toContain(en.Projects.wizardFinishTitle);
    expect(mocks.invite).not.toHaveBeenCalled();
    await submit();
    expect(mocks.invite).toHaveBeenCalledExactlyOnceWith(draft.id, "kept@example.com");
  });

  it("stops queueing at the plan's guest limit", async () => {
    mocks.memberLimit = 1;
    await mount({ step: "members", invitees: ["ana@example.com"] });
    expect(host.querySelector<HTMLInputElement>("#project-invitee")!.disabled).toBe(true);
    expect(host.textContent).toContain(en.Members.inviteLimitReached.replace("{limit}", "1"));
  });

  it("saves the queue with the draft and restores it on resume, without sending anything", async () => {
    await mount({ step: "members" });
    await typeInvitee("ana@example.com");
    await pressEnterInInvitee();
    // “I will resume” from the close prompt: the same snapshot a git round
    // trip saves before leaving the page.
    await act(async () => mocks.closeDialog!.onSave());
    expect(mocks.saveDraft).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ step: "members", invitees: ["ana@example.com"] }),
    );
    expect(mocks.close).toHaveBeenCalledWith(false);
    const saved = mocks.saveDraft.mock.calls[0][0];
    await act(() => root.unmount());
    root = createRoot(host);
    await mount(projectDraftFromRow({ ...projectDraftToRow(saved), updated_at: draft.updatedAt }));
    expect(queued()).toEqual(["ana@example.com"]);
    expect(mocks.invite).not.toHaveBeenCalled();
  });

  it("sends nothing when the draft is discarded", async () => {
    await mount({ step: "finish", invitees: ["ana@example.com"] });
    await act(async () => mocks.closeDialog!.onDiscard());
    expect(mocks.deleteDraft).toHaveBeenCalledExactlyOnceWith(draft.id);
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.invite).not.toHaveBeenCalled();
  });

  it("invites each queued address once the project exists, then navigates as before", async () => {
    await mount({ step: "finish", invitees: ["ana@example.com", "li@example.com"] });
    await submit();
    expect(mocks.events).toEqual(["create", "invite:ana@example.com", "invite:li@example.com"]);
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["members", draft.id] });
    expect(mocks.toastError).not.toHaveBeenCalled();
    expectNormalNavigation();
  });

  it("sends nothing when the project cannot be created", async () => {
    mocks.createProject.mockRejectedValueOnce(new Error("Key already taken"));
    await mount({ step: "finish", invitees: ["ana@example.com"] });
    await submit();
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("waits for a failed brief to be saved, then invites once with the same project", async () => {
    mocks.createPage.mockRejectedValueOnce(new Error("Page service unavailable"));
    await mount({ step: "finish", seed: { kind: "brief", text: "Brief" }, invitees: ["ana@example.com"] });
    await submit();
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ invitees: ["ana@example.com"] }));
    await submit();
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expect(mocks.invite).toHaveBeenCalledExactlyOnceWith(draft.id, "ana@example.com");
    expectNormalNavigation();
  });

  it("keeps inviting after a refusal and reports who was not invited", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.invite.mockImplementation(async (_projectId: string, email: string) => {
      mocks.events.push(`invite:${email}`);
      if (email === "ana@example.com") throw new Error("Your plan stops at 1 guests per project.");
      if (email === "bo@example.com") throw new Error("Too many invitations. Try again later.");
    });
    await mount({ step: "finish", invitees: ["ana@example.com", "bo@example.com", "li@example.com"] });
    await submit();
    expect(mocks.events).toEqual(["create", "invite:ana@example.com", "invite:bo@example.com", "invite:li@example.com"]);
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    const [, options] = mocks.toastError.mock.calls[0];
    expect(options.duration).toBe(Infinity);
    const description = renderToStaticMarkup(options.description);
    expect(description).toContain("ana@example.com — Your plan stops at 1 guests per project.");
    expect(description).toContain("bo@example.com — Too many invitations. Try again later.");
    expect(description).not.toContain("li@example.com");
    expect(description).toContain(en.Projects.wizardMembersFailedHint.replaceAll("'", "&#x27;"));
    expectNormalNavigation();
  });

  it("drops the owner's own address from a resumed draft instead of sending it", async () => {
    await mount({ step: "finish", invitees: ["owner@example.com", "ana@example.com"] });
    await submit();
    expect(mocks.invite).toHaveBeenCalledExactlyOnceWith(draft.id, "ana@example.com");
  });
});

describe("inviting people from other projects", () => {
  const ana: Collaborator = { user_id: "u-ana", email: "ana@example.com", full_name: "Ana Costa", avatar_seed: "seed-ana" };
  const bo: Collaborator = { user_id: "u-bo", email: "bo@example.com", full_name: "Bo Lind", avatar_seed: "seed-bo" };
  beforeEach(() => {
    mocks.collaborators = [ana, bo];
  });

  it("proposes collaborators by name and queues the pick with their avatar and real name", async () => {
    await mount({ step: "members" });
    expect(suggested()).toEqual(["Ana Costaana@example.com", "Bo Lindbo@example.com"]);
    await typeInvitee("cost");
    expect(suggested()).toEqual(["Ana Costaana@example.com"]);
    await act(() => host.querySelector<HTMLButtonElement>('[role="option"] button')!.click());
    expect(queued()).toEqual(["Ana Costaana@example.com"]);
    expect(host.querySelector(`[aria-label="${en.Projects.wizardMembersListLabel}"] [data-avatar="seed-ana"]`)).toBeTruthy();
    expect(suggested()).toEqual(["Bo Lindbo@example.com"]);
    expect(host.querySelector<HTMLInputElement>("#project-invitee")!.value).toBe("");
    expect(mocks.inviteCollaborator).not.toHaveBeenCalled();
  });

  it("picks the only match on Enter, and the collaborator behind a typed address", async () => {
    await mount({ step: "members" });
    await typeInvitee("bo l");
    await pressEnterInInvitee();
    await typeInvitee("ANA@example.com");
    await pressEnterInInvitee();
    expect(queued()).toEqual(["Bo Lindbo@example.com", "Ana Costaana@example.com"]);
    await typeInvitee("bo@example.com");
    await pressEnterInInvitee();
    expect(inviteeError()).toBe(en.Projects.wizardMembersDuplicate.replace("{email}", "Bo Lind"));
  });

  it("asks to choose when a name matches several people or nobody", async () => {
    await mount({ step: "members" });
    await typeInvitee("o");
    await pressEnterInInvitee();
    expect(inviteeError()).toBe(en.Projects.wizardMembersInvalid);
    expect(queued()).toEqual([]);
  });

  it("saves picks with the draft and invites them by account after creation", async () => {
    await mount({ step: "members" });
    await typeInvitee("ana");
    await pressEnterInInvitee();
    await typeInvitee("li@example.com");
    await pressEnterInInvitee();
    await act(async () => mocks.closeDialog!.onSave());
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      invitees: ["li@example.com"],
      inviteeUsers: [{ userId: "u-ana", email: "ana@example.com", name: "Ana Costa", avatarSeed: "seed-ana" }],
    }));

    const saved = mocks.saveDraft.mock.calls[0][0];
    await act(() => root.unmount());
    root = createRoot(host);
    await mount({ ...projectDraftFromRow({ ...projectDraftToRow(saved), updated_at: draft.updatedAt }), step: "finish" });
    await submit();
    expect(mocks.events).toEqual(["create", "invite-user:u-ana", "invite:li@example.com"]);
    expect(mocks.inviteCollaborator).toHaveBeenCalledExactlyOnceWith(draft.id, "u-ana");
  });

  it("names a refused collaborator in the failure notification", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.inviteCollaborator.mockRejectedValueOnce(new Error("This person is not part of your projects."));
    await mount({ step: "finish", inviteeUsers: [{ userId: "u-ana", email: "ana@example.com", name: "Ana Costa", avatarSeed: "seed-ana" }] });
    await submit();
    const description = renderToStaticMarkup(mocks.toastError.mock.calls[0][1].description);
    expect(description).toContain("Ana Costa — This person is not part of your projects.");
    expectNormalNavigation();
  });
});
