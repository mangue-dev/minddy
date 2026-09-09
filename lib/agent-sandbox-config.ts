export const SANDBOX_REGIONS = ["eu", "us"] as const;
export const SANDBOX_SIZES = ["standard", "performance"] as const;
export type SandboxRegion = (typeof SANDBOX_REGIONS)[number];
export type SandboxSize = (typeof SANDBOX_SIZES)[number];

export const DEFAULT_SANDBOX_REGION: SandboxRegion = "eu";
export const DEFAULT_SANDBOX_SIZE: SandboxSize = "standard";
export const SANDBOX_REGION_CODES = { eu: "dub1", us: "iad1" } as const;
export const SANDBOX_RESOURCES = {
  standard: { vcpus: 4, memoryMb: 8192 },
  performance: { vcpus: 8, memoryMb: 16384 },
} as const;

export function isSandboxRegion(value: unknown): value is SandboxRegion {
  return value === "eu" || value === "us";
}

export function isSandboxSize(value: unknown): value is SandboxSize {
  return value === "standard" || value === "performance";
}

export interface SandboxPreferences {
  sandbox_region: SandboxRegion;
  sandbox_size: SandboxSize;
}

export function resolveSandboxPreferences(row?: {
  sandbox_region?: unknown;
  sandbox_size?: unknown;
} | null): SandboxPreferences {
  return {
    sandbox_region: isSandboxRegion(row?.sandbox_region)
      ? row.sandbox_region : DEFAULT_SANDBOX_REGION,
    sandbox_size: isSandboxSize(row?.sandbox_size)
      ? row.sandbox_size : DEFAULT_SANDBOX_SIZE,
  };
}

/** Provider-observed allocation and server-calculated rate, persisted per run. */
export interface SandboxBilling {
  region: string;
  vcpus: number;
  memoryMb: number;
  usdPerMinute: number;
}

// Vercel regional rates, verified 2026-09-09:
// https://vercel.com/docs/sandbox/pricing
const REGIONAL_RATES: Record<string, { cpu: number; memory: number }> = {
  iad1: { cpu: 0.128, memory: 0.0212 },
  dub1: { cpu: 0.168, memory: 0.0278 },
};

// Retain the existing workload estimate: 4 vCPU / 8 GiB in iad1 costs $0.24/h.
// Memory contributes $0.1696/h; CPU contributes $0.0704/h at 13.75% utilization.
// This is an estimate, not metered active CPU. Recalibrate against invoices.
const ESTIMATED_CPU_UTILIZATION = 0.1375;

export function sandboxBillingFor(allocation: Omit<SandboxBilling, "usdPerMinute">): SandboxBilling {
  const rates = REGIONAL_RATES[allocation.region];
  if (!rates || !Number.isInteger(allocation.vcpus) || allocation.vcpus <= 0 ||
      !Number.isFinite(allocation.memoryMb) || allocation.memoryMb <= 0) {
    throw new Error("Unsupported sandbox allocation");
  }
  return {
    ...allocation,
    usdPerMinute: (
      (allocation.memoryMb / 1024) * rates.memory +
      allocation.vcpus * rates.cpu * ESTIMATED_CPU_UTILIZATION
    ) / 60,
  };
}

/** Percentage of the full usage allowance, not the remaining balance. */
export function sandboxUsagePercentPerHour(preferences: SandboxPreferences, includedUsd: number): number | null {
  if (!Number.isFinite(includedUsd) || includedUsd <= 0) return null;
  const resources = SANDBOX_RESOURCES[preferences.sandbox_size];
  const billing = sandboxBillingFor({
    region: SANDBOX_REGION_CODES[preferences.sandbox_region],
    ...resources,
  });
  return (billing.usdPerMinute * 60 / includedUsd) * 100;
}
