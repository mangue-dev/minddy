import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeNumoCheckpoint, decodeNumoToolMessage,
  encodeNumoCheckpoint, encodeNumoToolMessage, numoToolMessageState,
  type ToolMessagePayload } from "@/lib/server/numo/tool-content";
import { decodeNumoToolOperationValue, encodeNumoToolOperationValue,
  numoToolArgumentsDigest } from "@/lib/server/numo/tool-operation-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

type Message = ToolMessagePayload & { id: string; turn_id: string | null;
  tool_payload_version: number; conversation:
  { user_id: string } | { user_id: string }[] };
type Turn = { id: string; user_id: string; checkpoint: Record<string, unknown> };
type Operation = { turn_id: string; tool_call_id: string; tool_name: string;
  arguments: unknown; result: unknown; model_result: unknown;
  arguments_version: number; result_version: number;
  model_result_version: number; arguments_digest: string | null;
  status: string; success: boolean | null; result_run_id: string | null;
  turn: { user_id: string } | { user_id: string }[] };

function owner(join: { user_id: string } | { user_id: string }[]) {
  const id = Array.isArray(join) ? join[0]?.user_id : join?.user_id;
  if (!id) throw new Error("Numo tool content owner unavailable");
  return id;
}

async function currentVersion(userId: string) {
  const key = await getContentKeys().current({ kind: "user", id: userId });
  try { return key.version; } finally { key.bytes.fill(0); }
}

function checkpointFresh(value: Record<string, unknown>, version: number) {
  if (value.phase !== "model" && value.phase !== "tools") {
    return Object.keys(value).length ===
      Object.keys(normalizeSafeCheckpoint(value)).length;
  }
  return value.encryption_version === version &&
    typeof value.encrypted_payload === "string";
}

function normalizeSafeCheckpoint(value: Record<string, unknown>) {
  const fields: Record<string, string[]> = {
    worker_result:["phase","worker_event"],
    worker_input_wait:["phase","worker_event","input_request"],
    worker_wait:["phase","active_run_id"],
    user_wait:["phase"],done:["phase"],
  };
  const allowed = fields[String(value.phase)] ?? [];
  if (!allowed.length) {
    if (!Object.keys(value).length) return value;
    throw new Error("Unknown Numo checkpoint phase");
  }
  return Object.fromEntries(allowed.filter((field) =>
    Object.hasOwn(value,field)).map((field) => [field,value[field]]));
}

async function convertMessage(message: Message, version: number) {
  const userId = owner(message.conversation);
  const clear = await decodeNumoToolMessage(userId, message);
  const fresh = message.tool_payload_version === version && !!message.content &&
    numoToolMessageState(message.content).format === 3;
  const stored = fresh ? { content: message.content,
    tool_payload_version: message.tool_payload_version }
    : await encodeNumoToolMessage(userId, message.id, {
        role: clear.role, content: clear.content,
        tool_calls: clear.tool_calls, context: clear.context,
        metadata: clear.metadata,
      });
  const checked = await decodeNumoToolMessage(userId, {
    id: message.id, role: message.role, content: stored.content,
    tool_calls: null, context: null, metadata: {},
    tool_payload_version: stored.tool_payload_version,
  });
  if (JSON.stringify([checked.content,checked.tool_calls,checked.context,
      checked.metadata]) !== JSON.stringify([clear.content,clear.tool_calls,
      clear.context,clear.metadata])) {
    throw new Error("Numo tool message conversion mismatch");
  }
  return { stored, fresh };
}

async function convertCheckpoint(turn: Turn, version: number) {
  const clear = await decodeNumoCheckpoint(turn.user_id, turn.id,turn.checkpoint);
  const fresh = checkpointFresh(turn.checkpoint, version);
  const stored = fresh ? turn.checkpoint
    : clear.phase === "model" || clear.phase === "tools"
      ? await encodeNumoCheckpoint(turn.user_id, turn.id, clear)
      : normalizeSafeCheckpoint(clear);
  const checked = await decodeNumoCheckpoint(turn.user_id, turn.id, stored);
  if (JSON.stringify(normalizeSafeCheckpoint(checked)) !==
      JSON.stringify(normalizeSafeCheckpoint(clear))) {
    throw new Error("Numo checkpoint conversion mismatch");
  }
  return { stored, fresh };
}

function uuid(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
    ? value : null;
}

/** Rotate tool sources and copies in bounded compare-and-swap transactions. */
export async function backfillNumoToolContentBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_NUMO_TOOL_CONTENT_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Numo tool content encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit<1 || limit>100) {
    throw new Error("Invalid Numo tool content batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0,migrated: 0,unchanged: 0,conflicted: 0,
    failed: 0,interrupted: false };
  const messages = await service.from("assistant_messages")
    .select("id,turn_id,role,content,tool_calls,context,metadata,tool_payload_version,conversation:conversations!inner(user_id)")
    .or("role.eq.tool,and(role.eq.assistant,tool_calls.not.is.null),tool_payload_version.gt.0")
    .order("tool_payload_checked_at",{ ascending:true,nullsFirst:true })
    .order("id",{ ascending:true }).limit(limit);
  if (messages.error) throw new Error("Unable to scan Numo tool messages");
  for (const row of messages.data ?? []) {
    if (signal?.aborted) { result.interrupted=true; return result; }
    result.scanned++;
    try {
      const message = row as unknown as Message;
      if (message.role !== "assistant" && message.role !== "tool") continue;
      const userId = owner(message.conversation);
      const version = await currentVersion(userId);
      const converted = await convertMessage(message, version);
      let oldCheckpoint: Record<string, unknown> | null = null;
      let newCheckpoint: Record<string, unknown> | null = null;
      if (message.turn_id && message.role === "assistant") {
        const read = await service.from("numo_assistant_turns")
          .select("id,user_id,checkpoint").eq("id",message.turn_id).single();
        if (read.error || !read.data || read.data.user_id !== userId) {
          throw new Error("Numo tool round owner mismatch");
        }
        const turn = read.data as Turn;
        const clear = await decodeNumoCheckpoint(userId,turn.id,turn.checkpoint);
        if (clear.phase === "tools" && clear.assistantMessageId === message.id) {
          oldCheckpoint = turn.checkpoint;
          newCheckpoint = (await convertCheckpoint(turn,version)).stored;
        }
      }
      const write = await service.rpc("migrate_numo_tool_message", {
        p_id:message.id,p_old_content:message.content,
        p_old_tool_calls:message.tool_calls,p_old_context:message.context,
        p_old_metadata:message.metadata,
        p_old_version:message.tool_payload_version,
        p_new_content:converted.stored.content,
        p_new_version:converted.stored.tool_payload_version,
        p_old_checkpoint:oldCheckpoint,p_new_checkpoint:newCheckpoint,
      });
      if (write.error) throw new Error("Unable to migrate Numo tool message");
      if (!write.data) result.conflicted++;
      else if (converted.fresh && (!oldCheckpoint ||
          checkpointFresh(oldCheckpoint,version))) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  const turns = await service.from("numo_assistant_turns")
    .select("id,user_id,checkpoint")
    .order("tool_checkpoint_checked_at",{ ascending:true,nullsFirst:true })
    .order("id",{ ascending:true }).limit(limit);
  if (turns.error) throw new Error("Unable to scan Numo tool checkpoints");
  for (const row of turns.data ?? []) {
    if (signal?.aborted) { result.interrupted=true; return result; }
    result.scanned++;
    try {
      const turn = row as Turn;
      const converted = await convertCheckpoint(turn,
        await currentVersion(turn.user_id));
      const write = await service.rpc("migrate_numo_tool_checkpoint",{
        p_id:turn.id,p_old:turn.checkpoint,p_new:converted.stored });
      if (write.error) throw new Error("Unable to migrate Numo tool checkpoint");
      if (!write.data) result.conflicted++;
      else if (converted.fresh) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  const operations = await service.from("numo_tool_operations")
    .select("turn_id,tool_call_id,tool_name,arguments,result,model_result,arguments_version,result_version,model_result_version,arguments_digest,status,success,result_run_id,turn:numo_assistant_turns!inner(user_id)")
    .order("encryption_checked_at",{ ascending:true,nullsFirst:true })
    .order("turn_id",{ ascending:true })
    .order("tool_call_id",{ ascending:true }).limit(limit);
  if (operations.error) throw new Error("Unable to scan Numo tool operations");
  for (const row of operations.data ?? []) {
    if (signal?.aborted) { result.interrupted=true; return result; }
    result.scanned++;
    try {
      const operation = row as unknown as Operation;
      const userId = owner(operation.turn);
      const version = await currentVersion(userId);
      const clear = await Promise.all((["arguments","result","model_result"] as const)
        .map((column) => decodeNumoToolOperationValue(userId,
          operation.turn_id,operation.tool_call_id,column,operation[column],
          operation[`${column}_version`])));
      const digest = await numoToolArgumentsDigest(userId,clear[0]);
      if (operation.arguments_digest && operation.arguments_digest !== digest) {
        throw new Error("Numo tool argument digest mismatch");
      }
      const sealed = await Promise.all((["arguments","result","model_result"] as const)
        .map(async (column,index) => {
          const oldVersion = operation[`${column}_version`];
          if (oldVersion === version && operation[column] !== null) {
            return { value:operation[column],version:oldVersion };
          }
          if (column !== "arguments" && operation.status !== "completed" &&
              operation[column] === null) return { value:null,version:0 };
          return encodeNumoToolOperationValue(userId,operation.turn_id,
            operation.tool_call_id,column,clear[index]);
        }));
      for (let index=0;index<3;index++) {
        const column = (["arguments","result","model_result"] as const)[index];
        if (JSON.stringify(await decodeNumoToolOperationValue(userId,
            operation.turn_id,operation.tool_call_id,column,
            sealed[index].value,sealed[index].version)) !==
            JSON.stringify(clear[index])) {
          throw new Error("Numo tool operation conversion mismatch");
        }
      }
      const runId = operation.tool_name === "launch_code_agent" &&
        operation.success && clear[1] && typeof clear[1] === "object" &&
        !Array.isArray(clear[1])
        ? uuid((clear[1] as Record<string,unknown>).run_id) : null;
      const write = await service.rpc("migrate_numo_tool_operation",{
        p_turn_id:operation.turn_id,p_tool_call_id:operation.tool_call_id,
        p_old_arguments:operation.arguments,p_old_result:operation.result,
        p_old_model_result:operation.model_result,
        p_old_arguments_version:operation.arguments_version,
        p_old_result_version:operation.result_version,
        p_old_model_result_version:operation.model_result_version,
        p_old_digest:operation.arguments_digest,
        p_new_arguments:sealed[0].value,p_new_result:sealed[1].value,
        p_new_model_result:sealed[2].value,
        p_new_arguments_version:sealed[0].version,
        p_new_result_version:sealed[1].version,
        p_new_model_result_version:sealed[2].version,
        p_new_digest:digest,p_result_run_id:runId,
      });
      if (write.error) throw new Error("Unable to migrate Numo tool operation");
      if (!write.data) result.conflicted++;
      else if (operation.arguments_version===version &&
          (operation.status!=="completed" || operation.result_version===version &&
            operation.model_result_version===version)) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  return result;
}
