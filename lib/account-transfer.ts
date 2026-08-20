/**
 * Stable envelope for account transfers between minddy instances.
 *
 * The transfer format is intentionally separate from database migrations. An
 * instance may have a newer schema while still accepting older transfer files;
 * the importer owns the small compatibility layer at the boundary.
 */

export const ACCOUNT_TRANSFER_FORMAT = "minddy-account-transfer" as const;
export const ACCOUNT_TRANSFER_VERSION = 1;
export const CURRENT_ACCOUNT_EXPORT_VERSION = 3;
export const SUPPORTED_ACCOUNT_EXPORT_VERSIONS = [2, CURRENT_ACCOUNT_EXPORT_VERSION] as const;
export const MAX_ACCOUNT_TRANSFER_BYTES = 100 * 1024 * 1024;

export type TransferRow = Record<string, unknown>;

export interface AccountTransferDocument {
  transfer_format?: typeof ACCOUNT_TRANSFER_FORMAT;
  transfer_version?: number;
  format_version: number;
  exported_at: string;
  readme?: Record<string, string>;
  account: TransferRow;
  preferences: TransferRow | null;
  owned_projects: TransferRow[];
  memberships: TransferRow[];
  issues: TransferRow[];
  comments: TransferRow[];
  attachments: TransferRow[];
  page_files: TransferRow[];
  pages: TransferRow[];
  objectives: TransferRow[];
  categories?: TransferRow[];
  issue_categories?: TransferRow[];
  views: TransferRow[];
  cycles: TransferRow[];
  scratchpad: TransferRow | null;
  assistant_conversations: TransferRow[];
  code_agent_conversations: TransferRow[];
  notifications: TransferRow[];
  push_devices: TransferRow[];
  statistics: TransferRow[];
  billing: TransferRow | null;
  ai_usage: TransferRow[];
  api_keys: TransferRow[];
  connected_apps: TransferRow[];
  git_connections: TransferRow[];
  git_user_identities: TransferRow[];
  model_keys: TransferRow[];
}

export type TransferValidationError =
  | "notObject"
  | "unsupportedVersion"
  | "missingField"
  | "invalidField";

export type TransferValidationResult =
  | { ok: true; document: AccountTransferDocument }
  | { ok: false; error: TransferValidationError; field?: string };

const REQUIRED_ARRAYS = [
  "owned_projects",
  "memberships",
  "issues",
  "comments",
  "attachments",
  "page_files",
  "pages",
  "objectives",
  "views",
  "cycles",
  "assistant_conversations",
  "code_agent_conversations",
  "notifications",
  "push_devices",
  "statistics",
  "ai_usage",
  "api_keys",
  "connected_apps",
  "git_connections",
  "git_user_identities",
  "model_keys",
] as const;

function isRecord(value: unknown): value is TransferRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

/** Validate and normalize both the current envelope and legacy format v2 files. */
export function validateAccountTransfer(input: unknown): TransferValidationResult {
  if (!isRecord(input)) return { ok: false, error: "notObject" };

  const formatVersion = input.format_version;
  if (
    typeof formatVersion !== "number" ||
    !SUPPORTED_ACCOUNT_EXPORT_VERSIONS.includes(
      formatVersion as (typeof SUPPORTED_ACCOUNT_EXPORT_VERSIONS)[number],
    )
  ) {
    return { ok: false, error: "unsupportedVersion", field: "format_version" };
  }
  if (
    input.transfer_format !== undefined &&
    input.transfer_format !== ACCOUNT_TRANSFER_FORMAT
  ) {
    return { ok: false, error: "invalidField", field: "transfer_format" };
  }
  if (
    input.transfer_version !== undefined &&
    input.transfer_version !== ACCOUNT_TRANSFER_VERSION
  ) {
    return { ok: false, error: "unsupportedVersion", field: "transfer_version" };
  }
  if (typeof input.exported_at !== "string") {
    return { ok: false, error: "missingField", field: "exported_at" };
  }
  if (!isRecord(input.account)) {
    return { ok: false, error: "missingField", field: "account" };
  }

  for (const field of REQUIRED_ARRAYS) {
    if (!Array.isArray(input[field])) {
      return { ok: false, error: "missingField", field };
    }
    if (!input[field].every(isRecord)) {
      return { ok: false, error: "invalidField", field };
    }
  }

  for (const field of ["categories", "issue_categories"] as const) {
    if (input[field] !== undefined &&
      (!Array.isArray(input[field]) || !input[field].every(isRecord))) {
      return { ok: false, error: "invalidField", field };
    }
  }

  for (const field of ["preferences", "scratchpad", "billing"] as const) {
    if (input[field] !== null && input[field] !== undefined && !isRecord(input[field])) {
      return { ok: false, error: "invalidField", field };
    }
  }
  if (input.readme !== undefined && !isStringRecord(input.readme)) {
    return { ok: false, error: "invalidField", field: "readme" };
  }

  return {
    ok: true,
    document: {
      transfer_format: ACCOUNT_TRANSFER_FORMAT,
      transfer_version: ACCOUNT_TRANSFER_VERSION,
      format_version: formatVersion,
      exported_at: input.exported_at as string,
      readme: input.readme as Record<string, string> | undefined,
      account: input.account,
      preferences: (input.preferences as TransferRow | null | undefined) ?? null,
      owned_projects: input.owned_projects as TransferRow[],
      memberships: input.memberships as TransferRow[],
      issues: input.issues as TransferRow[],
      comments: input.comments as TransferRow[],
      attachments: input.attachments as TransferRow[],
      page_files: input.page_files as TransferRow[],
      pages: input.pages as TransferRow[],
      objectives: input.objectives as TransferRow[],
      categories: (input.categories as TransferRow[] | undefined) ?? [],
      issue_categories: (input.issue_categories as TransferRow[] | undefined) ?? [],
      views: input.views as TransferRow[],
      cycles: input.cycles as TransferRow[],
      scratchpad: (input.scratchpad as TransferRow | null | undefined) ?? null,
      assistant_conversations: input.assistant_conversations as TransferRow[],
      code_agent_conversations: input.code_agent_conversations as TransferRow[],
      notifications: input.notifications as TransferRow[],
      push_devices: input.push_devices as TransferRow[],
      statistics: input.statistics as TransferRow[],
      billing: (input.billing as TransferRow | null | undefined) ?? null,
      ai_usage: input.ai_usage as TransferRow[],
      api_keys: input.api_keys as TransferRow[],
      connected_apps: input.connected_apps as TransferRow[],
      git_connections: input.git_connections as TransferRow[],
      git_user_identities: input.git_user_identities as TransferRow[],
      model_keys: input.model_keys as TransferRow[],
    },
  };
}
