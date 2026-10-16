// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDesktopNotifications } from "./use-desktop-notifications";
import type { DesktopBridge } from "./desktop/bridge";
import type { MyNotification } from "./types";
import type { PushTransportCapabilities } from "./push-devices-api";

const state = vi.hoisted(() => ({
  userId: "first-user" as string | null,
  initialized: false,
  rows: [] as MyNotification[],
  capabilities: null as PushTransportCapabilities | null,
}));
const shell = vi.hoisted(() => ({
  showLocalNotification: vi.fn(),
  dismissLocalNotification: vi.fn(),
  setBadgeCount: vi.fn(),
}));

vi.mock("./auth-context", () => ({
  useAuth: () => ({ user: state.userId ? { id: state.userId } : null }),
}));
vi.mock("./use-notifications", () => ({
  useNotifications: () => ({
    notifications: state.rows,
    unreadCount: state.rows.filter((row) => !row.read_at).length,
    initialized: state.initialized,
  }),
}));
vi.mock("./use-push-devices-query", () => ({
  usePushDevicesQuery: () => ({ capabilities: state.capabilities }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function notification(id: string): MyNotification {
  return {
    id,
    type: "comment",
    read_at: null,
    created_at: "2026-10-12T09:00:00Z",
    objective_id: null,
    objective_name: null,
    feedback_post_id: null,
    feedback_title: null,
    routine_id: null,
    routine_title: null,
    pull_request_id: null,
    pull_request_number: null,
    pull_request_title: null,
    page_id: null,
    page_title: null,
    block_id: null,
    project_id: "project-id",
    actor_name: null,
    actor_avatar_seed: null,
    from_numo: false,
    via_mcp: false,
    api_key_agent: null,
    api_key_name: null,
    via_smart_assign: false,
    via_automation: false,
    comment_excerpt: null,
    issue_id: "issue-id",
    issue_title: "A ticket",
    project_key: "MIN",
    issue_number: 682,
  };
}

function Host() {
  useDesktopNotifications();
  return null;
}

let root: Root;
const render = () => act(() => root.render(createElement(Host)));

beforeEach(() => {
  vi.clearAllMocks();
  state.userId = "first-user";
  state.initialized = false;
  state.rows = [];
  state.capabilities = null;
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  window.minddy = {
    ...shell,
    notificationCapabilities: {
      localNativeBanners: true,
      backgroundTransport: null,
      badge: "dock",
    },
  } as unknown as DesktopBridge;
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(() => root.unmount());
  delete window.minddy;
});

describe("desktop notification lifecycle", () => {
  it.each(["apns", "wns"] as const)("does not replay notifications after %s is disabled on the server", async (transport) => {
    window.minddy = { ...window.minddy!, notificationCapabilities: { ...window.minddy!.notificationCapabilities!, backgroundTransport: transport } };
    state.initialized = true;
    state.capabilities = { web: false, apns: transport === "apns", wns: transport === "wns" };
    await render();
    state.rows = [notification("native-delivery")];
    await render();
    state.capabilities = { web: false, apns: false, wns: false };
    await render();
    expect(shell.showLocalNotification).not.toHaveBeenCalled();

    state.rows = [notification("new-local"), ...state.rows];
    await render();
    expect(shell.showLocalNotification).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "new-local" }));
  });

  it.each([true, null])("dismisses read local banners even when APNs availability becomes %s", async (available) => {
    window.minddy = { ...window.minddy!, notificationCapabilities: { ...window.minddy!.notificationCapabilities!, backgroundTransport: "apns" } };
    state.initialized = true;
    state.capabilities = { web: false, apns: false, wns: false };
    await render();
    state.rows = [notification("local-banner")];
    await render();
    expect(shell.showLocalNotification).toHaveBeenCalledOnce();
    state.capabilities = available === null ? null : { web: false, apns: available, wns: false };
    state.rows = [{ ...notification("local-banner"), read_at: "2026-10-12T10:00:00Z" }];
    await render();
    expect(shell.dismissLocalNotification).toHaveBeenCalledExactlyOnceWith("local-banner");
  });

  it.each(["apns", "wns"] as const)("retains fresh notifications received while %s capabilities are pending", async (transport) => {
    window.minddy = { ...window.minddy!, notificationCapabilities: { ...window.minddy!.notificationCapabilities!, backgroundTransport: transport } };
    state.initialized = true;
    state.rows = [notification("historical")];
    await render();
    state.rows = [notification("during-discovery"), ...state.rows];
    await render();
    expect(shell.showLocalNotification).not.toHaveBeenCalled();

    state.capabilities = { web: false, apns: false, wns: false };
    await render();
    expect(shell.showLocalNotification).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "during-discovery" }));
    await render();
    expect(shell.showLocalNotification).toHaveBeenCalledTimes(1);
  });

  it("silently seeds macOS local banners once the server confirms APNs is unavailable", async () => {
    window.minddy = { ...window.minddy!, notificationCapabilities: { ...window.minddy!.notificationCapabilities!, backgroundTransport: "apns" } };
    state.initialized = true;
    state.rows = [notification("old")];
    await render();
    expect(shell.showLocalNotification).not.toHaveBeenCalled();
    state.capabilities = { web: false, apns: false, wns: false };
    await render();
    expect(shell.showLocalNotification).not.toHaveBeenCalled();
    state.rows = [notification("new"), ...state.rows];
    await render();
    expect(shell.showLocalNotification).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "new" }));
  });

  it("does not duplicate macOS banners delivered by a configured APNs server", async () => {
    window.minddy = { ...window.minddy!, notificationCapabilities: { ...window.minddy!.notificationCapabilities!, backgroundTransport: "apns" } };
    state.initialized = true;
    state.capabilities = { web: false, apns: true, wns: false };
    await render();
    state.rows = [notification("new")];
    await render();
    expect(shell.showLocalNotification).not.toHaveBeenCalled();
  });

  it("waits for the initial inbox snapshot before relaying fresh notifications", async () => {
    await render();
    // A failed first request still has no data and must not seed an empty inbox.
    await render();
    state.initialized = true;
    state.rows = [notification("old")];
    await render();
    expect(shell.showLocalNotification).not.toHaveBeenCalled();

    state.rows = [notification("new"), ...state.rows];
    await render();
    expect(shell.showLocalNotification).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "new" }),
    );
  });

  it("treats a successful empty inbox as an initial snapshot", async () => {
    state.initialized = true;
    await render();
    state.rows = [notification("new")];
    await render();
    expect(shell.showLocalNotification).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "new" }),
    );
  });

  it("dismisses unread native banners and clears the badge when signing out", async () => {
    state.initialized = true;
    await render();
    state.rows = [notification("new")];
    await render();
    state.userId = null;
    await render();
    expect(shell.dismissLocalNotification).toHaveBeenCalledExactlyOnceWith("new");
    expect(shell.setBadgeCount).toHaveBeenLastCalledWith(0);
  });

  it("silently seeds the next account and dismisses banners read elsewhere", async () => {
    state.initialized = true;
    await render();
    state.rows = [notification("new")];
    await render();
    state.rows = [{ ...notification("new"), read_at: "2026-10-12T10:00:00Z" }];
    await render();
    expect(shell.dismissLocalNotification).toHaveBeenCalledExactlyOnceWith("new");

    state.userId = "second-user";
    state.rows = [notification("second-account-old")];
    await render();
    expect(shell.showLocalNotification).toHaveBeenCalledTimes(1);
  });
});
