/** Keep every writable Agent path in memory, including the checkout and OpenCode files. */
export function agentSandboxStorage() {
  const configured = Number(process.env.AGENT_RUNNER_SANDBOX_TMPFS_BYTES);
  const bytes = Number.isSafeInteger(configured) && configured >= 1_073_741_824
    ? configured
    : 3_221_225_472;
  return {
    LogConfig: { Type: "none" },
    Tmpfs: {
      // Docker otherwise defaults tmpfs to noexec; OpenCode lives here.
      "/vercel": `rw,exec,nosuid,nodev,size=${bytes},uid=10001,gid=10001,mode=0700`,
      "/tmp": "rw,nosuid,nodev,size=1073741824",
    },
  };
}

/** Stay below Linux's per-argument limit when passing file data to Docker exec. */
export function* base64FileChunks(content) {
  const chunkSize = 65_536;
  for (let offset = 0; offset < content.length; offset += chunkSize) {
    yield content.slice(offset, offset + chunkSize);
  }
}
