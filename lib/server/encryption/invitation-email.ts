import "server-only";

import {
  blindIndex,
  normalizeEmailForIndex,
  type Encrypted,
  type EncryptionContext,
  type EncryptionScope,
} from "./store";
import { getBlindIndexKeys, getEncryptedStore } from "./registry";
import { auditDecryption, type DecryptAudit } from "./audit";
import { hasDataRootKey } from "./local-key-wrapper";

const INDEX_SCOPE: EncryptionScope = {
  kind: "system",
  id: "00000000-0000-0000-0000-000000000000",
};
const INDEX_CONTEXT = {
  scope: INDEX_SCOPE,
  table: "project_invitations",
  column: "invited_email",
};

export type InvitationEmailColumns = {
  invited_email: string | null;
  invited_email_ciphertext: Encrypted<string> | null;
  invited_email_blind_index: string | null;
  encryption_version: number;
};

export function missingInvitationEncryptionSchema(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

/** Preview deployments can serve the legacy schema before the additive migration. */
export function legacyInvitationEmailColumns<T extends { invited_email: string | null }>(
  row: T,
): T & InvitationEmailColumns {
  return {
    ...row,
    invited_email_ciphertext: null,
    invited_email_blind_index: null,
    encryption_version: 0,
  };
}

export function isInvitationEncryptionEnabled(): boolean {
  return process.env.MINDDY_INVITATION_ENCRYPTION_ENABLED === "true";
}

export function isInvitationEncryptionConfigured(): boolean {
  return hasDataRootKey();
}

function valueContext(projectId: string, invitationId: string): EncryptionContext {
  return {
    scope: { kind: "project", id: projectId },
    table: "project_invitations",
    column: "invited_email",
    rowId: invitationId,
  };
}

export async function invitationEmailIndex(email: string): Promise<string> {
  const key = await getBlindIndexKeys().current(INDEX_SCOPE);
  try {
    return blindIndex(normalizeEmailForIndex(email), INDEX_CONTEXT, key.bytes);
  } finally {
    key.bytes.fill(0);
  }
}

export async function encryptInvitationEmail(
  email: string,
  projectId: string,
  invitationId: string,
): Promise<Pick<InvitationEmailColumns,
  "invited_email_ciphertext" | "invited_email_blind_index" | "encryption_version">> {
  const normalized = normalizeEmailForIndex(email);
  const store = getEncryptedStore();
  const [ciphertext, index] = await Promise.all([
    store.encrypt(normalized, valueContext(projectId, invitationId)),
    invitationEmailIndex(normalized),
  ]);
  return {
    invited_email_ciphertext: ciphertext,
    invited_email_blind_index: index,
    encryption_version: store.versionOf(ciphertext),
  };
}

/** Legacy plaintext is accepted only for rows explicitly marked version 0. */
export async function decryptInvitationEmail(
  row: InvitationEmailColumns & { id: string; project_id: string },
  audit: DecryptAudit,
): Promise<string> {
  const context = valueContext(row.project_id, row.id);
  if (row.encryption_version === 0 && typeof row.invited_email === "string") {
    auditDecryption(context, audit);
    return row.invited_email;
  }
  if (row.encryption_version < 1 || row.invited_email !== null ||
      !row.invited_email_ciphertext || !row.invited_email_blind_index) {
    throw new Error("Invalid invitation encryption state");
  }
  const store = getEncryptedStore();
  const ciphertext = store.fromDatabase<string>(row.invited_email_ciphertext);
  if (store.versionOf(ciphertext) !== row.encryption_version) {
    throw new Error("Invalid invitation encryption version");
  }
  const plaintext = await store.decrypt(ciphertext, context);
  auditDecryption(context, audit);
  return plaintext;
}
