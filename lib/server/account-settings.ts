import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { locales, type Locale } from "@/i18n/config";
import {
  resolveNumoDefaultStatus,
  isNumoDefaultStatus,
} from "@/lib/numo-default-status";
import {
  PROMPT_COPY_AUTO_START_META_KEY,
  resolvePromptCopyAutoStart,
} from "@/lib/prompt-copy-auto-start";
import {
  AUTO_ASSIGN_ON_START_META_KEY,
  resolveAutoAssignOnStart,
} from "@/lib/auto-assign-on-start";
import { emailLocalPart } from "@/lib/display-name";

/**
 * The requesting user's own account settings, mirroring Account → Profile /
 * Preferences. Everything editable lives in the Supabase Auth account's
 * `user_metadata`, so these cores read/write it through the service admin API.
 * They act ONLY on the given userId — never another user's account.
 *
 * `email` is read-only (surfaced for context). `display_name` is written to both
 * `display_name` and `full_name` (the profile UI keeps them in sync).
 */

export interface AccountSettings {
  display_name: string;
  email: string | null;
  locale: Locale;
  numo_default_status: ReturnType<typeof resolveNumoDefaultStatus>;
  auto_assign_created: boolean;
  auto_assign_on_start: boolean;
  prompt_copy_auto_start: boolean;
}

function metaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : "";
}

function toSettings(
  meta: Record<string, unknown>,
  email: string | null
): AccountSettings {
  const rawLocale = meta.locale;
  const locale: Locale = locales.includes(rawLocale as Locale)
    ? (rawLocale as Locale)
    : "en";
  return {
    display_name:
      metaString(meta, "display_name") ||
      metaString(meta, "full_name") ||
      metaString(meta, "name") ||
      emailLocalPart(email) ||
      "",
    email,
    locale,
    numo_default_status: resolveNumoDefaultStatus(meta),
    auto_assign_created: meta.auto_assign_created === true,
    auto_assign_on_start: resolveAutoAssignOnStart(meta),
    prompt_copy_auto_start: resolvePromptCopyAutoStart(meta),
  };
}

export async function getAccountSettings({
  userId,
}: {
  userId: string;
}): Promise<
  { ok: true; settings: AccountSettings } | { ok: false; error: string }
> {
  const service = getServiceClient();
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Account not found." };
  }
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  return { ok: true, settings: toSettings(meta, data.user.email ?? null) };
}

export async function updateAccountSettings({
  userId,
  input,
}: {
  userId: string;
  input: Record<string, unknown>;
}): Promise<
  { ok: true; settings: AccountSettings } | { ok: false; error: string }
> {
  const service = getServiceClient();
  const { data: current, error: readErr } =
    await service.auth.admin.getUserById(userId);
  if (readErr || !current.user) {
    return { ok: false, error: readErr?.message ?? "Account not found." };
  }
  const meta = (current.user.user_metadata ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...meta };

  if ("display_name" in input) {
    const name = typeof input.display_name === "string" ? input.display_name.trim() : "";
    if (!name) return { ok: false, error: "display_name cannot be empty." };
    next.display_name = name;
    next.full_name = name;
  }
  if ("locale" in input) {
    if (!locales.includes(input.locale as Locale)) {
      return { ok: false, error: `locale must be one of: ${locales.join(", ")}.` };
    }
    next.locale = input.locale;
  }
  if ("numo_default_status" in input) {
    if (!isNumoDefaultStatus(input.numo_default_status)) {
      return {
        ok: false,
        error: "numo_default_status must be one of: triage, backlog, todo.",
      };
    }
    next.numo_default_status = input.numo_default_status;
  }
  if ("auto_assign_created" in input) {
    if (typeof input.auto_assign_created !== "boolean") {
      return { ok: false, error: "auto_assign_created must be a boolean." };
    }
    next.auto_assign_created = input.auto_assign_created;
  }
  if ("auto_assign_on_start" in input) {
    if (typeof input.auto_assign_on_start !== "boolean") {
      return { ok: false, error: "auto_assign_on_start must be a boolean." };
    }
    next[AUTO_ASSIGN_ON_START_META_KEY] = input.auto_assign_on_start;
  }
  if ("prompt_copy_auto_start" in input) {
    if (typeof input.prompt_copy_auto_start !== "boolean") {
      return { ok: false, error: "prompt_copy_auto_start must be a boolean." };
    }
    next[PROMPT_COPY_AUTO_START_META_KEY] = input.prompt_copy_auto_start;
  }

  // Nothing recognised to change.
  const CHANGEABLE = [
    "display_name",
    "locale",
    "numo_default_status",
    "auto_assign_created",
    "auto_assign_on_start",
    "prompt_copy_auto_start",
  ];
  if (!CHANGEABLE.some((k) => k in input)) {
    return { ok: false, error: "No account settings to update." };
  }

  const { data: updated, error: writeErr } =
    await service.auth.admin.updateUserById(userId, { user_metadata: next });
  if (writeErr || !updated.user) {
    console.error("[account-settings] update failed:", writeErr?.message);
    return { ok: false, error: writeErr?.message ?? "Update failed." };
  }
  const updatedMeta = (updated.user.user_metadata ?? {}) as Record<string, unknown>;
  return { ok: true, settings: toSettings(updatedMeta, updated.user.email ?? null) };
}
