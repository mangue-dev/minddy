/**
 * À qui propose-t-on d'installer l'app de bureau ? (MIN-292)
 *
 * Module PUR — pas de React, pas de `navigator` lu en douce : tout ce qui décide
 * entre en paramètre. C'est ce qui permet de tester la règle, y compris ses cas
 * pénibles (l'iPad qui se déclare « MacIntel »), sans monter un DOM.
 *
 * **Trois conditions, et chacune retire une population qu'on ferait fuir :**
 *
 * 1. **Pas dans l'app de bureau.** Proposer de l'installer à quelqu'un qui l'a
 *    ouverte est la définition du bruit.
 * 2. **Sur un Mac.** Il n'existe pas de version Windows ni Linux ; le proposer
 *    ailleurs, c'est promettre ce qu'on n'a pas.
 * 3. **Pas déjà écarté.** L'utilisateur a dit non une fois, et « une fois »
 *    veut dire pour toujours.
 */

/**
 * Le drapeau vit dans `user_metadata`, comme les autres petites préférences du
 * compte (`prompt_copy_auto_start`, `numo_default_status`) — et NON dans le
 * `localStorage`.
 *
 * C'est ce que veut dire « plus jamais montré » : un stockage local le
 * ramènerait au premier navigateur privé, au premier nettoyage de cache, et sur
 * la deuxième machine. Refuser une proposition est une décision de la personne,
 * pas de son navigateur.
 */
export const DESKTOP_PROMPT_DISMISSED_META_KEY = "desktop_prompt_dismissed";

/** A-t-on déjà écarté la proposition ? Faux par défaut. */
export function resolveDesktopPromptDismissed(
  meta: Record<string, unknown> | null | undefined
): boolean {
  return meta?.[DESKTOP_PROMPT_DISMISSED_META_KEY] === true;
}

/** Ce qu'on lit du navigateur, et rien de plus. */
export interface PlatformProbe {
  /** `navigator.userAgentData?.platform` — le seul champ non déprécié. */
  uaDataPlatform?: string | null;
  /** `navigator.platform` — déprécié, mais c'est le repli de Safari. */
  platform?: string | null;
  userAgent?: string | null;
  /** `navigator.maxTouchPoints` — voir le piège de l'iPad ci-dessous. */
  maxTouchPoints?: number | null;
}

/**
 * Est-ce un Mac ?
 *
 * ⚠ **L'iPad ment.** Depuis iPadOS 13, en mode « site pour ordinateur » (le
 * défaut), il annonce `MacIntel` et un user agent de Macintosh : à s'en tenir
 * là, on proposerait un `.dmg` à une tablette. Le seul signe qui les sépare est
 * le TACTILE — un Mac rend `maxTouchPoints` à 0, un iPad à 5. C'est le test que
 * fait Apple elle-même dans sa documentation, faute de mieux.
 */
export function isMacPlatform(probe: PlatformProbe): boolean {
  const { uaDataPlatform, platform, userAgent, maxTouchPoints } = probe;

  // Un Mac tactile n'existe pas : au-delà d'un point de contact, c'est un iPad
  // déguisé. On coupe avant de regarder quoi que ce soit d'autre.
  if ((maxTouchPoints ?? 0) > 1) return false;

  if (uaDataPlatform) return uaDataPlatform === "macOS";
  if (platform) return /^Mac/i.test(platform);
  return /Mac OS X|Macintosh/i.test(userAgent ?? "");
}

/** Faut-il proposer l'app de bureau ? */
export function shouldOfferDesktopApp(input: {
  /** Tourne-t-on DÉJÀ dans l'app ? (présence du pont, cf. bridge.ts) */
  inDesktopApp: boolean;
  isMac: boolean;
  dismissed: boolean;
}): boolean {
  return !input.inDesktopApp && input.isMac && !input.dismissed;
}
