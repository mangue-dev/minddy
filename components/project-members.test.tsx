// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Collaborator, Invitation, Member } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  invite: vi.fn(), inviteCollaborator: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(),
  collaborators: [] as Collaborator[], members: [] as Member[], invitations: [] as Invitation[],
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: keyof typeof en) => (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      (en[namespace] as Record<string, string>)[key] ?? key),
}));
vi.mock("@/lib/use-members-query", () => ({
  useMembersQuery: () => ({
    members: mocks.members, invitations: mocks.invitations, isOwner: true, loading: false,
    invite: mocks.invite, inviteCollaborator: mocks.inviteCollaborator,
    cancelInvitation: vi.fn(), removeMember: vi.fn(), updateMemberRole: vi.fn(),
    updateInvitationRole: vi.fn(), transferOwnership: vi.fn(),
  }),
}));
vi.mock("@/lib/use-billing-query", () => ({ usePlanGates: () => ({ maxMembersPerProject: null }) }));
vi.mock("@/lib/use-collaborators-query", () => ({ useCollaboratorsQuery: () => mocks.collaborators }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: ({ seed }: { seed: string }) => <span data-avatar={seed} /> }));
vi.mock("@/components/app-link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null, SelectContent: () => null, SelectItem: () => null,
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: () => null, DropdownMenuTrigger: () => null, DropdownMenuContent: () => null, DropdownMenuItem: () => null,
}));

import { ProjectMembers } from "./project-members";

const owner: Member = { user_id: "u-owner", email: "owner@example.com", full_name: "Owner", avatar_seed: "s", role: "owner", can_comment: true, is_owner: true };
const ana: Collaborator = { user_id: "u-ana", email: "ana@example.com", full_name: "Ana Costa", avatar_seed: "seed-ana" };
const bo: Collaborator = { user_id: "u-bo", email: "bo@example.com", full_name: "Bo Lind", avatar_seed: "seed-bo" };
const cy: Collaborator = { user_id: "u-cy", email: "cy@example.com", full_name: "Cy Ward", avatar_seed: "seed-cy" };

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // The settings cards adapt to the pointer and the viewport.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));
  mocks.collaborators = [ana, bo, cy];
  mocks.members = [owner, { ...owner, user_id: "u-bo", email: "bo@example.com", full_name: "Bo Lind", role: "member", is_owner: false, can_comment: false }];
  mocks.invitations = [{ id: "i1", project_id: "p", invited_email: "cy@example.com", status: "pending", created_at: "", role: "member", can_comment: false }];
  mocks.invite.mockResolvedValue(undefined);
  mocks.inviteCollaborator.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  // Help hints carry a tooltip, which needs the app's root provider.
  await act(() => root.render(<TooltipProvider><ProjectMembers projectId="p" enabled /></TooltipProvider>));
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function type(value: string) {
  const input = host.querySelector<HTMLInputElement>("#invite-email")!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const submit = () => act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const options = () => [...host.querySelectorAll('[role="option"]')].map((o) => o.textContent);

describe("project settings — inviting people from other projects (MIN-689)", () => {
  it("proposes only collaborators who are neither members nor already invited", async () => {
    expect(options()).toEqual([]);
    await type("a");
    expect(options()).toEqual(["Ana Costaana@example.com"]);
  });

  it("invites a picked collaborator by account with the chosen role", async () => {
    await type("costa");
    await act(() => host.querySelector<HTMLButtonElement>('[role="option"] button')!.click());
    expect(host.querySelector("#invite-email")).toBeNull();
    expect(host.querySelector('[data-avatar="seed-ana"]')).toBeTruthy();
    await submit();
    expect(mocks.inviteCollaborator).toHaveBeenCalledExactlyOnceWith("u-ana", { role: "member", can_comment: false });
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(en.Members.invitationSent.replace("{email}", "Ana Costa"));
  });

  it("selects the only match of a typed name instead of sending it as an address", async () => {
    await type("ana");
    await submit();
    expect(mocks.inviteCollaborator).not.toHaveBeenCalled();
    expect(host.querySelector('[data-avatar="seed-ana"]')).toBeTruthy();
  });

  it("asks to choose when a name matches nobody, and still invites a typed address", async () => {
    await type("nobody");
    await submit();
    expect(mocks.toastError).toHaveBeenCalledWith(en.Members.inviteChooseOrEmail);
    await type("new@example.com");
    await submit();
    expect(mocks.invite).toHaveBeenCalledExactlyOnceWith("new@example.com", { role: "member", can_comment: false });
  });
});
