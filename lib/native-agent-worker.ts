import type { HarnessLayout } from "./server/agent/harness-layout";
import type { NativeHarness } from "./native-agent-prototype";

export type NativeWorkerMessage = { role: "user" | "assistant"; text: string };
export type NativeWorkerCheckpoint = { engine: NativeHarness; history: NativeWorkerMessage[] };
/** Fresh sandboxes reconstruct bounded context; opaque native session IDs never travel. */
export function nativeReplayPrompt(prompt: string, history: NativeWorkerMessage[]): string {
  if (!history.length) return prompt;
  const replay = history.slice(-24).map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.text.slice(0, 8000)}`).join("\n\n").slice(-48_000);
  return `This is a fresh native CLI session. The previous Minddy worker conversation is reconstructed below as context. Recheck current repository and ticket state before acting.\n\n${replay}\n\nCurrent request:\n${prompt}`;
}
export function nativeWorkerPaths(layout: HarnessLayout) {
  const privateRoot = `${layout.harnessDir}/native-private`;
  return { privateRoot, profileRoot: `${privateRoot}/profiles`, profileImportPath: `${privateRoot}/profile-import.json`, profileExportPath: `${privateRoot}/profile-export.json` };
}
