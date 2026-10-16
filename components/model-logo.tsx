"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CpuIcon } from "@hugeicons/core-free-icons";
import type { ComponentType } from "react";
import Ai21 from "@lobehub/icons/es/Ai21/components/Mono";
import AionLabsColor from "@lobehub/icons/es/AionLabs/components/Color";
import ArceeColor from "@lobehub/icons/es/Arcee/components/Color";
import BedrockColor from "@lobehub/icons/es/Bedrock/components/Color";
import ByteDanceColor from "@lobehub/icons/es/ByteDance/components/Color";
import ClaudeColor from "@lobehub/icons/es/Claude/components/Color";
import CohereColor from "@lobehub/icons/es/Cohere/components/Color";
import DeepSeekColor from "@lobehub/icons/es/DeepSeek/components/Color";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import Grok from "@lobehub/icons/es/Grok/components/Mono";
import IBM from "@lobehub/icons/es/IBM/components/Mono";
import Inception from "@lobehub/icons/es/Inception/components/Mono";
import KwaipilotColor from "@lobehub/icons/es/Kwaipilot/components/Color";
import Liquid from "@lobehub/icons/es/Liquid/components/Mono";
import LongCatColor from "@lobehub/icons/es/LongCat/components/Color";
import MetaColor from "@lobehub/icons/es/Meta/components/Color";
import MinimaxColor from "@lobehub/icons/es/Minimax/components/Color";
import MistralColor from "@lobehub/icons/es/Mistral/components/Color";
import Moonshot from "@lobehub/icons/es/Moonshot/components/Mono";
import NvidiaColor from "@lobehub/icons/es/Nvidia/components/Color";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import OpenCode from "@lobehub/icons/es/OpenCode/components/Mono";
import OpenRouter from "@lobehub/icons/es/OpenRouter/components/Mono";
import PerplexityColor from "@lobehub/icons/es/Perplexity/components/Color";
import PoolsideColor from "@lobehub/icons/es/Poolside/components/Color";
import QwenColor from "@lobehub/icons/es/Qwen/components/Color";
import Relace from "@lobehub/icons/es/Relace/components/Mono";
import Stepfun from "@lobehub/icons/es/Stepfun/components/Mono";
import TencentColor from "@lobehub/icons/es/Tencent/components/Color";
import UpstageColor from "@lobehub/icons/es/Upstage/components/Color";
import XiaomiMiMo from "@lobehub/icons/es/XiaomiMiMo/components/Mono";
import ZhipuColor from "@lobehub/icons/es/Zhipu/components/Color";
import { cn } from "mangue-ui";
import { providerFromModel } from "@/lib/model-display";

/**
 * Color logo of an AI model (MIN-46) deduced from its OpenRouter id
 * `provider/model` via `@lobehub/icons`. Shared by `ModelBadge` (display
 * of a run) and `ModelCombobox` (searchable picker). Each rendered variant is
 * imported from its own module: a brand's index attaches every variant (Text,
 * Combine, Avatar) as static properties, and those assignments keep
 * `IconAvatar`/`@lobehub/ui` in the bundle despite `sideEffects:false`.
 * Unknown slug provider → fallback `Cpu`.
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
 * The Color variant when the brand publishes one, the monochrome otherwise —
 * some only have one version (OpenAI, Grok, Moonshot, and most small publishers).
 * A slug absent from here falls on `Cpu`.
 */
const PROVIDER_LOGOS: Record<string, ComponentType<LobeLogo>> = {
  deepseek: DeepSeekColor,
  anthropic: ClaudeColor,
  openai: OpenAI,
  google: GeminiColor,
  gemini: GeminiColor,
  meta: MetaColor,
  mistral: MistralColor,
  qwen: QwenColor,
  xai: Grok,
  moonshot: Moonshot,
  zhipu: ZhipuColor,
  cohere: CohereColor,
  perplexity: PerplexityColor,
  openrouter: OpenRouter,
  // The two OpenCode BYOK providers (MIN-544) are keyed by their provider id,
  // not by an OpenRouter slug: `ProviderLogo` receives the raw id from the
  // connect panel and the key recall card. The gateway publishes no `opencode`
  // vendor on OpenRouter, so no other id can collide here.
  "opencode-go": OpenCode,
  "opencode-zen": OpenCode,
  minimax: MinimaxColor,
  nvidia: NvidiaColor,
  bedrock: BedrockColor,
  poolside: PoolsideColor,
  kwaipilot: KwaipilotColor,
  "aion-labs": AionLabsColor,
  upstage: UpstageColor,
  tencent: TencentColor,
  "bytedance-seed": ByteDanceColor,
  "arcee-ai": ArceeColor,
  // Meituan only publishes the LongCat family under this slug, for which it is the logo.
  meituan: LongCatColor,
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
    <HugeiconsIcon icon={CpuIcon} className={cn("shrink-0 text-muted-foreground", className)} style={{ width: size, height: size }} />
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
