import type { Locale } from "@/i18n/config";

export type ChangelogIllustration =
  | { kind: "code"; name: "shield" | "board" | "assistant" | "pages" | "connections" | "activity" | "desktop" }
  | { kind: "icon"; name: "shield" | "board" | "assistant" | "pages" | "connections" | "activity" | "desktop" }
  | { kind: "image"; url: string; width: number; height: number };

export interface FeatureCopy {
  title: string;
  summary: string;
  details: string[];
}
export interface ChangelogFeature {
  id: string;
  illustration: ChangelogIllustration;
  copy: Record<Locale, FeatureCopy>;
}
export interface ChangelogDraft {
  version: string;
  layout: "compact" | "bento";
  copy: Record<Locale, { title: string; summary: string }>;
  features: ChangelogFeature[];
  evidence: { commits: string[]; issues: string[] };
}
export interface ChangelogRelease extends ChangelogDraft {
  publishedAt: string;
  sha: string;
  deploymentId: number;
}
export type ChangelogIndexEntry = Pick<ChangelogRelease,
  "version" | "layout" | "copy" | "publishedAt" | "sha" | "deploymentId"> & { featureIds: string[] };
export interface ChangelogFeatureSummary {
  id: string;
  title: string;
  illustration: ChangelogIllustration;
  details: string[];
}
export interface ChangelogReleaseSummary {
  version: string;
  publishedAt: string;
  layout: "compact" | "bento";
  title: string;
  summary: string;
  features: ChangelogFeatureSummary[];
}
export interface ChangelogPageContent {
  releases: ChangelogReleaseSummary[];
  next: string | null;
}
export interface ChangelogFeatureDetail extends ChangelogFeatureSummary {
  version: string;
}
export interface ChangelogLabels {
  more: string;
  loading: string;
  error: string;
  retry: string;
  details: string;
}
