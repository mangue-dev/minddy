import { constants } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { nativeWorkerPaths, type NativeWorkerMessage } from "@/lib/native-agent-worker";
import { promptWithMentions, type AgentUserMessage } from "@/lib/agent-mentions";
import { parseAskUserQuestions } from "@/lib/ask-user";
import { describeAgentHarnessCapabilities } from "@/lib/agent-harness-capabilities";
import { BackgroundJobs, OPENCODE_BACKGROUND_LOG_NOTES } from "../background";
import { normalizePlan } from "../agent-contract";
import { changedFiles, commitAndPush, readWorkFile, revParseHead, turnDiff } from "../repo-host";
import { isSecretFile, scanDiff, scanSecrets } from "../secret-scan";
import { SecretRedactor, redactDeep } from "../redact";
import type { AgentCheckpoint } from "../runs";
import { createIsolatedNativeHost, type IsolatedNativeHost } from "./native-isolation";
import { createNativeRuntime, NativeAuthenticationRequired, type NativeRuntime } from "./native-runtime";
import { installNativeWorkerCli } from "./native-cli-install";
import { nativeRepositoryInstructions } from "./native-instructions";
import { nativeBackgroundRunner } from "./native-background";
import { startNativeWorkerMcp } from "./native-worker-mcp";
import { makeOpencodeDelivery } from "./opencode-delivery";
import { startToolBridge, type ToolBridge } from "./tool-bridge";
import { exportProfile, importProfile, PROFILE_LIMIT, validateProfile, type NativeProfile } from "./native-prototype/profile";
import type { ControlPlaneClient } from "./control-plane-client";
import type { SupervisorInput } from "./supervisor";
import type { VmJob, VmPushResult, VmTurnReport } from "./protocol";

const TURN_MS = 25 * 60_000;
export interface NativeSupervisorDeps {
  host?: IsolatedNativeHost;
  runtime?: NativeRuntime;
  now?(): number;
  lifecycleBeatMs?: number;
  turnDeadlineMs?: number;
  installCli?: typeof installNativeWorkerCli;
}

/** Portable context contains only bounded, redacted conversation text. */
export function boundedNativeHistory(history: NativeWorkerMessage[], redact: (text: string) => string): NativeWorkerMessage[] {
  let remaining = 48_000;
  const result: NativeWorkerMessage[] = [];
  for (const message of history.slice(-24).reverse()) {
    const text = redact(message.text).slice(-Math.min(8000, remaining));
    if (!remaining) break;
    result.unshift({ role: message.role, text }); remaining -= text.length;
  }
  return result;
}

export function registerNativeProfileSecrets(profile: NativeProfile, redactor: SecretRedactor) {
  for (const file of profile.files) {
    const value = JSON.parse(file.content);
    for (const token of [value.tokens?.access_token, value.tokens?.refresh_token, value.tokens?.id_token, value.claudeAiOauth?.accessToken, value.claudeAiOauth?.refreshToken]) if (typeof token === "string") redactor.add(token);
  }
}

async function readImportedProfile(path: string): Promise<NativeProfile> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > PROFILE_LIMIT) throw new Error("Invalid native profile handoff");
    return validateProfile(JSON.parse(await handle.readFile("utf8")));
  } finally { await handle.close(); }
}

/** Opaque auth files leave only through the SDK after every native child has stopped. */
export async function writeNativeProfileExport(profileRoot: string, engine: "codex" | "claude_code", target: string): Promise<void> {
  const profile = await exportProfile(profileRoot, engine);
  const temp = `${target}.${randomUUID()}.pending`;
  const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    try { await handle.writeFile(JSON.stringify(profile)); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, target);
    const directory = await open(dirname(target), constants.O_RDONLY);
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await rm(temp, { force: true }); }
}

/** Native workers reuse Minddy's guarded bridge and delivery rules in fresh hosted VMs. */
export async function runNativeTurn(job: VmJob, input: SupervisorInput, rawCp: ControlPlaneClient, deps: NativeSupervisorDeps = {}): Promise<VmTurnReport> {
  const native = job.nativeAgent;
  if (!native || job.engine !== native.engine || job.controlToken || job.executionEnvironment) throw new Error("Native workers require a hosted subscription job");
  const paths = nativeWorkerPaths(job.layout);
  for (const key of ["privateRoot", "profileRoot", "profileExportPath"] as const) if (native[key] !== paths[key]) throw new Error("Invalid native worker private path");
  const now = deps.now ?? Date.now; const started = now(); const deadline = deps.turnDeadlineMs ?? TURN_MS;
  const secrets = new SecretRedactor();
  secrets.addAuthUrl(job.authUrl);
  const outward = secrets.redact;
  const clean = <T>(value: T): T => redactDeep(value, outward) as T;
  const cp: ControlPlaneClient = { ...rawCp, emit: (type, payload) => rawCp.emit(type, clean(payload)), emitLive: (payload) => rawCp.emitLive(clean(payload)), emitDiff: (payload) => rawCp.emitDiff(clean(payload)), callTool: async (name, body) => clean(await rawCp.callTool(name, clean(body))), saveCheckpointQuietly: (checkpoint) => rawCp.saveCheckpointQuietly(clean(checkpoint)), syncPlan: (steps) => rawCp.syncPlan(clean(steps)) };
  const abort = new AbortController();
  const host = deps.host ?? createIsolatedNativeHost(job);
  const runtime = deps.runtime ?? createNativeRuntime(native.engine);
  let bridge: ToolBridge | undefined; let mcp: Awaited<ReturnType<typeof startNativeWorkerMcp>> | undefined;
  let background: BackgroundJobs | undefined;
  let status: VmTurnReport["status"] = "error"; let errorCode: VmTurnReport["errorCode"] = "providerUnavailable";
  let reply = ""; let tools = 0; let askedUser = false; let stopped = false; let authReady = false; let authenticationRejected = false;
  let filesFromSha = job.filesFromSha; let pushed: VmPushResult | null = null; let pushError: string | undefined;
  let changed: VmTurnReport["changed"];
  let delivered = job.pullRequestDelivery?.delivered ?? false;
  let history = boundedNativeHistory(native.history ?? [], outward);
  let delivery: ReturnType<typeof makeOpencodeDelivery> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined; let heartbeat: ReturnType<typeof setInterval> | undefined; let checkpointTimer: ReturnType<typeof setInterval> | undefined; let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let lifecycleBusy = false; let pendingSteering: AgentUserMessage[] = [];
  let lifecycleTask: Promise<void> | undefined;
  let computeBudget = job.budgetUsd ?? Number.POSITIVE_INFINITY; let budgetReadAt = Number.NEGATIVE_INFINITY;
  const checkpoint = (): AgentCheckpoint => ({ messages: [], native: { engine: native.engine, history: boundedNativeHistory(history, outward) }, usageSeq: job.usageSeqStart, lastFilesSha: filesFromSha, instructions: job.instructions, prInlineComments: bridge?.prInlineComments ?? job.prInlineComments, ...(status !== "completed" && delivery ? { editedPaths: delivery.checkpointEditedPaths(), repoTouched: delivery.repoTouched() } : {}) });
  const stop = async (reason: VmTurnReport["status"], code?: VmTurnReport["errorCode"]) => { if (stopped) return; stopped = true; status = reason; errorCode = code; abort.abort(); await runtime.interrupt().catch(() => {});
    try { await runtime.close(); } catch { status = "error"; errorCode = "providerUnavailable"; }
  };
  const checkComputeBudget = async () => {
    if (now() - budgetReadAt >= 60_000) { budgetReadAt = now(); const remaining = await cp.budgetRemaining().catch(() => null); if (remaining !== null) computeBudget = Math.min(computeBudget, remaining); }
    const compute = (job.bootstrapMs + Math.max(0, now() - started)) / 60_000 * (job.sandboxUsdPerMinute ?? 0);
    return computeBudget > 0 && compute < computeBudget;
  };
  const pushWork = async (message: string): Promise<VmPushResult> => {
    await background?.stopAll();
    const { diff, porcelain } = await turnDiff(host, filesFromSha);
    if (scanDiff(diff.slice(0, 2_000_000)).length) throw new Error("Repository changes contain credentials");
    for (const line of porcelain.split("\n").filter((line) => line.startsWith("??")).slice(0, 200)) {
      const path = line.slice(3).trim();
      if (!path || path.startsWith('"') || isSecretFile(path)) throw new Error("Repository contains an unsafe untracked path");
      const text = await readWorkFile(host, path);
      if (text && scanSecrets(text.slice(0, 2_000_000), path).length) throw new Error("Repository changes contain credentials");
    }
    const authUrl = await rawCp.repoAuthUrl() ?? job.authUrl;
    secrets.addAuthUrl(authUrl);
    if (!authUrl) throw new Error("No repository is linked for publication");
    return commitAndPush(host, { authUrl, workBranch: job.workBranch, baseBranch: job.baseBranch, message: outward(message), committer: job.committer });
  };
  const previousPath = process.env.PATH;
  try {
    const bins = await (deps.installCli ?? installNativeWorkerCli)(native.engine, `${job.layout.root}/native-runtime`);
    process.env.PATH = `${bins}:${previousPath ?? "/usr/bin:/bin"}`;
    await host.verifyIsolation();
    const profile = await readImportedProfile(paths.profileImportPath);
    if (profile.engine !== native.engine) throw new Error("Native profile engine mismatch");
    registerNativeProfileSecrets(profile, secrets);
    await importProfile(native.profileRoot, profile);
    await rm(paths.profileImportPath);
    if (!await checkComputeBudget()) { status = "budget_exhausted"; errorCode = undefined; stopped = true; throw new Error("Native hosted compute budget exhausted"); }
    filesFromSha ||= await revParseHead(host);
    delivery = makeOpencodeDelivery({ host, emit: cp.emit, filesFromSha, editedPaths: job.editedPaths, repoTouched: job.repoTouched, remainingMs: () => Math.max(0, deadline - (now() - started)) });
    background = new BackgroundJobs(nativeBackgroundRunner(host), job.usageSeqStart, OPENCODE_BACKGROUND_LOG_NOTES, { local: false });
    const bridgeToken = randomBytes(32).toString("hex"); const mcpToken = randomBytes(32).toString("hex"); secrets.add(bridgeToken); secrets.add(mcpToken);
    let planSignature = "";
    bridge = await startToolBridge({ job: { ...job, imageInput: false }, cp, authorizationToken: bridgeToken, delivery, supervisorTools: {
      run_background: (args) => background!.handle(args),
      update_plan: async (args) => { const plan = normalizePlan(args.plan); await cp.emit("plan_update", { plan }); const signature = JSON.stringify(plan); if (signature !== planSignature) { planSignature = signature; await cp.syncPlan(plan).catch(() => {}); } return { success: true, result: { ok: true } }; },
      ...(job.writesToRepo ? { validate_changes: async () => ({ success: true, result: { validated: true, note: "Read the attached type-check, test and diff report." } }), create_pr: delivery.wrapCreatePr(async (args: Record<string, unknown>) => {
        try { pushed = await pushWork(typeof args.title === "string" ? args.title : `wip(${job.commitRef}): native agent update`); if (pushed.remoteUpdated) await cp.emit("commit", { sha: pushed.headSha }); }
        catch { return { success: false, result: { error: "The repository could not be safely pushed. Inspect validation and repository state before retrying." } }; }
        const outcome = await cp.callTool("create_pr", { args, pushed, workBranch: job.workBranch });
        if (outcome.success && outcome.result && typeof outcome.result === "object" && typeof (outcome.result as Record<string, unknown>).url === "string") delivered = true;
        return { success: outcome.success, result: outcome.result };
      }) } : {}),
    } });
    mcp = await startNativeWorkerMcp({ job, host, bridge, bridgeToken, token: mcpToken, cp, delivery, signal: abort.signal, redact: outward, onCall: () => { tools++; }, askUser: async (args, callId) => {
      const questions = parseAskUserQuestions(args);
      if (!questions.length) throw new Error("A user question is required");
      await cp.emit("question", { id: callId, call_id: callId, question_id: callId, questions });
      history.push({ role: "assistant", text: `Questions awaiting the user's answer: ${outward(JSON.stringify(questions)).slice(0, 7800)}` });
      askedUser = true;
      setTimeout(() => { void stop("interrupted"); }, 100);
      return { queued: true, note: "Numo will collect the answer. Pause repository work now." };
    } });
    pendingSteering = await cp.pullSteering();
    const initial = [input.prompt, ...pendingSteering.map((message) => promptWithMentions(message.text, message.mentions))].filter(Boolean).join("\n\n");
    if (!initial) throw new Error("Native worker requires a user request");
    const conventions = await nativeRepositoryInstructions(host, job.anchor === "pr");
    const initialHistoryIndex = history.length;
    await runtime.start({ cwd: job.layout.repoDir, anchor: `${input.anchorInstructions}\n\n${conventions}\n\n${describeAgentHarnessCapabilities(native.engine)}\nUse only the guarded Minddy MCP tools for repository work. Native shell, edits, images and subagents are unavailable.`, prompt: initial, history, mcpUrl: mcp.url, mcpToken, privateRoot: native.privateRoot, profileRoot: native.profileRoot, model: native.model ?? null, reasoningEffort: native.reasoningEffort ?? null, toolNames: mcp.toolNames });
    registerNativeProfileSecrets(await exportProfile(native.profileRoot, native.engine), secrets);
    history.splice(initialHistoryIndex, 0, { role: "user", text: outward(initial) }); pendingSteering = [];
    const tick = async () => {
      if (lifecycleBusy || stopped) return; lifecycleBusy = true;
      try {
        if (!await checkComputeBudget()) { await stop("budget_exhausted"); return; }
        if (await cp.hasPendingMessages()) {
          const messages = await cp.pullSteering(); pendingSteering = messages;
          for (const [index, message] of messages.entries()) { if (stopped) break; const text = promptWithMentions(message.text, message.mentions); await runtime.steer(text); history.push({ role: "user", text: outward(text) }); pendingSteering = messages.slice(index + 1); await cp.emit("user_message", { text: message.text, ...(message.id ? { id: message.id } : {}) }); }
          if (!pendingSteering.length) await cp.clearInterrupt();
        } else if (await cp.checkInterrupt()) await stop("interrupted");
      } catch { await stop("error", "providerUnavailable"); }
      finally { lifecycleBusy = false; }
    };
    beat = setInterval(() => { if (!lifecycleTask) lifecycleTask = tick().finally(() => { lifecycleTask = undefined; }); }, deps.lifecycleBeatMs ?? 1000);
    heartbeat = setInterval(() => { void cp.heartbeat().then((running) => { if (!running) return stop("interrupted"); }).catch(() => {}); }, 15_000);
    checkpointTimer = setInterval(() => { void cp.saveCheckpointQuietly(checkpoint()).then((running) => { if (!running) return stop("interrupted"); }).catch(() => {}); }, 30_000);
    deadlineTimer = setTimeout(() => { void stop("error", "turnTooLong"); }, Math.max(1, deadline - (now() - started)));
    let repairs = 0;
    for await (const event of runtime.events()) {
      if (stopped) break;
      if (event.type === "text") { reply = event.delta ? (reply + event.text).slice(-64_000) : event.text; cp.emitLive({ text: outward(reply), tools, reasoningActive: false, reasoningMs: 0 }); }
      if (event.type === "status") cp.emitLive({ text: outward(reply), tools, reasoningActive: event.phase === "reasoning", reasoningMs: 0 });
      if (event.type === "failed") { authenticationRejected = event.nativeCode === "unauthorized"; status = "error"; errorCode = "providerUnavailable"; break; }
      if (event.type === "completed") {
        reply = event.reply;
        if (askedUser) { status = "interrupted"; errorCode = undefined; history.push({ role: "assistant", text: outward(reply) }); break; }
        if (job.pullRequestDelivery?.required && !delivered && job.writesToRepo && repairs++ < 2) { const repair = "The requested work is not delivered yet. Finish the implementation, run validate_changes, and use create_pr. Report an actual blocking condition if publication is impossible."; history.push({ role: "assistant", text: outward(reply) }, { role: "user", text: repair }); await runtime.steer(repair); reply = ""; continue; }
        if (job.pullRequestDelivery?.required && !delivered && job.writesToRepo) { status = "error"; errorCode = "replyIncomplete"; }
        else { status = "completed"; errorCode = undefined; }
        history.push({ role: "assistant", text: outward(reply) }); break;
      }
    }
    delivery.noteEdits();
    await delivery.probeRepoTouched();
    await background.stopAll();
    if (job.writesToRepo && delivery.repoTouched()) {
      try { pushed = await pushWork(`wip(${job.commitRef}): native agent update`); if (pushed.remoteUpdated) await cp.emit("commit", { sha: pushed.headSha }); }
      catch { pushError = "Native repository publication failed safely"; }
    }
  } catch (error) { authenticationRejected ||= error instanceof NativeAuthenticationRequired; if (!stopped) { status = "error"; errorCode = "providerUnavailable"; } }
  finally {
    stopped = true;
    if (beat) clearInterval(beat); if (heartbeat) clearInterval(heartbeat); if (checkpointTimer) clearInterval(checkpointTimer); if (deadlineTimer) clearTimeout(deadlineTimer);
    abort.abort();
    let childStopped = false;
    try { await runtime.close(); childStopped = true; }
    catch { status = "error"; errorCode = "providerUnavailable"; }
    await lifecycleTask;
    await background?.stopAll();
    await mcp?.close(); await bridge?.close();
    if (status === "completed" && pushed?.headSha) { changed = await changedFiles(host, filesFromSha, pushed.headSha).catch(() => undefined); filesFromSha = pushed.headSha; }
    await host.close();
    if (pendingSteering.length) await cp.pushSteering(pendingSteering).catch(() => {});
    if (authenticationRejected) await rm(native.profileExportPath, { force: true }).catch(() => {});
    else if (childStopped) try { registerNativeProfileSecrets(await exportProfile(native.profileRoot, native.engine), secrets); await writeNativeProfileExport(native.profileRoot, native.engine, native.profileExportPath); authReady = true; } catch { authReady = false; }
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
  }
  if (status === "completed" && !pushError) await cp.emit("summary", { text: outward(reply) });
  history = boundedNativeHistory(history, outward);
  const state = checkpoint();
  return { status, ...(errorCode ? { errorCode } : {}), ...(reply ? { reply: outward(reply) } : {}), ...(askedUser ? { askedUser } : {}), costUsd: 0, nativeAuthExportReady: authReady, checkpoint: state, checkpointDropped: [], checkpointBytes: Buffer.byteLength(JSON.stringify(state)), pushed, workBranch: job.workBranch, ...(pushError ? { pushError } : {}), ...(changed ? { changed } : {}), sandboxMs: job.bootstrapMs + Math.max(0, now() - started) };
}
