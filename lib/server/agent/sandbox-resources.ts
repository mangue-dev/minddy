/**
 * Vercel allocates 2 GiB per vCPU. Leave room for the supervisor and concurrent
 * tools instead of letting each language runtime size itself for the whole VM.
 * GOMEMLIMIT is a GC target, not a hard RSS limit; native allocations can exceed
 * it. Keep this profile limited to managed Vercel sandboxes.
 */
export const AGENT_SANDBOX_RUNTIME_ENV = {
  GOMEMLIMIT: "2048MiB",
} as const;
