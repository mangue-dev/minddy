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
 * Logo couleur d'un modèle IA (MIN-46) déduit de son id OpenRouter
 * `provider/model` via `@lobehub/icons`. Partagé par `ModelBadge` (affichage
 * d'un run) et `ModelCombobox` (picker recherchable). On importe les marques
 * individuellement (le barrel a `sideEffects:false`) pour ne pas tirer
 * `ProviderIcon`/`@lobehub/ui`. Slug provider inconnu → fallback `Cpu`.
 *
 * Une poignée d'éditeurs restent sur ce fallback, et c'est un choix : ils ne
 * publient rien d'utilisable dans 14 pixels (logotypes de deux lignes chez
 * Thinking Machines, avatars personnels chez TheDrummer et Sao10K). Une puce
 * neutre y vaut mieux qu'un raster flou — et mieux qu'un monogramme coloré,
 * essayé puis retiré : il attirait l'œil plus que les vrais logos.
 */

type LobeLogo = { size?: number; className?: string };

/**
 * slug provider (normalisé par providerFromModel) → composant logo.
 *
 * Les clés sont les slugs TELS QU'OPENROUTER LES PUBLIE, une fois passés par les
 * alias de `providerFromModel` (`z-ai` → `zhipu`, `amazon` → `bedrock`…). D'où
 * les tirets conservés sur `aion-labs`, `bytedance-seed`, `arcee-ai`,
 * `ibm-granite` : ces éditeurs n'ont pas d'alias, et c'est bien cette chaîne-là
 * qu'on reçoit.
 *
 * `.Color` quand la marque en publie un, le monochrome sinon — certaines n'ont
 * qu'une version (OpenAI, Grok, Moonshot, et la plupart des petits éditeurs).
 * Un slug absent d'ici retombe sur `Cpu`.
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
  // Meituan ne publie sous ce slug que la famille LongCat, dont c'est le logo.
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
 * Ce slug a-t-il un vrai logo, ou retombera-t-il sur le `Cpu` générique ?
 *
 * Exporté pour les tests : un modèle CONSEILLÉ sans logo est un défaut visible
 * de tous, puisque c'est la liste sur laquelle le picker s'ouvre.
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
