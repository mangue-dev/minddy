"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The per-request script nonce (MIN-999, `lib/csp.ts`), for the client
 * components that insert a pre-paint `<script>` during server rendering. The
 * root layout reads it from the proxy's request header and provides it here.
 */
const CspNonceContext = createContext<string | undefined>(undefined);

export function CspNonceProvider({ nonce, children }: { nonce: string | undefined; children: ReactNode }) {
  return <CspNonceContext.Provider value={nonce}>{children}</CspNonceContext.Provider>;
}

export function useCspNonce(): string | undefined {
  return useContext(CspNonceContext);
}
