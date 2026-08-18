import { describe, expect, it } from "vitest";
import {
  orbSeedOr,
  projectOrbBaseColor,
  projectOrbGradient,
  projectOrbSeed,
  projectOrbStyle,
} from "./project-orb-colors";

/**
 * The orb seed preserves a project's color between rerolls. The nullable column
 * prevents a regression from repainting existing orbs, mention pills, and invitation emails.
 */
describe("projectOrbSeed", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const seed = "22222222-2222-4222-8222-222222222222";

  it("falls back to the id until the draw has been restarted", () => {
    expect(projectOrbSeed({ id, orb_seed: null })).toBe(id);
  });

  it("takes the restarted seed when there is one", () => {
    expect(projectOrbSeed({ id, orb_seed: seed })).toBe(seed);
  });

  it("treats an empty seed as absent", () => {
    expect(projectOrbSeed({ id, orb_seed: "" })).toBe(id);
  });

  it("says the same thing as `orbSeedOr`, including camelCase", () => {
    expect(orbSeedOr(id, seed)).toBe(projectOrbSeed({ id, orb_seed: seed }));
    expect(orbSeedOr(id, undefined)).toBe(id);
  });

  it("changes the design — the orb, pill and mail follow the seed", () => {
    expect(projectOrbStyle(seed).hue).not.toBe(projectOrbStyle(id).hue);
    expect(projectOrbGradient(seed).base).not.toBe(projectOrbGradient(id).base);
  });
});

/** Deterministic v4 uuids: a random draw would make the test unstable. */
function uuidFrom(n: number): string {
  const chunk = (x: number) => {
    let v = x >>> 0;
    v ^= v >>> 16;
    v = Math.imul(v, 2246822507);
    v ^= v >>> 13;
    v = Math.imul(v, 3266489909);
    v ^= v >>> 16;
    return (v >>> 0).toString(16).padStart(8, "0");
  };
  return [
    chunk(n),
    chunk(n + 7919).slice(0, 4),
    `4${chunk(n + 104729).slice(0, 3)}`,
    `8${chunk(n + 1299709).slice(0, 3)}`,
    `${chunk(n + 15485863)}${chunk(n + 32452843).slice(0, 4)}`,
  ].join("-");
}

/** Hue difference on the wheel, in [0.180]. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe("projectOrbStyle", () => {
  it("rend toujours le même dessin pour la même graine", () => {
    // The basic contract: the orb is an IDENTITY. A draw that would move
    // reloading would no longer be anyone's icon.
    const seed = uuidFrom(42);
    expect(projectOrbStyle(seed)).toEqual(projectOrbStyle(seed));
    expect(projectOrbBaseColor(seed)).toBe(projectOrbBaseColor(seed));
  });

  it("tient ses bornes — une orbe grise ou délavée n'est pas une icône", () => {
    for (let i = 0; i < 2000; i++) {
      const s = projectOrbStyle(uuidFrom(i));
      expect(s.hue).toBeGreaterThanOrEqual(0);
      expect(s.hue).toBeLessThan(360);
      expect(s.hue2).toBeGreaterThanOrEqual(0);
      expect(s.hue2).toBeLessThan(360);
      expect(s.chroma).toBeGreaterThanOrEqual(0.1);
      expect(s.chroma).toBeLessThanOrEqual(0.185);
      // The clarity band which can be read on a light background AS on a dark background, a
      // times the ±0.07 of the gradient taken into account.
      expect(s.lightness).toBeGreaterThanOrEqual(0.56);
      expect(s.lightness).toBeLessThanOrEqual(0.74);
    }
  });

  it("tire ses sept traits indépendamment les uns des autres", () => {
    // The pitfall that salty hashing avoids: a hue and saturation that
    // go up together would give back a single dimension of variation, so the
    // problem that we have just corrected. It is measured by the rank correlation
    // between two lines — zero if the salts are doing their job.
    const n = 2000;
    const styles = Array.from({ length: n }, (_, i) => projectOrbStyle(uuidFrom(i)));
    const rank = (values: number[]) => {
      const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
      const out = new Array<number>(values.length);
      order.forEach(([, i], r) => (out[i] = r));
      return out;
    };
    const spearman = (a: number[], b: number[]) => {
      const [ra, rb] = [rank(a), rank(b)];
      const d = ra.reduce((sum, v, i) => sum + (v - rb[i]) ** 2, 0);
      return 1 - (6 * d) / (n * (n * n - 1));
    };
    const hue = styles.map((s) => s.hue);
    for (const trait of [
      styles.map((s) => s.chroma),
      styles.map((s) => s.lightness),
      styles.map((s) => s.angle),
    ]) {
      expect(Math.abs(spearman(hue, trait))).toBeLessThan(0.1);
    }
  });

  it("couvre la roue sans favoriser de secteur", () => {
    const buckets = new Array(12).fill(0);
    const n = 3000;
    for (let i = 0; i < n; i++) {
      buckets[Math.floor(projectOrbStyle(uuidFrom(i)).hue / 30)]++;
    }
    // 8.3% expected per 30° sector; we leave a wide margin, it is a
    // garde-fou contre un hachage qui s'effondrerait, pas un test de χ².
    for (const count of buckets) {
      expect(count / n).toBeGreaterThan(0.05);
      expect(count / n).toBeLessThan(0.12);
    }
  });

  it("ne retombe presque jamais sur la même orbe d'une relance à l'autre", () => {
    // THE test of this pass. The original version only pulled the tint, and
    // the eye does not separate two shades at less than sixty degrees:
    // one raise in three (34% measured) made something very
    // close. Two orbs only count as "the same" here if all FOUR
    // traits that carry color are neighbors at the same time.
    const pairs = 3000;
    let close = 0;
    for (let i = 0; i < pairs; i++) {
      const a = projectOrbStyle(uuidFrom(i * 2));
      const b = projectOrbStyle(uuidFrom(i * 2 + 1));
      if (
        hueGap(a.hue, b.hue) < 60 &&
        hueGap(a.hue2, b.hue2) < 60 &&
        Math.abs(a.chroma - b.chroma) < 0.035 &&
        Math.abs(a.lightness - b.lightness) < 0.06
      ) {
        close++;
      }
    }
    // Measured at 3.8%; the threshold leaves room for noise without letting it pass
    // a return to single-dimensional printing.
    expect(close / pairs).toBeLessThan(0.08);
  });
});

describe("projectOrbGradient", () => {
  it("rend trois couleurs sRGB valides, celles de l'orbe", () => {
    // The email does not read the OKLCH: these three hexadecimals ARE the orb, for
    // Outlook as for the rest. An out-of-range channel would output `NaN`.
    for (let i = 0; i < 500; i++) {
      const { base, from, to } = projectOrbGradient(uuidFrom(i));
      for (const hex of [base, from, to]) {
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(from).not.toBe(to);
    }
  });
});
