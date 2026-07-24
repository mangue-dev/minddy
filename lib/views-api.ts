"use client";

import type { CreateViewInput, View, ViewShare, ViewUpdateInput } from "./types";
import { trackEvent } from "./analytics";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

/** Where a board's views live: a project, or the global cross-project board. */
export type ViewScope = { kind: "project"; projectId: string } | { kind: "global" };

const viewsUrl = (scope: ViewScope) =>
  scope.kind === "project" ? `/api/projects/${scope.projectId}/views` : "/api/me/views";

export async function fetchViewsApi(scope: ViewScope): Promise<View[]> {
  return parseJson<View[]>(await fetch(viewsUrl(scope)));
}

export async function createViewApi(
  scope: ViewScope,
  input: CreateViewInput
): Promise<View> {
  trackEvent("view_created", {
    has_filters: Object.keys(input.filters ?? {}).length > 0,
    scope: scope.kind,
  });
  return parseJson<View>(
    await fetch(viewsUrl(scope), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function updateViewApi(
  viewId: string,
  updates: ViewUpdateInput
): Promise<View> {
  trackEvent("view_updated", {});
  return parseJson<View>(
    await fetch(`/api/views/${viewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
  );
}

export async function deleteViewApi(viewId: string): Promise<void> {
  trackEvent("view_deleted", {});
  const response = await fetch(`/api/views/${viewId}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Delete failed"
    );
  }
}

export async function fetchViewShareApi(viewId: string): Promise<ViewShare | null> {
  const data = await parseJson<{ share: ViewShare | null }>(
    await fetch(`/api/views/${viewId}/share`)
  );
  return data.share;
}

export async function updateViewShareApi(
  viewId: string,
  input: { level: "password" | "public"; password?: string }
): Promise<ViewShare> {
  trackEvent("share_link_created", { has_password: input.level === "password" });
  const data = await parseJson<{ share: ViewShare }>(
    await fetch(`/api/views/${viewId}/share`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  return data.share;
}

export async function deleteViewShareApi(viewId: string): Promise<void> {
  trackEvent("share_link_revoked", {});
  await parseJson<{ ok: boolean }>(
    await fetch(`/api/views/${viewId}/share`, { method: "DELETE" })
  );
}
