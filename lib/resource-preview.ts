"use client";

// The file a mention asked to preview (MIN-742). A mention pill lives deep in
// an editor node view or a rendered text; the reader opens once, at the app's
// root (components/resource-preview-host.tsx), from this store.

import { useSyncExternalStore } from "react";

export interface PreviewedResource {
  file_name: string;
  storage_path: string;
  mime_type?: string | null;
}

let current: PreviewedResource | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Open the shared file reader on this file. */
export function openResourcePreview(resource: PreviewedResource): void {
  current = resource;
  emit();
}

export function closeResourcePreview(): void {
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The file being previewed, or `null`. */
export function useResourcePreview(): PreviewedResource | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
