import { nativePushTarget } from "./native-push";

export const MAX_ACTIVE_DESKTOP_NOTIFICATIONS = 32;
const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 160;
const MAX_BODY_LENGTH = 1_024;
const MAX_TARGET_LENGTH = 2_048;

export interface DesktopLocalNotificationPayload {
  id: string;
  title: string;
  body: string;
  target: string | null;
}

export interface DesktopLocalNotificationHandle {
  close(): void;
}

function boundedString(value: unknown, max: number, allowEmpty = false): string | null {
  if (typeof value !== "string" || value.length > max) return null;
  if (!allowEmpty && !value.trim()) return null;
  return value;
}

export function parseDesktopLocalNotificationId(input: unknown): string | null {
  return boundedString(input, MAX_ID_LENGTH);
}

/** Validate the complete renderer-to-main notification payload. */
export function parseDesktopLocalNotification(
  input: unknown
): DesktopLocalNotificationPayload | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const id = parseDesktopLocalNotificationId(value.id);
  const title = boundedString(value.title, MAX_TITLE_LENGTH);
  const body = boundedString(value.body, MAX_BODY_LENGTH, true);
  if (id === null || title === null || body === null) return null;

  let target: string | null = null;
  if (value.target !== null) {
    const candidate = boundedString(value.target, MAX_TARGET_LENGTH);
    if (candidate === null) return null;
    target = nativePushTarget(candidate);
    if (target === null) return null;
  }
  return { id, title, body, target };
}

/** Build a URL on the already selected desktop origin for a validated target. */
export function desktopLocalNotificationUrl(
  origin: string,
  target: string | null
): string | null {
  if (target === null) return null;
  const safeTarget = nativePushTarget(target);
  if (safeTarget === null) return null;
  try {
    const base = new URL(origin);
    const destination = new URL(safeTarget, base);
    return destination.origin === base.origin ? destination.href : null;
  } catch {
    return null;
  }
}

/**
 * Tracks live native banners, suppresses duplicate events, replaces banners for
 * the same destination, and bounds retained Electron objects.
 */
export class DesktopLocalNotificationRegistry {
  readonly #byId = new Map<
    string,
    { targetKey: string; handle: DesktopLocalNotificationHandle }
  >();
  readonly #idByTarget = new Map<string, string>();

  get size(): number {
    return this.#byId.size;
  }

  track(
    payload: DesktopLocalNotificationPayload,
    handle: DesktopLocalNotificationHandle
  ): boolean {
    if (this.#byId.has(payload.id)) return false;
    const targetKey = payload.target ?? `id:${payload.id}`;
    const replacedId = this.#idByTarget.get(targetKey);
    if (replacedId) this.dismiss(replacedId);

    while (this.#byId.size >= MAX_ACTIVE_DESKTOP_NOTIFICATIONS) {
      const oldestId = this.#byId.keys().next().value as string | undefined;
      if (!oldestId) break;
      this.dismiss(oldestId);
    }

    this.#byId.set(payload.id, { targetKey, handle });
    this.#idByTarget.set(targetKey, payload.id);
    return true;
  }

  dismiss(id: string): boolean {
    const current = this.#byId.get(id);
    if (!current) return false;
    this.#byId.delete(id);
    if (this.#idByTarget.get(current.targetKey) === id) {
      this.#idByTarget.delete(current.targetKey);
    }
    current.handle.close();
    return true;
  }

  forget(id: string): void {
    const current = this.#byId.get(id);
    if (!current) return;
    this.#byId.delete(id);
    if (this.#idByTarget.get(current.targetKey) === id) {
      this.#idByTarget.delete(current.targetKey);
    }
  }
}
