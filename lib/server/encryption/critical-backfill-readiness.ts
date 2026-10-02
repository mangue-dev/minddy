import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodePullRequestContent, isEncryptedPullRequestContent,
  PR_CONTENT_FIELDS, pullRequestContentState } from
  "@/lib/server/agent/pull-request-content";
import { decodePullRequestUrl, isEncryptedPullRequestUrl,
  pullRequestUrlState } from "@/lib/server/agent/pull-request-url-content";
import { decodeAgentCheckpoint } from "@/lib/server/agent/run-checkpoint-content";
import { decodeJournal } from "@/lib/server/agent/encrypted-journal";
import { decodeOAuthClientContent } from "@/lib/server/oauth/client-content";
import { decodeOAuthCodeContent } from "@/lib/server/oauth/code-content";
import { decodeApiKeyContent } from "@/lib/server/api-key-content";
import { decodeIntegrationField, integrationFieldVersion } from
  "@/lib/server/integration-content";
import { openPush, pushVersion, type StoredPush } from "@/lib/server/push/content";
import { billingFieldVersion, decodeBillingField } from "@/lib/server/billing-content";
import { getContentKeys, getEncryptedStore } from "./registry";

const PAGE_SIZE = 100;
const SYSTEM = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };
type Family = "pullRequests" | "runCheckpoints" | "runtimeCheckpoints" |
  "journals" | "oauthClients" | "oauthCodes" | "apiKeys" |
  "integrations" | "pushSubscriptions" | "billingIdentities";
type Counts = Record<Family, number>;
type PrRow = { id: string; url: string | null; title: string | null;
  head_branch: string | null; base_branch: string | null;
  url_encryption_checked_at: string | null;
  content_encryption_checked_at: string | null };
type RunRow = { id: string; project_id: string; checkpoint: unknown;
  checkpoint_ciphertext: string | null; checkpoint_encryption_version: number;
  checkpoint_encryption_checked_at: string | null };
type RuntimeRow = { conversation_id: string; current_run_id: string | null;
  checkpoint: unknown; checkpoint_ciphertext: string | null;
  checkpoint_encryption_version: number;
  checkpoint_encryption_checked_at: string | null;
  conversation: { project_id: string } | Array<{ project_id: string }> | null };
type JournalRow = Parameters<typeof decodeJournal>[1] & {
  run: { project_id: string } | Array<{ project_id: string }> | null;
  encryption_checked_at: string | null };
type OAuthClientRow = Parameters<typeof decodeOAuthClientContent>[0] & {
  encrypted_content: string | null; encryption_version: number;
  encryption_checked_at: string | null };
type OAuthCodeRow = Parameters<typeof decodeOAuthCodeContent>[0] & {
  encrypted_content: string | null; encryption_version: number;
  encryption_checked_at: string | null };
type ApiKeyRow = Parameters<typeof decodeApiKeyContent>[0] & {
  encrypted_content: string | null; encryption_version: number;
  encryption_checked_at: string | null };
type IntegrationRow = { id: string; project_id: string; name: string;
  webhook_url: string | null; name_encryption_checked_at: string | null;
  webhook_encryption_checked_at: string | null };
type PushRow = StoredPush & { encrypted_content: string | null;
  encryption_checked_at: string | null };
type BillingRow = { user_id: string; email: string | null;
  admin_override_note: string | null; email_encryption_checked_at: string | null;
  admin_override_note_encryption_checked_at: string | null };

/** Scan every current row and authenticate each encrypted source before activation. */
export async function verifyCriticalBackfillReadiness() {
  const scanned: Counts = { pullRequests: 0, runCheckpoints: 0,
    runtimeCheckpoints: 0, journals: 0, oauthClients: 0,
    oauthCodes: 0, apiKeys: 0, integrations: 0,
    pushSubscriptions: 0, billingIdentities: 0 };
  const blocked: Counts = { ...scanned };
  const service = getServiceClient();
  const versions = new Map<string, number | null>();
  let missingKeys = 0;
  const currentVersion = async (kind: "system" | "project" | "user", id: string) => {
    const identity = `${kind}:${id}`;
    if (!versions.has(identity)) {
      const key = await getContentKeys().existingCurrent({ kind, id });
      if (!key) missingKeys++;
      versions.set(identity, key?.version ?? null);
      key?.bytes.fill(0);
    }
    return versions.get(identity) ?? null;
  };
  await currentVersion(SYSTEM.kind, SYSTEM.id);
  const scan = async <T>(family: Family,
    fetch: (after: string | number | null) => PromiseLike<{ data: unknown[] | null;
      error: { code?: string } | null }>,
    idOf: (row: T) => string | number,
    check: (row: T) => Promise<boolean>) => {
    let after: string | number | null = null;
    for (;;) {
      const { data, error } = await fetch(after);
      if (error || !data) throw new Error(`Unable to scan ${family} encryption readiness`);
      for (const row of data as T[]) {
        scanned[family]++;
        try {
          if (!await check(row)) blocked[family]++;
        } catch {
          blocked[family]++;
        }
      }
      if (data.length < PAGE_SIZE) break;
      after = idOf(data.at(-1) as T);
    }
  };
  await scan<PrRow>("pullRequests", (after) => {
    let query = service.from("pull_requests")
      .select("id,url,title,head_branch,base_branch,url_encryption_checked_at,content_encryption_checked_at");
    if (after !== null) query = query.gt("id", after);
    return query.order("id").limit(PAGE_SIZE);
  }, (row) => row.id, async (row) => {
    if (row.url === null && PR_CONTENT_FIELDS.every((field) => row[field] === null)) {
      return true;
    }
    const current = await currentVersion(SYSTEM.kind, SYSTEM.id);
    if (current === null) return false;
    if (row.url !== null) {
      if (!row.url_encryption_checked_at || !isEncryptedPullRequestUrl(row.url) ||
          pullRequestUrlState(row.url).version !== current ||
          pullRequestUrlState(row.url).format !== 3 ||
          !await decodePullRequestUrl(row.id, row.url)) return false;
    }
    if (PR_CONTENT_FIELDS.some((field) => row[field] !== null) &&
        !row.content_encryption_checked_at) return false;
    for (const field of PR_CONTENT_FIELDS) {
      const stored = row[field];
      if (stored !== null && (!isEncryptedPullRequestContent(stored) ||
          pullRequestContentState(stored).version !== current ||
          pullRequestContentState(stored).format !== 3 ||
          !await decodePullRequestContent(row.id, field, stored))) return false;
    }
    return true;
  });
  await scan<RunRow>("runCheckpoints", (after) => {
    let query = service.from("agent_runs")
      .select("id,project_id,checkpoint,checkpoint_ciphertext,checkpoint_encryption_version,checkpoint_encryption_checked_at");
    if (after !== null) query = query.gt("id", after);
    return query.order("id").limit(PAGE_SIZE);
  }, (row) => row.id, async (row) => {
    if (!row.checkpoint_encryption_checked_at) return false;
    if (row.checkpoint === null && row.checkpoint_ciphertext === null &&
        row.checkpoint_encryption_version === 0) return true;
    if (!row.project_id || row.checkpoint_encryption_version !==
        await currentVersion("project", row.project_id)) return false;
    if (!row.checkpoint_ciphertext ||
        getEncryptedStore().formatOf(
          getEncryptedStore().fromDatabase(row.checkpoint_ciphertext)) !== 3) return false;
    await decodeAgentCheckpoint(row as Parameters<typeof decodeAgentCheckpoint>[0]);
    return true;
  });
  await scan<RuntimeRow>("runtimeCheckpoints", (after) => {
    let query = service.from("agent_runtime_sessions")
      .select("conversation_id,current_run_id,checkpoint,checkpoint_ciphertext,checkpoint_encryption_version,checkpoint_encryption_checked_at,conversation:agent_conversations(project_id)");
    if (after !== null) query = query.gt("conversation_id", after);
    return query.order("conversation_id").limit(PAGE_SIZE);
  }, (row) => row.conversation_id, async (row) => {
    if (row.current_run_id === null && !row.checkpoint_encryption_checked_at) return false;
    const conversation = Array.isArray(row.conversation)
      ? row.conversation[0] : row.conversation;
    const projectId = conversation?.project_id;
    if (!projectId) return false;
    if (row.current_run_id !== null) {
      const parent = await service.from("agent_runs")
        .select("project_id,conversation_id,checkpoint,checkpoint_ciphertext,checkpoint_encryption_version,checkpoint_encryption_checked_at")
        .eq("id", row.current_run_id).maybeSingle();
      if (parent.error || !parent.data ||
          parent.data.project_id !== projectId ||
          parent.data.conversation_id !== row.conversation_id ||
          !parent.data.checkpoint_encryption_checked_at ||
          parent.data.checkpoint !== null ||
          row.checkpoint !== null ||
          parent.data.checkpoint_ciphertext !== row.checkpoint_ciphertext ||
          parent.data.checkpoint_encryption_version !==
            row.checkpoint_encryption_version) return false;
    }
    if (row.checkpoint === null && row.checkpoint_ciphertext === null &&
        row.checkpoint_encryption_version === 0) return true;
    if (!projectId || row.checkpoint !== null ||
        row.checkpoint_encryption_version !==
          await currentVersion("project", projectId) ||
        !row.checkpoint_ciphertext) return false;
    const store = getEncryptedStore();
    const cipher = store.fromDatabase(row.checkpoint_ciphertext);
    if (store.formatOf(cipher) !== 3 ||
        store.versionOf(cipher) !== row.checkpoint_encryption_version) return false;
    const plain = await store.decrypt(cipher, { scope: { kind: "project", id: projectId },
      table: row.current_run_id === null ? "agent_runtime_sessions" : "agent_runs",
      column: "checkpoint", rowId: row.current_run_id ?? row.conversation_id });
    return !!plain && typeof plain === "object" && !Array.isArray(plain);
  });
  await scan<JournalRow>("journals", (after) => {
    let query = service.from("agent_run_journal")
      .select("*,run:agent_runs(project_id)");
    if (after !== null) query = query.gt("id", after);
    return query.order("id").limit(PAGE_SIZE);
  }, (row) => row.id,
  async (row) => {
    const run = Array.isArray(row.run) ? row.run[0] : row.run;
    const projectId = run?.project_id;
    if (!projectId || !row.encryption_checked_at ||
        row.encryption_version !== await currentVersion("project", projectId)) return false;
    if (!row.payload || getEncryptedStore().formatOf(
        getEncryptedStore().fromDatabase(row.payload)) !== 3) return false;
    await decodeJournal(projectId, row);
    return true;
  });
  await scan<OAuthClientRow>("oauthClients", (after) => {
    let query = service.from("oauth_clients").select(
      "client_id,client_name,redirect_uris,logo_uri,client_uri,encrypted_content,encryption_version,encryption_checked_at,created_at");
    if (after !== null) query = query.gt("client_id", after);
    return query.order("client_id").limit(PAGE_SIZE);
  }, (row) => row.client_id, async (row) => {
    if (!row.encryption_checked_at || !row.encrypted_content ||
        row.encryption_version !== await currentVersion(SYSTEM.kind, SYSTEM.id)) return false;
    await decodeOAuthClientContent(row);
    return true;
  });
  await scan<OAuthCodeRow>("oauthCodes", (after) => {
    let query = service.from("oauth_authorization_codes").select(
      "code_hash,user_id,redirect_uri,resource,encrypted_content,encryption_version,encryption_checked_at");
    if (after !== null) query = query.gt("code_hash", after);
    return query.order("code_hash").limit(PAGE_SIZE);
  }, (row) => row.code_hash, async (row) => {
    if (!row.encryption_checked_at || !row.encrypted_content || !row.user_id ||
        row.encryption_version !== await currentVersion("user", row.user_id)) return false;
    await decodeOAuthCodeContent(row);
    return true;
  });
  await scan<ApiKeyRow>("apiKeys", (after) => {
    let query = service.from("api_keys").select(
      "id,user_id,name,agent,encrypted_content,encryption_version,encryption_checked_at");
    if (after !== null) query = query.gt("id", after);
    return query.order("id").limit(PAGE_SIZE);
  }, (row) => row.id, async (row) => {
    if (!row.encryption_checked_at || !row.encrypted_content || !row.user_id ||
        row.encryption_version !== await currentVersion("user", row.user_id)) return false;
    await decodeApiKeyContent(row);
    return true;
  });
  await scan<IntegrationRow>("integrations", (after) => {
    let query = service.from("integrations").select(
      "id,project_id,name,webhook_url,name_encryption_checked_at,webhook_encryption_checked_at");
    if (after !== null) query = query.gt("id", after);
    return query.order("id").limit(PAGE_SIZE);
  }, (row) => row.id, async (row) => {
    if (!row.project_id || !row.name_encryption_checked_at ||
        (row.webhook_url !== null && !row.webhook_encryption_checked_at)) return false;
    const current = await currentVersion("project", row.project_id);
    if (current === null || integrationFieldVersion(row.name) !== current ||
        (row.webhook_url !== null &&
          integrationFieldVersion(row.webhook_url) !== current)) return false;
    await decodeIntegrationField(row, "name", row.name);
    if (row.webhook_url !== null)
      await decodeIntegrationField(row, "webhook_url", row.webhook_url);
    return true;
  });
  await scan<PushRow>("pushSubscriptions", (after) => {
    let query = service.from("push_subscriptions").select("*");
    if (after !== null) query = query.gt("id", after);
    return query.order("id").limit(PAGE_SIZE);
  }, (row) => row.id, async (row) => {
    if (!row.user_id || !row.encryption_checked_at || !row.encrypted_content ||
        pushVersion(row.encrypted_content) !==
          await currentVersion("user", row.user_id)) return false;
    await openPush(row);
    return true;
  });
  await scan<BillingRow>("billingIdentities", (after) => {
    let query = service.from("billing_accounts").select(
      "user_id,email,admin_override_note,email_encryption_checked_at,admin_override_note_encryption_checked_at");
    if (after !== null) query = query.gt("user_id", after);
    return query.order("user_id").limit(PAGE_SIZE);
  }, (row) => row.user_id, async (row) => {
    if (row.email === null && row.admin_override_note === null) return true;
    const current = await currentVersion("user", row.user_id);
    if (current === null ||
        (row.email !== null && (!row.email_encryption_checked_at ||
          billingFieldVersion(row.email) !== current)) ||
        (row.admin_override_note !== null &&
          (!row.admin_override_note_encryption_checked_at ||
            billingFieldVersion(row.admin_override_note) !== current))) return false;
    if (row.email !== null) await decodeBillingField(row.user_id, "email", row.email);
    if (row.admin_override_note !== null)
      await decodeBillingField(row.user_id, "admin_override_note", row.admin_override_note);
    return true;
  });
  return { ready: missingKeys === 0 &&
    Object.values(blocked).every((count) => count === 0), scanned, blocked, missingKeys };
}
