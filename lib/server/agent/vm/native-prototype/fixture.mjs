import { createInterface } from "node:readline";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
const engine = process.argv[2];
const args = JSON.parse(process.argv[3]);
const send = (data) => process.stdout.write(`${JSON.stringify(data)}\n`);
if (engine === "codex" && args[0] === "sandbox") {
  process.exit(args.join(" ").includes('="deny"') ? 0 : 41);
} else if (engine === "codex") {
  createInterface({ input: process.stdin }).on("line", (line) => {
    const request = JSON.parse(line);
    if (request.id === undefined) return;
    let result = {};
    if (request.method === "account/login/start") {
      result = { type: "chatgptDeviceCode", loginId: "fixture-login", userCode: "ABCD-EFGH", verificationUrl: "https://auth.openai.com/codex/device" };
      setTimeout(() => send({ method: "account/login/completed", params: { loginId: "fixture-login", success: true } }), 40);
    }
    if (request.method === "account/read") result = { account: { type: "chatgpt", email: "private-fixture@example.invalid" }, requiresOpenaiAuth: true };
    if (request.method === "thread/start") {
      if (request.params.config.permissions.minddy_native_fixture.filesystem[dirname(dirname(process.env.CODEX_HOME))] !== "deny") { send({ id: request.id, error: { code: -1, message: "Missing protection" } }); return; }
      result = { thread: { id: "fixture-thread" } };
    }
    if (request.method === "turn/start") {
      const text = request.params.input[0].text;
      const tool = text.match(/tool (minddy_[a-z0-9_]+)/)[1];
      const marker = text.match(/exactly ([A-Z0-9_]+)\./)[1];
      setTimeout(() => {
        send({ method: "item/completed", params: { item: { type: "mcpToolCall", server: "minddy", tool, status: "completed", error: null } } });
        send({ method: "item/completed", params: { item: { type: "agentMessage", text: marker } } });
        send({ method: "turn/completed", params: { turn: { status: "completed" } } });
      }, 20);
    }
    send({ id: request.id, result });
  });
} else if (args[1] === "status") {
  send({ loggedIn: true, authMethod: "claude.ai", email: "private-fixture@example.invalid" });
} else if (args[1] === "login") {
  process.stdout.write("native terminal secret must not escape\nhttps://evil.invalid/oauth?code=secret\nhttps://claude.ai/oauth/authorize?state=fixture\n");
  createInterface({ input: process.stdin }).once("line", async () => {
    await writeFile(join(process.env.CLAUDE_CONFIG_DIR, ".credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: "fake-access", refreshToken: "fake-refresh" } }));
    process.exit(0);
  });
} else {
  const tool = args[args.indexOf("--allowedTools") + 1];
  const marker = args.at(-1).match(/exactly ([A-Z0-9_]+)\./)[1];
  send({ type: "assistant", message: { content: [{ type: "tool_use", name: tool }] } });
  send({ type: "result", is_error: false, result: marker });
}
