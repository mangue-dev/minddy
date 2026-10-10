import type { HarnessLayout } from "./server/agent/harness-layout";
import type { NativeHarness } from "./native-agent-prototype";

export type NativeWorkerMessage = { role: "user" | "assistant"; text: string };
export type NativeWorkerCheckpoint = { engine: NativeHarness; history: NativeWorkerMessage[] };
export function nativeWorkerPaths(layout: HarnessLayout) {
  const privateRoot = `${layout.harnessDir}/native-private`;
  return { privateRoot, profileRoot: `${privateRoot}/profiles`, profileImportPath: `${privateRoot}/profile-import.json`, profileExportPath: `${privateRoot}/profile-export.json` };
}
