import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

import {
  parseLocalRepoStore,
  serializeLocalRepoStore,
  type LocalRepoStore,
} from "@/lib/desktop/local-repo";

/**
 * Attached folders, retained from one launch to another (MIN-359).
 *
 * Same pattern as [channel-store.ts](channel-store.ts), and for some reason
 * plus: **this setting only makes sense on this machine.** A home path ne
 * means nothing elsewhere; storing it server side would publish it, falsely, to all
 * project members. It therefore lives in `userData`, next to the channel and the
 * session, under the app name set by `main.ts`.
 *
 * ⚠ The CHANGE folder in development (`minddy-dev`, cf. `app.setName`): the
 * dev shell and the installed app do not have the same attachments. This is
 * consistent with the rest, and it prevents a dev session from redirecting the runs of
 * the installed app to a folder that we are breaking.
 *
 * Read and write **synchronous**: the file is a few hundred
 * bytes and each gesture is a round trip from IPC waiting for its response.
 */

const FILE_NAME = "repos.json";

function storeFile(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

/**
 * Attachments on disk, or nothing.
 *
 * **Any failure falls on an empty store, silently**: file absent (the normal case
 *, no one has attached anything yet), JSON truncated by a
 * abrupt stop, read-only folder. Neither case justifies
 * preventing the app from opening, and the fallback is always "no folder
 * attached", i.e. cloud.
 */
export function readLocalRepos(): LocalRepoStore {
  try {
    return parseLocalRepoStore(JSON.parse(readFileSync(storeFile(), "utf8")));
  } catch {
    return {};
  }
}

/**
 * Retains attachments. Returns `false` if the write failed — the caller
 * still responds to the page, but the choice will not survive the next
 * launch, and that's something we want to see in the logs rather than
 * finding out on reboot.
 */
export function writeLocalRepos(store: LocalRepoStore): boolean {
  try {
    writeFileSync(storeFile(), serializeLocalRepoStore(store), "utf8");
    return true;
  } catch (error) {
    console.error("[local-repo] write failed", error);
    return false;
  }
}
