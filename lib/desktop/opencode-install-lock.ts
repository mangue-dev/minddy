import { mkdir, rm, stat } from "node:fs/promises";

const INSTALL_LOCK_STALE_MS = 5 * 60_000;

/** Serializes OpenCode installation across desktop and harness processes. */
export async function withOpencodeInstallLock<T>(
  installDir: string,
  task: () => Promise<T>,
): Promise<T> {
  const lockDir = `${installDir}/.minddy-install-lock`;
  await mkdir(installDir, { recursive: true });
  for (;;) {
    try {
      await mkdir(lockDir);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = await stat(lockDir).then(
        (value) => Date.now() - value.mtimeMs,
        () => 0,
      );
      if (age > INSTALL_LOCK_STALE_MS) {
        await rm(lockDir, { recursive: true, force: true });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  try {
    return await task();
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}
