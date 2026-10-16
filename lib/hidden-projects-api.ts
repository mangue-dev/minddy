"use client";

import { fetchClientRead } from "./client-read";
import { apiErrorCode, HttpResponseError } from "./backend-availability";

async function failure(response: Response): Promise<never> {
  const data = await response.json().catch(() => null) as { error?: string } | null;
  throw new HttpResponseError(data?.error || "Request failed", response.status, apiErrorCode(data));
}

/** The ids of the projects I hid from my navigation (MIN-692). */
export async function fetchHiddenProjectIdsApi(): Promise<string[]> {
  const response = await fetchClientRead("/api/account/hidden-projects");
  if (!response.ok) return failure(response);
  const data: unknown = await response.json();
  return Array.isArray(data) ? data.filter((id): id is string => typeof id === "string") : [];
}

/** Hides (`true`) or shows (`false`) one project for me. */
export async function setProjectHiddenApi(projectId: string, hidden: boolean): Promise<void> {
  const response = await fetch(`/api/account/hidden-projects/${encodeURIComponent(projectId)}`, {
    method: hidden ? "PUT" : "DELETE",
  });
  if (!response.ok) await failure(response);
}
