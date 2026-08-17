import "server-only";

import {
  resolveCapabilities,
  type CapabilityId,
  type CapabilityStatus,
} from "@/lib/capabilities";

export function capabilities(): ReturnType<typeof resolveCapabilities> {
  return resolveCapabilities(process.env);
}

export function capability(id: CapabilityId): CapabilityStatus {
  return capabilities()[id];
}

export class CapabilityUnavailableError extends Error {
  constructor(readonly capabilityStatus: CapabilityStatus) {
    super(capabilityStatus.diagnostic);
    this.name = "CapabilityUnavailableError";
  }
}

export function requireCapability(id: CapabilityId): CapabilityStatus {
  const current = capability(id);
  if (!current.configured) throw new CapabilityUnavailableError(current);
  return current;
}
