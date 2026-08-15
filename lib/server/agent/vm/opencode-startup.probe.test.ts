import fs from "node:fs";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  installOpencode,
  probeConfig,
  probeRoot,
  startProbeServer,
  startProvider,
  waitFor,
  type FakeProvider,
  type ProbeServer,
} from "./opencode-probe-rig";

/**
 * MESURE LOCALE DU PREMIER APPEL MODELE (MIN-368).
 *
 * Cette sonde emploie le binaire OpenCode réellement installé et un fournisseur
 * OpenAI-compatible local : aucun token ni secret ne quitte donc la machine.
 * Elle ne s'exécute que sur demande, car démarrer le binaire natif est beaucoup
 * trop cher pour la suite unitaire :
 *
 * MDY_OPENCODE_STARTUP_PROBE=1 MDY_OPENCODE_BIN=<...>/bin/opencode \
 *   npx vitest run lib/server/agent/vm/opencode-startup.probe.test.ts
 */
const LIVE = process.env.MDY_OPENCODE_STARTUP_PROBE === "1";

let bin = "";
let installRoot = "";
const running: ProbeServer[] = [];
const providers: FakeProvider[] = [];
const roots: string[] = [];

beforeAll(async () => {
  if (!LIVE) return;
  installRoot = probeRoot("install-startup");
  bin = installOpencode(installRoot);
}, 600_000);

afterEach(() => {
  for (const server of running.splice(0)) server.stop();
  for (const provider of providers.splice(0)) provider.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
});

describe.skipIf(!LIVE)("démarrage réel d'OpenCode", () => {
  async function measure(label: string, env: Record<string, string>): Promise<void> {
    const provider = await startProvider([{ text: "ok" }]);
    providers.push(provider);
    const bootStartedAt = performance.now();
    const server = await startProbeServer({
      bin,
      tag: `startup-${label}`,
      config: probeConfig(provider.url),
      env,
    });
    running.push(server);
    roots.push(server.root);
    const serverReadyMs = performance.now() - bootStartedAt;

    const session = await server.createSession("startup probe");
    const promptStartedAt = performance.now();
    await server.prompt(session, "Say ok.");
    expect(await waitFor(() => provider.seen.length > 0, 30_000, 20)).toBe(true);
    const firstModelRequestMs = performance.now() - promptStartedAt;

    // Ces nombres sont la mesure, non une limite rigide : le matériel et le
    // cache disque changent. Les écrire rend immédiatement visible une
    // régression sur un Mac sans transformer une fluctuation de CI en échec.
    console.log(
      `[opencode-startup-probe:${label}] server-ready=${Math.round(serverReadyMs)}ms ` +
        `first-model-request=${Math.round(firstModelRequestMs)}ms`,
    );
  }

  it("mesure le délai jusqu'au premier appel modèle avec la configuration du harness", async () => {
    await measure("baseline", {
      OPENCODE_PURE: "1",
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
      OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
      OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
    });
    await measure("optimized", {
      OPENCODE_PURE: "1",
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
      OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
      OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
      OPENCODE_DISABLE_FFF: "1",
      OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
    });

  }, 120_000);
});
