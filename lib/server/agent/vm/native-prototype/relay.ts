import { randomUUID } from "node:crypto";

export type NativeTool = { name: string; description: string; inputSchema: Record<string, unknown> };
export type PendingTool = { id: string; name: string; args: Record<string, unknown> };
export class NativeToolRelay {
  private tools: NativeTool[] = [];
  private pending = new Map<string, { call: PendingTool; resolve(result: unknown): void; timer: ReturnType<typeof setTimeout> }>();
  private count = 0;
  private successfulCalls = 0;
  configure(tools: unknown, requiredTool: string) {
    if (!Array.isArray(tools) || tools.length !== 1 || tools[0]?.name !== requiredTool || !/^minddy_[a-z0-9_]+$/.test(requiredTool) || typeof tools[0]?.description !== "string" || !tools[0]?.inputSchema || JSON.stringify(tools).length > 16_384) throw new Error("Invalid native MCP fixture");
    this.cancel(); this.count = 0; this.successfulCalls = 0;
    this.tools = [{ name: requiredTool, description: tools[0].description, inputSchema: tools[0].inputSchema }];
  }
  status(): PendingTool[] { return [...this.pending.values()].map(({ call }) => call); }
  hasSuccessfulCall() { return this.successfulCalls > 0; }
  cancel() { for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.resolve({ content: [{ type: "text", text: "Private MCP operation cancelled" }], isError: true }); } this.pending.clear(); }
  complete(id: unknown, result: unknown) {
    if (typeof id !== "string" || !this.pending.has(id) || !result || typeof result !== "object" || JSON.stringify(result).length > 64 * 1024 || !Array.isArray((result as { content?: unknown }).content)) throw new Error("Invalid MCP result");
    const entry = this.pending.get(id)!;
    if ((result as { isError?: boolean }).isError !== true) this.successfulCalls++;
    clearTimeout(entry.timer); this.pending.delete(id); entry.resolve(result);
  }
  async request(input: { id?: string | number; method?: string; params?: Record<string, unknown> }) {
    if (input.id === undefined) return undefined;
    let result: unknown;
    switch (input.method) {
      case "initialize": result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "minddy-private-native-prototype", version: "1.0.0" } }; break;
      case "ping": result = {}; break;
      case "tools/list": result = { tools: this.tools }; break;
      case "tools/call": {
        const name = input.params?.name;
        const args = input.params?.arguments ?? {};
        if (typeof name !== "string" || !this.tools.some((tool) => tool.name === name) || !args || typeof args !== "object" || Array.isArray(args) || JSON.stringify(args).length > 8192 || this.count >= 8) throw new Error("Unsupported MCP call");
        this.count++;
        const id = randomUUID();
        result = await new Promise((resolve) => {
          const timer = setTimeout(() => { this.pending.delete(id); resolve({ content: [{ type: "text", text: "Private MCP operation timed out" }], isError: true }); }, 45_000);
          this.pending.set(id, { call: { id, name, args: args as Record<string, unknown> }, timer, resolve });
        });
        break;
      }
      default: throw new Error("Unsupported MCP method");
    }
    return { jsonrpc: "2.0", id: input.id, result };
  }
}
