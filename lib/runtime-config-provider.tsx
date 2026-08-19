"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PublicRuntimeConfig } from "@/lib/public-runtime-config";

const RuntimeConfigContext = createContext<PublicRuntimeConfig | null>(null);
let currentConfig: PublicRuntimeConfig | null = null;

export function RuntimeConfigProvider({
  config,
  children,
}: {
  config: PublicRuntimeConfig;
  children: ReactNode;
}) {
  // This executes before descendants render, including AuthProvider which
  // creates the browser Supabase client during its first render.
  currentConfig = config;
  return <RuntimeConfigContext.Provider value={config}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig(): PublicRuntimeConfig {
  const config = useContext(RuntimeConfigContext);
  if (!config) throw new Error("Runtime configuration is unavailable before RuntimeConfigProvider.");
  return config;
}

export function browserRuntimeConfig(): PublicRuntimeConfig {
  if (!currentConfig) throw new Error("Runtime configuration is unavailable before RuntimeConfigProvider.");
  return currentConfig;
}
