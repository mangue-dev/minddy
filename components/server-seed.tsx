"use client";

import { useEffect } from "react";
import { receiveServerSeeds, type ServerSeedStream } from "@/lib/server-seed";
import { rememberTimeZone } from "@/lib/time-zone-cookie";

/**
 * In the shell, before any query starts: the document carries seeds. Runs
 * during render so a query mounted in the same commit already finds the
 * store (lib/server-seed.ts); receiving is idempotent.
 */
export function ServerSeedExpect({ seeds }: { seeds: Promise<ServerSeedStream | null> }) {
  if (typeof window !== "undefined") receiveServerSeeds(seeds);
  return null;
}

/**
 * Timezone-dependent reads (`/api/me/board?tz=…`) can be seeded on the next
 * document load once the server knows this browser's zone. Mounted by the
 * app on every load, documents and client navigations alike.
 */
export function RememberTimeZone() {
  useEffect(() => { rememberTimeZone(); }, []);
  return null;
}
