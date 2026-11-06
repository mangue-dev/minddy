"use client";

/** Calls to `/api/account/numo-memories` (MIN-915): one fetch per gesture,
 * with the server's error passed through for the toast. */

export interface NumoMemoryItem {
  id: string;
  project_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export const numoMemoriesQueryKey = ["numo-memories"] as const;

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as T & { error?: string } | null;
  if (!response.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}

export async function fetchNumoMemoriesApi(): Promise<NumoMemoryItem[]> {
  const data = await parseJson<{ memories: NumoMemoryItem[] }>(
    await fetch("/api/account/numo-memories"));
  return data.memories;
}

export async function updateNumoMemoryApi(id: string, content: string): Promise<NumoMemoryItem> {
  const data = await parseJson<{ memory: NumoMemoryItem }>(await fetch(
    `/api/account/numo-memories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }));
  return data.memory;
}

export async function deleteNumoMemoryApi(id: string): Promise<void> {
  await parseJson(await fetch(`/api/account/numo-memories/${encodeURIComponent(id)}`,
    { method: "DELETE" }));
}

export async function deleteAllNumoMemoriesApi(): Promise<void> {
  await parseJson(await fetch("/api/account/numo-memories", { method: "DELETE" }));
}
