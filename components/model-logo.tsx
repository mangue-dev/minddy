"use client";

import type { ComponentType } from "react";
import {
  Claude,
  Cohere,
  DeepSeek,
  Gemini,
  Grok,
  Meta,
  Mistral,
  Moonshot,
  OpenAI,
  OpenRouter,
  Perplexity,
  Qwen,
  Zhipu,
} from "@lobehub/icons";
import { Cpu } from "lucide-react";
import { cn } from "mangue-ui";
import { providerFromModel } from "@/lib/model-display";

/**
 * Logo couleur d'un modèle IA (MIN-46) déduit de son id OpenRouter
 * `provider/model` via `@lobehub/icons`. Partagé par `ModelBadge` (affichage
 * d'un run) et `ModelCombobox` (picker recherchable). On importe les marques
 * individuellement (le barrel a `sideEffects:false`) pour ne pas tirer
 * `ProviderIcon`/`@lobehub/ui`. Slug provider inconnu → fallback `Cpu`.
 */

type LobeLogo = { size?: number; className?: string };

/** slug provider (normalisé par providerFromModel) → composant logo couleur. */
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
};

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

/** Logo déduit d'un id modèle `provider/model` (ex. "openai/gpt-4o"). */
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

/** Logo déduit d'un slug provider direct (ex. "openai", "anthropic", "google"). */
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
