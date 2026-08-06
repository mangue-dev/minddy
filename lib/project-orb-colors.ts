/**
 * Les couleurs de l'orbe d'un projet — la pastille dégradée qui tient lieu
 * d'icône quand le projet n'a pas importé la sienne (MIN-62).
 *
 * Le hachage vit ICI plutôt que dans `components/project-orb.tsx` parce qu'il a
 * désormais deux lecteurs : le composant, côté client, et l'email d'invitation,
 * côté serveur (MIN-197). Un module « use client » n'exporte vers le serveur que
 * des références client — `projectHue` importée de là lèverait à l'appel. Et
 * recopier le hachage le ferait dériver en silence : le même projet n'aurait
 * plus la même couleur dans le mail et dans l'app.
 */

/**
 * Teinte déterministe dans [0,360) à partir d'une graine (hachage djb2), pour
 * qu'un projet rende toujours le même dégradé. Miroir du `projectHue` d'AutoKap.
 */
export function projectHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

/**
 * OKLCH → hexadécimal sRGB. L'app peint l'orbe en OKLCH, qu'aucun client mail
 * ne lit : on convertit une fois ici pour que le mail montre EXACTEMENT la
 * couleur de l'app, plutôt qu'une approximation écrite à la main qui vieillirait
 * mal. Chemin classique OKLab → LMS → sRGB linéaire → gamma.
 */
export function oklchToHex(l: number, c: number, hue: number): string {
  const rad = (hue * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const channels = [
    4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
  ];

  return `#${channels
    .map((value) => {
      const encoded =
        value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
      const byte = Math.round(Math.min(1, Math.max(0, encoded)) * 255);
      return byte.toString(16).padStart(2, "0");
    })
    .join("")}`;
}

/**
 * L'orbe réduit à ce qu'un client mail sait peindre : un aplat (que tout le
 * monde rend, Outlook compris) et un dégradé linéaire par-dessus (que les
 * autres rendent). Le conique flouté et le reflet du composant n'ont pas
 * d'équivalent là-bas — ces trois couleurs en gardent la teinte et la
 * profondeur.
 */
export function projectOrbGradient(seed: string): {
  base: string;
  from: string;
  to: string;
} {
  const hue = projectHue(seed);
  const hue2 = (hue + 40) % 360;
  return {
    base: oklchToHex(0.65, 0.15, hue),
    from: oklchToHex(0.72, 0.12, hue),
    to: oklchToHex(0.58, 0.18, hue2),
  };
}
