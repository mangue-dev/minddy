"use client";

import type { AppTab, AppTabPatch } from "./app-tabs";

export class AppTabRequestError extends Error {
  constructor(public code: string, public tab?: AppTab) { super(code); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/me/app-tabs${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  const data = await response.json();
  if (!response.ok) throw new AppTabRequestError(data.code ?? "database", data.tab);
  return data as T;
}
export const fetchAppTabs = (signal?: AbortSignal) => request<AppTab[]>("", { signal });
export async function createAppTab(ensure: boolean, id = crypto.randomUUID(), signal?: AbortSignal): Promise<AppTab> {
  return (await request<{ tab: AppTab }>("", { method: "POST", body: JSON.stringify({ ensure, id }), signal })).tab;
}
export async function patchAppTab(tab: AppTab, patch: AppTabPatch, signal?: AbortSignal): Promise<AppTab> {
  return (await request<{ tab: AppTab }>(`/${tab.id}`, { method: "PATCH", body: JSON.stringify({ revision: tab.revision, patch }), signal })).tab;
}
export async function deleteAppTab(tab: AppTab, signal?: AbortSignal): Promise<void> {
  await request(`/${tab.id}`, { method: "DELETE", body: JSON.stringify({ revision: tab.revision }), signal });
}
