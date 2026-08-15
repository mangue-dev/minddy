// Le nom qu'on donne à un appareil abonné aux notifications push (MIN-183).
//
// Une liste d'appareils ne sert à rien si on ne reconnaît pas le sien : c'est
// exactement le geste qu'on vient y faire (« retirer l'ancien téléphone »).
// L'endpoint, seule identité réelle d'un abonnement, est une URL opaque de 200
// caractères — illisible. D'où ce libellé, dérivé du user-agent.
//
// Il est calculé CÔTÉ SERVEUR, depuis l'en-tête `user-agent` de la requête
// d'abonnement : rien à croire d'un corps de requête, et un seul endroit où la
// règle vit. Fonction pure, donc testable.
//
// Ce n'est PAS de la détection de navigateur au sens fonctionnel : rien ne
// dépend de ce que ça rend. C'est une étiquette lue par un humain, et son repli
// (« Cet appareil ») est un résultat acceptable, pas un échec.

/** L'ordre compte : chaque famille se déclare en se faisant passer pour les
 *  précédentes. Edge dit « Chrome » et « Safari », Chrome dit « Safari ». */
const BROWSERS: readonly { name: string; test: RegExp }[] = [
  { name: "minddy", test: /\bminddy-desktop\//i },
  { name: "Edge", test: /\bEdg(?:e|A|iOS)?\//i },
  { name: "Opera", test: /\bOPR\/|\bOpera\//i },
  { name: "Samsung Internet", test: /\bSamsungBrowser\//i },
  { name: "Firefox", test: /\bFirefox\/|\bFxiOS\//i },
  { name: "Chrome", test: /\bChrome\/|\bCriOS\/|\bChromium\//i },
  { name: "Safari", test: /\bSafari\//i },
];

/** Même piège dans l'autre sens : un Android se présente aussi comme « Linux ». */
const PLATFORMS: readonly { name: string; test: RegExp }[] = [
  { name: "iPhone", test: /\biPhone\b/i },
  { name: "iPad", test: /\biPad\b/i },
  { name: "Android", test: /\bAndroid\b/i },
  { name: "macOS", test: /\bMac OS X\b|\bMacintosh\b/i },
  { name: "Windows", test: /\bWindows\b/i },
  { name: "Linux", test: /\bLinux\b|\bX11\b/i },
];

/** Ce qu'on affiche quand le user-agent ne dit rien d'exploitable. Volontairement
 *  en anglais : la liste des appareils est traduite, mais ce libellé-ci est
 *  STOCKÉ, une fois, et la langue de l'abonnement n'est pas celle de qui le
 *  relira six mois plus tard. La carte le remplace par sa propre traduction. */
export const UNKNOWN_DEVICE_LABEL = "Unknown device";

/**
 * « Chrome sur macOS », « Safari sur iPhone » — ou le repli. La préposition est
 * en français dans les deux langues, comme partout où minddy nomme une chose
 * stockée : c'est une étiquette, pas une phrase d'interface.
 */
export function deviceLabelFromUserAgent(ua: string | null | undefined): string {
  if (!ua || !ua.trim()) return UNKNOWN_DEVICE_LABEL;
  const browser = BROWSERS.find((b) => b.test.test(ua))?.name ?? null;
  const platform = PLATFORMS.find((p) => p.test.test(ua))?.name ?? null;
  if (browser && platform) return `${browser} sur ${platform}`;
  return browser ?? platform ?? UNKNOWN_DEVICE_LABEL;
}

/** Vrai quand le libellé désigne un appareil de poche — la carte y met une
 *  icône de téléphone plutôt qu'un écran. Lit le libellé et non le user-agent :
 *  c'est tout ce qui reste stocké côté client. */
export function isMobileDeviceLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return /\b(iPhone|iPad|Android)\b/i.test(label);
}
