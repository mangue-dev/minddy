import { describe, expect, it } from "vitest";
import {
  orbSeedOr,
  projectOrbBaseColor,
  projectOrbGradient,
  projectOrbSeed,
  projectOrbStyle,
} from "./project-orb-colors";

/**
 * La graine de l'orbe. Ce qui compte ici tient en une phrase : un projet qui n'a
 * jamais relancé son tirage garde la couleur qu'il avait — la colonne est
 * nullable pour ça, et une régression repeindrait tous les projets du jour au
 * lendemain, orbe, pilules de mention et mails d'invitation compris.
 */
describe("projectOrbSeed", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const seed = "22222222-2222-4222-8222-222222222222";

  it("retombe sur l'id tant que le tirage n'a pas été relancé", () => {
    expect(projectOrbSeed({ id, orb_seed: null })).toBe(id);
  });

  it("prend la graine relancée quand il y en a une", () => {
    expect(projectOrbSeed({ id, orb_seed: seed })).toBe(seed);
  });

  it("traite une graine vide comme absente", () => {
    expect(projectOrbSeed({ id, orb_seed: "" })).toBe(id);
  });

  it("dit la même chose que `orbSeedOr`, camelCase compris", () => {
    expect(orbSeedOr(id, seed)).toBe(projectOrbSeed({ id, orb_seed: seed }));
    expect(orbSeedOr(id, undefined)).toBe(id);
  });

  it("change le dessin — l'orbe, la pilule et le mail suivent la graine", () => {
    expect(projectOrbStyle(seed).hue).not.toBe(projectOrbStyle(id).hue);
    expect(projectOrbGradient(seed).base).not.toBe(projectOrbGradient(id).base);
  });
});

/** Des uuid v4 déterministes : un tirage aléatoire rendrait le test instable. */
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

/** Écart de teinte sur la roue, dans [0,180]. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe("projectOrbStyle", () => {
  it("rend toujours le même dessin pour la même graine", () => {
    // Le contrat de base : l'orbe est une IDENTITÉ. Un tirage qui bougerait au
    // rechargement ne serait plus l'icône de personne.
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
      // La bande de clarté qui se lit sur fond clair COMME sur fond sombre, une
      // fois les ±0,07 du dégradé pris en compte.
      expect(s.lightness).toBeGreaterThanOrEqual(0.56);
      expect(s.lightness).toBeLessThanOrEqual(0.74);
    }
  });

  it("tire ses sept traits indépendamment les uns des autres", () => {
    // Le piège que le hachage salé évite : une teinte et une saturation qui
    // montent ensemble redonneraient une seule dimension de variation, donc le
    // problème qu'on vient de corriger. On le mesure par la corrélation de rang
    // entre deux traits — nulle si les sels font leur travail.
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
    // 8,3 % attendus par secteur de 30° ; on laisse une marge large, c'est un
    // garde-fou contre un hachage qui s'effondrerait, pas un test de χ².
    for (const count of buckets) {
      expect(count / n).toBeGreaterThan(0.05);
      expect(count / n).toBeLessThan(0.12);
    }
  });

  it("ne retombe presque jamais sur la même orbe d'une relance à l'autre", () => {
    // LE test de cette passe. La version d'origine ne tirait que la teinte, et
    // l'œil ne sépare pas deux teintes à moins d'une soixantaine de degrés :
    // une relance sur trois (34 % mesurés) rendait quelque chose de très
    // proche. Deux orbes ne comptent ici comme « la même » que si les QUATRE
    // traits qui portent la couleur sont voisins à la fois.
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
    // Mesuré à 3,8 % ; le seuil laisse de la place au bruit sans laisser passer
    // un retour au tirage à une seule dimension.
    expect(close / pairs).toBeLessThan(0.08);
  });
});

describe("projectOrbGradient", () => {
  it("rend trois couleurs sRGB valides, celles de l'orbe", () => {
    // Le mail ne lit pas l'OKLCH : ces trois hexadécimaux SONT l'orbe, pour
    // Outlook comme pour le reste. Un canal hors gamme sortirait `NaN`.
    for (let i = 0; i < 500; i++) {
      const { base, from, to } = projectOrbGradient(uuidFrom(i));
      for (const hex of [base, from, to]) {
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(from).not.toBe(to);
    }
  });
});
