#!/usr/bin/env node
import { createHash, timingSafeEqual } from "node:crypto";
import { request as httpRequest, createServer } from "node:http";
import { posix as path } from "node:path";
import { assertPublicHttpUrl, requestPublicUrl } from "./agent-runner-egress.mjs";

const socketPath = process.env.DOCKER_HOST?.replace(/^unix:\/\//, "") || "/var/run/docker.sock";
const secret = process.env.AGENT_RUNNER_SECRET?.trim();
const sandboxImage = process.env.AGENT_RUNNER_SANDBOX_IMAGE?.trim();
const sandboxNetwork = process.env.AGENT_RUNNER_NETWORK?.trim();
const port = Number(process.env.AGENT_RUNNER_PORT || 6464);
const maxBodyBytes = 5 * 1024 * 1024;
const stoppedSandboxRetentionMs = 7 * 24 * 60 * 60_000;
const llmRelays = new Map();

if (!secret || !sandboxImage || !sandboxNetwork) {
  throw new Error("AGENT_RUNNER_SECRET, AGENT_RUNNER_SANDBOX_IMAGE, and AGENT_RUNNER_NETWORK are required");
}

function docker(method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const request = httpRequest({
      socketPath,
      method,
      path: requestPath,
      headers: data ? { "content-type": "application/json", "content-length": data.length } : {},
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const payload = Buffer.concat(chunks);
        if ((response.statusCode ?? 500) >= 400) {
          const message = parseJson(payload)?.message || payload.toString("utf8") || `Docker API returned ${response.statusCode}`;
          reject(Object.assign(new Error(message), { status: response.statusCode }));
          return;
        }
        resolve({ status: response.statusCode ?? 200, headers: response.headers, payload });
      });
    });
    request.on("error", reject);
    if (data) request.write(data);
    request.end();
  });
}

function parseJson(buffer) {
  try { return JSON.parse(buffer.toString("utf8")); } catch { return null; }
}

function sandboxContainerName(name) {
  if (!/^agent-[0-9a-f-]{36}$/i.test(name)) throw Object.assign(new Error("invalid sandbox name"), { status: 400 });
  return `minddy-${name}`;
}

function sandboxVolumeName(name) {
  return `minddy-agent-${createHash("sha256").update(name).digest("hex").slice(0, 24)}`;
}

async function inspectContainer(name) {
  try {
    const response = await docker("GET", `/v1.44/containers/${encodeURIComponent(sandboxContainerName(name))}/json`);
    return parseJson(response.payload);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function ensureSandbox(name) {
  const containerName = sandboxContainerName(name);
  let container = await inspectContainer(name);
  let created = false;
  if (!container) {
    await docker("POST", `/v1.44/containers/create?name=${encodeURIComponent(containerName)}`, {
      Image: sandboxImage,
      Cmd: ["node", "-e", "setInterval(() => {}, 2147483647)"],
      User: "10001:10001",
      WorkingDir: "/",
      Env: [
        "HOME=/vercel/home",
        "npm_config_cache=/vercel/npm-cache",
        "NODE_ENV=production",
      ],
      Labels: { "io.minddy.agent-sandbox": name },
      HostConfig: {
        NetworkMode: sandboxNetwork,
        ReadonlyRootfs: true,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges"],
        PidsLimit: 512,
        Memory: Number(process.env.AGENT_RUNNER_SANDBOX_MEMORY_BYTES || 4_294_967_296),
        NanoCpus: Number(process.env.AGENT_RUNNER_SANDBOX_NANO_CPUS || 2_000_000_000),
        Mounts: [{ Type: "volume", Source: sandboxVolumeName(name), Target: "/vercel" }],
        Tmpfs: { "/tmp": "rw,nosuid,nodev,size=1073741824" },
      },
    });
    created = true;
    container = await inspectContainer(name);
  }
  if (!container?.State?.Running) {
    await docker("POST", `/v1.44/containers/${encodeURIComponent(containerName)}/start`);
  }
  if (created) {
    await createExec(name, {
      cmd: "sh",
      args: ["-c", "mkdir -p /vercel/sandbox /vercel/oc /vercel/home /vercel/npm-cache && chown -R 10001:10001 /vercel"],
      cwd: "/",
      timeoutMs: 30_000,
      _user: "0:0",
    });
  }
  return { created };
}

async function removeExpiredSandboxes(now = Date.now()) {
  const filters = encodeURIComponent(JSON.stringify({ label: ["io.minddy.agent-sandbox"] }));
  const containers = parseJson((await docker("GET", `/v1.44/containers/json?all=true&filters=${filters}`)).payload) || [];
  for (const container of containers) {
    const name = container?.Labels?.["io.minddy.agent-sandbox"];
    if (!name || container.State === "running") continue;
    const inspected = await inspectContainer(name);
    const finishedAt = Date.parse(inspected?.State?.FinishedAt || "");
    if (!Number.isFinite(finishedAt) || now - finishedAt < stoppedSandboxRetentionMs) continue;
    await docker("DELETE", `/v1.44/containers/${encodeURIComponent(sandboxContainerName(name))}?v=true`).then(async () => {
      llmRelays.delete(name);
      await docker("DELETE", `/v1.44/volumes/${encodeURIComponent(sandboxVolumeName(name))}`).catch((error) => {
        if (error.status !== 404) throw error;
      });
    }).catch((error) => {
      console.error(`[agent-runner] could not remove expired sandbox ${name}:`, error.message);
    });
  }
}

function demux(buffer) {
  const stdout = [];
  const stderr = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const stream = buffer[offset];
    const length = buffer.readUInt32BE(offset + 4);
    if (offset + 8 + length > buffer.length) break;
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    (stream === 2 ? stderr : stdout).push(chunk);
    offset += 8 + length;
  }
  if (offset === 0 && buffer.length > 0) stdout.push(buffer);
  return { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
}

async function createExec(name, input) {
  const containerName = sandboxContainerName(name);
  const args = Array.isArray(input.args) && input.args.every((arg) => typeof arg === "string") ? input.args : [];
  if (typeof input.cmd !== "string" || !input.cmd.trim()) throw Object.assign(new Error("command is required"), { status: 400 });
  const command = input.timeoutMs
    ? ["timeout", "-k", "5", `${Math.max(1, Math.ceil(Number(input.timeoutMs) / 1000))}s`, input.cmd, ...args]
    : [input.cmd, ...args];
  const created = await docker("POST", `/v1.44/containers/${encodeURIComponent(containerName)}/exec`, {
    AttachStdout: !input.detached,
    AttachStderr: !input.detached,
    DetachKeys: "",
    Tty: false,
    Cmd: command,
    WorkingDir: typeof input.cwd === "string" ? input.cwd : "/vercel/sandbox",
    Env: input.env && typeof input.env === "object"
      ? Object.entries(input.env).map(([key, value]) => `${key}=${String(value)}`)
      : [],
    User: input._user || "10001:10001",
  });
  const commandId = parseJson(created.payload)?.Id;
  if (!commandId) throw new Error("Docker did not return an exec identifier");
  const started = await docker("POST", `/v1.44/exec/${encodeURIComponent(commandId)}/start`, {
    Detach: input.detached === true,
    Tty: false,
  });
  if (input.detached) return { commandId, exitCode: null, stdout: "", stderr: "" };
  const inspected = parseJson((await docker("GET", `/v1.44/exec/${encodeURIComponent(commandId)}/json`)).payload);
  return { commandId, exitCode: inspected?.ExitCode ?? 1, ...demux(started.payload) };
}

async function inspectCommand(commandId) {
  if (!/^[a-f0-9]{32,128}$/i.test(commandId)) throw Object.assign(new Error("invalid command id"), { status: 400 });
  try {
    const result = parseJson((await docker("GET", `/v1.44/exec/${encodeURIComponent(commandId)}/json`)).payload);
    return { exists: true, running: Boolean(result?.Running), exitCode: result?.Running ? null : (result?.ExitCode ?? null) };
  } catch (error) {
    if (error.status === 404) return { exists: false, running: false, exitCode: null };
    throw error;
  }
}

function assertSandboxPath(value) {
  if (typeof value !== "string" || !value.startsWith("/vercel/") || value.includes("\0")) {
    throw Object.assign(new Error("path must be absolute and inside /vercel"), { status: 400 });
  }
  const normalized = path.normalize(value);
  if (!normalized.startsWith("/vercel/")) throw Object.assign(new Error("path escapes the sandbox"), { status: 400 });
  return normalized;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

async function runUtility(name, script, env = {}) {
  const result = await createExec(name, { cmd: "sh", args: ["-c", script], cwd: "/", env, timeoutMs: 30_000 });
  if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || "sandbox utility failed");
  return result.stdout;
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error("request body too large"), { status: 413 });
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("invalid JSON body"), { status: 400 }); }
}

function authorized(header) {
  const supplied = Buffer.from((header || "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function authorizedRelay(header, token) {
  const supplied = Buffer.from((header || "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function completionUrl(baseUrl) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw Object.assign(new Error("LLM base URL is required"), { status: 400 });
  }
  let normalized;
  try {
    normalized = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  } catch {
    throw Object.assign(new Error("LLM base URL is invalid"), { status: 400 });
  }
  if (normalized.protocol !== "https:" && normalized.protocol !== "http:") {
    throw Object.assign(new Error("LLM base URL must use HTTP(S)"), { status: 400 });
  }
  return new URL("chat/completions", normalized).toString();
}

async function relayLlmCompletion(name, request, response) {
  const relay = llmRelays.get(name);
  if (!relay || !authorizedRelay(request.headers.authorization, relay.controlToken)) {
    return json(response, 401, { error: "unauthorized" });
  }
  const body = await readBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("LLM completion body must be an object"), { status: 400 });
  }
  const headers = { "content-type": "application/json" };
  for (const [key, value] of Object.entries(request.headers)) {
    if (
      ["host", "content-length", "connection", "accept-encoding", "authorization"].includes(key) ||
      typeof value !== "string"
    ) continue;
    headers[key] = value;
  }
  if (relay.apiKey) headers.authorization = `Bearer ${relay.apiKey}`;

  const upstream = await requestPublicUrl(relay.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const responseHeaders = {};
  upstream.headers.forEach((value, key) => {
    if (["content-encoding", "content-length", "transfer-encoding"].includes(key)) return;
    responseHeaders[key] = value;
  });
  response.writeHead(upstream.status, responseHeaders);
  for await (const chunk of upstream.stream) response.write(chunk);
  response.end();
}

function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, { "content-type": "application/json", "content-length": body.length });
  response.end(body);
}

const server = createServer(async (request, response) => {
  try {
    if (request.url === "/health" && request.method === "GET") {
      await docker("GET", "/_ping");
      return json(response, 200, { ok: true });
    }
    const url = new URL(request.url || "/", "http://runner");
    const match = /^\/v1\/sandboxes\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (match) {
      const name = decodeURIComponent(match[1]);
      const action = match[2] || "";
      sandboxContainerName(name);
      if (action === "/llm/chat/completions" && request.method === "POST") {
        return await relayLlmCompletion(name, request, response);
      }
    }
    if (!authorized(request.headers.authorization)) return json(response, 401, { error: "unauthorized" });
    const commandMatch = /^\/v1\/commands\/([^/]+)$/.exec(url.pathname);
    if (commandMatch && request.method === "GET") return json(response, 200, await inspectCommand(decodeURIComponent(commandMatch[1])));
    if (!match) return json(response, 404, { error: "not found" });
    const name = decodeURIComponent(match[1]);
    const action = match[2] || "";

    if (!action && request.method === "POST") return json(response, 200, await ensureSandbox(name));
    if (!action && request.method === "GET") {
      const container = await inspectContainer(name);
      return json(response, 200, { exists: Boolean(container), running: Boolean(container?.State?.Running) });
    }
    const body = await readBody(request);
    if (action === "/llm" && request.method === "POST") {
      if (typeof body.controlToken !== "string" || !body.controlToken.trim()) {
        throw Object.assign(new Error("LLM relay control token is required"), { status: 400 });
      }
      const url = completionUrl(body.baseUrl);
      await assertPublicHttpUrl(url);
      llmRelays.set(name, {
        apiKey: typeof body.apiKey === "string" && body.apiKey ? body.apiKey : null,
        controlToken: body.controlToken,
        url,
      });
      return json(response, 200, { ok: true });
    }
    if (action === "/commands" && request.method === "POST") return json(response, 200, await createExec(name, body));
    if (action === "/mkdir" && request.method === "POST") {
      const target = assertSandboxPath(body.path);
      await runUtility(name, `mkdir -p ${shellQuote(target)}`);
      return json(response, 200, { ok: true });
    }
    if (action === "/files/read" && request.method === "POST") {
      const target = assertSandboxPath(body.path);
      const output = await runUtility(name, `if [ -f ${shellQuote(target)} ]; then printf '1'; base64 -w 0 ${shellQuote(target)}; else printf '0'; fi`);
      return json(response, 200, output.startsWith("1") ? { exists: true, content: output.slice(1) } : { exists: false });
    }
    if (action === "/files/write" && request.method === "POST") {
      if (!Array.isArray(body.files) || body.files.length > 20) throw Object.assign(new Error("files must be a short array"), { status: 400 });
      for (const file of body.files) {
        const target = assertSandboxPath(file.path);
        if (typeof file.content !== "string") throw Object.assign(new Error("file content must be base64"), { status: 400 });
        const temporary = `${target}.minddy-write`;
        await runUtility(name, `mkdir -p ${shellQuote(path.dirname(target))}; : > ${shellQuote(temporary)}`);
        for (let offset = 0; offset < file.content.length; offset += 262_144) {
          await runUtility(
            name,
            `printf %s "$MINDDY_FILE" | base64 -d >> ${shellQuote(temporary)}`,
            { MINDDY_FILE: file.content.slice(offset, offset + 262_144) },
          );
        }
        await runUtility(name, `mv ${shellQuote(temporary)} ${shellQuote(target)}`);
      }
      return json(response, 200, { ok: true });
    }
    if (action === "/stop" && request.method === "POST") {
      const container = await inspectContainer(name);
      if (container?.State?.Running) await docker("POST", `/v1.44/containers/${encodeURIComponent(sandboxContainerName(name))}/stop?t=10`);
      llmRelays.delete(name);
      return json(response, 200, { ok: true });
    }
    return json(response, 404, { error: "not found" });
  } catch (error) {
    console.error("[agent-runner]", error instanceof Error ? error.message : error);
    return json(response, Number(error?.status) || 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[agent-runner] ready on port ${port}`);
  setTimeout(() => void removeExpiredSandboxes().catch((error) => {
    console.error("[agent-runner] cleanup failed:", error.message);
  }), 30_000).unref();
  setInterval(() => void removeExpiredSandboxes().catch((error) => {
    console.error("[agent-runner] cleanup failed:", error.message);
  }), 6 * 60 * 60_000).unref();
});
