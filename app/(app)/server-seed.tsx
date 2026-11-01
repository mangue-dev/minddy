import { headers } from "next/headers";
import { ServerSeedExpect } from "@/components/server-seed";
import { runServerSeed, serverSeedPlan, SERVER_SEED_PATH_HEADER } from "@/lib/server/server-seed";
import type { ServerSeedStream } from "@/lib/server-seed";
import { withSharedLiveAuthorization } from "@/lib/server/api-auth";

/**
 * Startup reads sent with the document (MIN-880, lib/server-seed.ts).
 *
 * The shell awaits nothing, so the first byte and the scripts leave as early
 * as before. The plan, then each response, travel as promises in the page's
 * server payload: the browser resolves each one as soon as its chunk arrives,
 * independently of the others and without waiting for React to hydrate
 * anything (a Suspense boundary per response only delivered once React got
 * to it, after the shell's own renders).
 */
export async function ServerSeed() {
  if (!(await headers()).get(SERVER_SEED_PATH_HEADER)) return null;
  return <ServerSeedExpect seeds={startServerSeeds()} />;
}

async function startServerSeeds(): Promise<ServerSeedStream | null> {
  const plan = await serverSeedPlan();
  if (!plan) return null;
  return {
    ...plan,
    // Every read starts now, in parallel; each resolves on its own.
    // One live session check serves them all (lib/server/api-auth.ts).
    responses: withSharedLiveAuthorization(() =>
      Object.fromEntries(plan.paths.map((path) => [path, runServerSeed(path)]))),
  };
}
