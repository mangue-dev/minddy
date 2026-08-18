"use client";

import type { ComponentType } from "react";
import {
  Ai21,
  AionLabs,
  Arcee,
  Bedrock,
  ByteDance,
  Claude,
  Cohere,
  DeepSeek,
  Gemini,
  Grok,
  IBM,
  Inception,
  Kwaipilot,
  Liquid,
  LongCat,
  Meta,
  Minimax,
  Mistral,
  Moonshot,
  Nvidia,
  OpenAI,
  OpenRouter,
  Perplexity,
  Poolside,
  Qwen,
  Relace,
  Stepfun,
  Tencent,
  Upstage,
  XiaomiMiMo,
  Zhipu,
} from "@lobehub/icons";
import { Cpu } from "lucide-react";
import { cn } from "mangue-ui";
import { providerFromModel } from "@/lib/model-display";

/**
 * Color logo of an AI model (MIN-46) deduced from its OpenRouter id
 * `provider/model` via `@lobehub/icons`. Shared by `ModelBadge` (display
 * of a run) and `ModelCombobox` (searchable picker). We import the marks
 * individually (the barrel has `sideEffects:false`) so as not to draw
 * `ProviderIcon`/`@lobehub/ui`. Unknown slug provider → fallback `Cpu`.
 *
 * A handful of publishers remain on this fallback, and it's a choice: they don't
 * publish anything usable in 14 pixels (two-line logos at
 * Thinking Machines, personal avatars at TheDrummer and Sao10K). A neutral chip
 * is better than a blurry raster — and better than a colored monogram,
 * tried then removed: it attracted the eye more than real logos.
 */

type LobeLogo = { size?: number; className?: string };

/**
 * slug provider (normalized by providerFromModel) → component logo.
 *
 * The keys are the slugs AS OPENROUTER PUBLISHES them, once passed through the
 * alias of `providerFromModel` (`z-ai` → `zhipu`, `amazon` → `bedrock`…). Hence
 * the hyphens kept on `aion-labs`, `bytedance-seed`, `arcee-ai`,
 * `ibm-granite`: these editors do not have an alias, and it is indeed this string
 * that we receive.
 *
 * `.Color` when the brand publishes one, the monochrome otherwise — some only have
 * one version (OpenAI, Grok, Moonshot, and most small publishers).
 * A slug absent from here falls on `Cpu`.
 */
const PROVIDER_LOGOS: Record<string, ComponentType<LobeLogo>> = {
  deepseek: DeepSeek.Color,
  anthropic: Claude.Color,
  openai: OpenAI,
  google: Gemini.Color,
  gemini: Gemini.Color,
  meta: Meta.Color,
  mistral: Mistral.Color,
  qwen: Qwen.Color,
  xai: Grok,
  moonshot: Moonshot,
  zhipu: Zhipu.Color,
  cohere: Cohere.Color,
  perplexity: Perplexity.Color,
  openrouter: OpenRouter,
  minimax: Minimax.Color,
  nvidia: Nvidia.Color,
  bedrock: Bedrock.Color,
  poolside: Poolside.Color,
  kwaipilot: Kwaipilot.Color,
  "aion-labs": AionLabs.Color,
  upstage: Upstage.Color,
  tencent: Tencent.Color,
  "bytedance-seed": ByteDance.Color,
  "arcee-ai": Arcee.Color,
  // Meituan only publishes the LongCat family under this slug, for which it is the logo.
  meituan: LongCat.Color,
  stepfun: Stepfun,
  liquid: Liquid,
  inception: Inception,
  relace: Relace,
  ai21: Ai21,
  xiaomi: XiaomiMiMo,
  "ibm-granite": IBM,
};

/**
 * Does this slug have a real logo, or will it fall back on the generic `Cpu`?
 *
 * Exported for testing: a RECOMMENDED model without a logo is a default visible
 * to everyone, since this is the list on which the picker opens.
 */
export function hasProviderLogo(slug: string): boolean {
  return slug in PROVIDER_LOGOS;
}

function LogoBySlug({
  slug,
  size,
  className,
}: {
  slug: string;
  size: number;
  className?: string;
}) {
  const Logo = slug ? PROVIDER_LOGOS[slug] : undefined;
  if (Logo) return <Logo size={size} className={cn("shrink-0", className)} />;
  return (
    <Cpu
      className={cn("shrink-0 text-muted-foreground", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** Logo deduced from a model id `provider/model` (e.g. "openai/gpt-4o"). */
export function ModelLogo({
  model,
  size = 14,
  className,
}: {
  model: string | null | undefined;
  size?: number;
  className?: string;
}) {
  return <LogoBySlug slug={providerFromModel(model)} size={size} className={className} />;
}

/** Logo deduced from a direct provider slug (e.g. "openai", "anthropic", "google"). */
export function ProviderLogo({
  provider,
  size = 14,
  className,
}: {
  provider: string | null | undefined;
  size?: number;
  className?: string;
}) {
  return <LogoBySlug slug={(provider ?? "").toLowerCase()} size={size} className={className} />;
}
