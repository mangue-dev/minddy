/** Public settings supplied by the running minddy instance to every browser. */
export interface PublicRuntimeConfig {
  appUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  siteName: string;
  contactEmail: string;
  productFeedbackUrl: string | null;
  posthog: { key: string | null; host: string | null; allowLocalhost: boolean };
  vapidPublicKey: string | null;
  capabilities: Record<string, { state: string; configured: boolean }>;
}
