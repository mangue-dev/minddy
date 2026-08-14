/**
 * Les couleurs de l'orbe d'un projet — la pastille dégradée qui tient lieu
 * d'icône quand le projet n'a pas importé la sienne (MIN-62).
 *
 * Le hachage vit ICI plutôt que dans `components/project-orb.tsx` parce qu'il a
 * désormais deux lecteurs : le composant, côté client, et l'email d'invitation,
 * côté serveur (MIN-197). Un module « use client » n'exporte vers le serveur que
 * des références client — `projectOrbStyle` importée de là lèverait à l'appel. Et
 * recopier le hachage le ferait dériver en silence : le même projet n'aurait
 * plus la même couleur dans le mail et dans l'app.
 */

/**
 * La graine de l'orbe d'un projet.
 *
 * `orb_seed` ne porte une valeur que si le tirage a été RELANCÉ au moins une
 * fois ; sinon la graine reste l'identifiant du projet, comme depuis MIN-62.
 * C'est ce qui permet d'ajouter la relance sans repeindre les projets
 * existants — et ce qui rend ce petit résolveur obligatoire partout où une
 * orbe se dessine : passer `project.id` en direct, c'est ignorer une relance.
 */
export function projectOrbSeed(project: {
  id: string;
  orb_seed: string | null;
}): string {
  return orbSeedOr(project.id, project.orb_seed);
}

/**
 * La même règle, pour les surfaces qui ne portent pas la ligne de la base : le
 * board public et les pilules de mention transportent un projet en camelCase,
 * l'agent une projection réduite. Elles appellent ici plutôt que de recopier le
 * `??` — qui dériverait le jour où la règle changerait.
 */
export function orbSeedOr(id: string, seed: string | null | undefined): string {
  return seed || id;
}

/**
 * Hachage 32 bits d'une graine, SALÉ — la même graine et deux sels différents
 * donnent deux valeurs sans rapport l'une avec l'autre.
 *
 * C'est ce qui permet de tirer plusieurs traits indépendants d'une seule graine.
 * Le djb2 d'avant n'en donnait qu'un (`hash % 360`), et il ne se resalait pas :
 * ses bits de poids faible portaient déjà toute l'information, en tirer une
 * seconde valeur aurait donné une teinte et une saturation corrélées.
 *
 * FNV-1a, puis l'avalanche finale de murmur3 : sans elle, deux uuid ne différant
 * que par leurs derniers caractères sortent voisins, ce qui est exactement le
 * cas d'usage ici (des graines tirées à la suite).
 */
function hash32(seed: string, salt: number): number {
  let h = (2166136261 ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Un réel de `[min, max)` tiré de la graine sur le sel donné.
 *
 * Arrondi à trois décimales : ces valeurs partent dans des `style` en ligne, et
 * un flottant complet y écrirait dix-sept chiffres pour une teinte qu'aucun œil
 * ne distingue au millième. Trois décimales laissent bien plus de nuances que
 * l'écran n'en rend.
 */
function pick(seed: string, salt: number, min: number, max: number): number {
  const value = min + (hash32(seed, salt) / 4294967296) * (max - min);
  return Math.round(value * 1000) / 1000;
}

/**
 * Le dessin complet d'une orbe, tiré de sa graine.
 *
 * **Sept traits, pas un.** La version d'origine ne tirait que la TEINTE : tout
 * le reste — saturation, clarté, écart entre les deux teintes, orientation du
 * conique, place du reflet — était écrit en dur. Deux orbes ne se distinguaient
 * donc que par leur position sur la roue, et l'œil ne sépare pas deux teintes à
 * moins d'une soixantaine de degrés : une relance sur trois retombait sur
 * quelque chose de très proche. En faisant varier les sept, deux tirages
 * voisins en teinte restent séparés par leur profondeur, leur orientation ou
 * leur éclat.
 *
 * Les bornes sont resserrées exprès. La clarté reste dans une bande qui se lit
 * sur fond clair COMME sur fond sombre, et la saturation ne descend pas là où
 * l'orbe virerait au gris — c'est une pastille de 14 à 20 px, pas une image.
 */
export interface ProjectOrbStyle {
  /** Teinte de base, [0,360). */
  hue: number;
  /** Seconde teinte du dégradé — de l'analogue au presque complémentaire. */
  hue2: number;
  /** Saturation OKLCH de l'aplat. */
  chroma: number;
  /** Clarté OKLCH de l'aplat. */
  lightness: number;
  /** Orientation du dégradé conique, en degrés. */
  angle: number;
  /** Centre du reflet, en pourcentage de la pastille. */
  highlightX: number;
  highlightY: number;
}

export function projectOrbStyle(seed: string): ProjectOrbStyle {
  const hue = pick(seed, 1, 0, 360);
  // L'écart signé entre les deux teintes : au-delà de ~30° il se voit, au-delà
  // de ~170° les deux se croisent de l'autre côté de la roue et l'écart
  // rétrécit à nouveau.
  const spread =
    pick(seed, 2, 30, 170) * (hash32(seed, 3) % 2 === 0 ? 1 : -1);
  return {
    hue,
    hue2: ((hue + spread) % 360 + 360) % 360,
    chroma: pick(seed, 4, 0.1, 0.185),
    lightness: pick(seed, 5, 0.56, 0.74),
    angle: pick(seed, 6, 0, 360),
    highlightX: pick(seed, 7, 22, 62),
    highlightY: pick(seed, 8, 18, 46),
  };
}

/**
 * La couleur d'aplat de l'orbe, en OKLCH — ce qu'on peint quand on veut LA
 * couleur du projet sans son dégradé : le fond d'une pilule de mention.
 */
export function projectOrbBaseColor(seed: string): string {
  const { lightness, chroma, hue } = projectOrbStyle(seed);
  return `oklch(${lightness} ${chroma} ${hue})`;
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
  const { hue, hue2, chroma, lightness } = projectOrbStyle(seed);
  return {
    base: oklchToHex(lightness, chroma, hue),
    from: oklchToHex(lightness + 0.07, Math.max(0.06, chroma - 0.03), hue),
    to: oklchToHex(lightness - 0.07, chroma + 0.03, hue2),
  };
}
