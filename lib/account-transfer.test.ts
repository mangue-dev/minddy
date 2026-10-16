import { describe, expect, it } from "vitest";

import {
  ACCOUNT_TRANSFER_FORMAT,
  ACCOUNT_TRANSFER_VERSION,
  CURRENT_ACCOUNT_EXPORT_VERSION,
  RETIRED_ACCOUNT_TRANSFER_SECTIONS,
  validateAccountTransfer,
} from "@/lib/account-transfer";

const emptyDocument = {
  format_version: 2,
  exported_at: "2026-08-20T00:00:00.000Z",
  account: { id: "source-user" },
  preferences: null,
  owned_projects: [],
  memberships: [],
  issues: [],
  comments: [],
  attachments: [],
  page_files: [],
  pages: [],
  objectives: [],
  views: [],
  cycles: [],
  scratchpad: null,
  assistant_conversations: [],
  code_agent_conversations: [],
  notifications: [],
  push_devices: [],
  statistics: [],
  billing: null,
  ai_usage: [],
  api_keys: [],
  connected_apps: [],
  git_connections: [],
  git_user_identities: [],
  model_keys: [],
};

describe("account transfer compatibility", () => {
  it("retains personal Numo defaults and rejects malformed preference arrays", () => {
    const rows = [{ provider: "openrouter", model: "test/model" }];
    const result = validateAccountTransfer({ ...emptyDocument, numo_preferences: rows });
    expect(result.ok && result.document.numo_preferences).toEqual(rows);
    expect(validateAccountTransfer({ ...emptyDocument, numo_preferences: "bad" }))
      .toMatchObject({ ok: false, field: "numo_preferences" });
  });
  it("accepts legacy v2 exports and normalizes the current envelope", () => {
    const result = validateAccountTransfer(emptyDocument);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.transfer_format).toBe(ACCOUNT_TRANSFER_FORMAT);
    expect(result.document.transfer_version).toBe(ACCOUNT_TRANSFER_VERSION);
    expect(result.document.categories).toEqual([]);
    expect(result.document.issue_categories).toEqual([]);
  });

  it("accepts the explicit current transfer envelope without the retired sections", () => {
    const { preferences: _preferences, code_agent_conversations: _code, ...current } =
      emptyDocument;
    const result = validateAccountTransfer({
      ...current,
      format_version: CURRENT_ACCOUNT_EXPORT_VERSION,
      transfer_format: ACCOUNT_TRANSFER_FORMAT,
      transfer_version: ACCOUNT_TRANSFER_VERSION,
      categories: [],
      issue_categories: [],
    });

    expect(result.ok).toBe(true);
  });

  it("accepts a v3 file with code-agent sections and leaves them out of the document", () => {
    const result = validateAccountTransfer({
      ...emptyDocument,
      format_version: 3,
      preferences: { default_model: "legacy/model", branch_prefix: "agent/" },
      code_agent_conversations: [{ id: "conversation", turns: [], messages: [] }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const section of RETIRED_ACCOUNT_TRANSFER_SECTIONS) {
      expect(result.document).not.toHaveProperty(section);
    }
  });

  it("ignores malformed retired sections instead of rejecting the file", () => {
    expect(validateAccountTransfer({
      ...emptyDocument,
      format_version: 3,
      preferences: "legacy",
      code_agent_conversations: "legacy",
    })).toMatchObject({ ok: true });
  });

  it("rejects unknown versions and malformed collections", () => {
    expect(validateAccountTransfer({ ...emptyDocument, format_version: 99 })).toMatchObject({
      ok: false,
      error: "unsupportedVersion",
    });
    expect(validateAccountTransfer({ ...emptyDocument, issues: "not-an-array" })).toMatchObject({
      ok: false,
      error: "missingField",
      field: "issues",
    });
  });
});
