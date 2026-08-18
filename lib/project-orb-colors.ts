/**
 * The colors of a project's orb — the gradient patch that takes the place of
 * the icon when the project has not imported its own (MIN-62).
 *
 * The hash lives HERE rather than in `components/project-orb.tsx` because it a
 * now two readers: the component, client side, and the invitation email,
 * server side (MIN-197). A “use client” module only exports to the server
 * client references — `projectOrbStyle` imported from there would raise when called. And
 * copying the hash would cause it to drift silently: the same project would no longer have
 * the same color in the email and in the app.
 */

/**
 * The seed of a project's orb.
 *
 * `orb_seed` only carries a value if the draw has been RUNLED at least once
 * times; otherwise the seed remains the project identifier, as since MIN-62.
 * This is what allows you to add the restart without repainting the existing
 * projects — and what makes this little resolver mandatory wherever an
 * orb appears: passing `project.id` directly means ignoring an restart.
 */
export function projectOrbSeed(project: {
  id: string;
  orb_seed: string | null;
}): string {
  return orbSeedOr(project.id, project.orb_seed);
}

/**
 * The same rule, for surfaces that do not carry the baseline: the
 * public board and the mention pills carry a project in camelCase,
 * the agent a reduced projection. They call here rather than copying the
 * `??` — which would be the day the rule changes.
 */
export function orbSeedOr(id: string, seed: string | null | undefined): string {
  return seed || id;
}

/**
 * 32-bit hash of a seed, SALTED — the same seed and two different salts
 * give two unrelated values.
 *
 * This is what allows multiple independent traits to be drawn from a single seed.
 * The djb2 before only gave one (`hash % 360`), and it didn't resalt:
 * its least significant bits already carried all the information, getting a
 * second value would have given a correlated hue and saturation.
 *
 * FNV-1a, then the final avalanche of murmur3: without it, two uuids differing
 * only by their last characters come out neighbors, which is exactly the
 * use case here (seeds drawn in succession).
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
 * A real number of `[min, max)` taken from the seed on the given salt.
 *
 * Rounded to three decimal places: these values go into online `style`, and
 * a full float would write seventeen digits there for a hue that none eye
 * does not distinguish to the thousandth. Three decimal places leave many more nuances than
 * the screen renders.
 */
function pick(seed: string, salt: number, min: number, max: number): number {
  const value = min + (hash32(seed, salt) / 4294967296) * (max - min);
  return Math.round(value * 1000) / 1000;
}

/**
 * The complete drawing of an orb, taken from its seed.
 *
 * **Seven strokes, not one.** The original version only drew the HUE: all
 * the rest — saturation, clarity, distance between the two hues, orientation of the
 * conical, square of the reflection — was written in hard. Two orbs were only distinguished
 * by their position on the wheel, and the eye does not separate two hues at
 * less than sixty degrees: one raise in three fell on
 * something very close. By varying the seven, two prints
 * neighbors in hue remain separated by their depth, their orientation or
 * their brightness.
 *
 * The terminals are tightened on purpose. Clarity stays in a band that reads
 * on a light background AS well as a dark background, and the saturation doesn't go down where
 * the orb would turn gray — it's a 14-20 px patch, not an image.
 */
export interface ProjectOrbStyle {
  /** Teinte de base, [0,360). */
  hue: number;
  /** Second shade of the gradient — from analogous to almost complementary. */
  hue2: number;
  /** Saturation OKLCH de l'aplat. */
  chroma: number;
  /** OKLCH clarity of the solid color. */
  lightness: number;
  /** Orientation of the conical gradient, in degrees. */
  angle: number;
  /** Center of reflection, as a percentage of the patch. */
  highlightX: number;
  highlightY: number;
}

export function projectOrbStyle(seed: string): ProjectOrbStyle {
  const hue = pick(seed, 1, 0, 360);
  // The difference between the two shades: beyond ~30° it is visible, beyond
  // by ~170° the two intersect on the other side of the wheel and the gap
  // shrinks again.
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
 * The solid color of the orb, in OKLCH — what we paint when we want LA
 * color of the project without its gradient: the background of a mention pill.
 */
export function projectOrbBaseColor(seed: string): string {
  const { lightness, chroma, hue } = projectOrbStyle(seed);
  return `oklch(${lightness} ${chroma} ${hue})`;
}

/**
 * OKLCH → hexadecimal sRGB. The app paints the orb in OKLCH, which no mail
 * client reads: we convert once here so that the email shows EXACTLY the
 * color of the app, rather than a hand-written approximation which would age
 * poorly. Classic path OKLab → LMS → linear sRGB → gamma.
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
 * The orb is reduced to what an email client can paint: a solid color (that everyone renders, Outlook included) and a linear gradient on top (that the others render). The blurred conic and the reflection of the component have no equivalent there — these three colors keep the hue and the
 * depth.
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
