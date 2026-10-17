import { describe, expect, it } from "vitest";
import { dequantizeVector, isCompactVector, quantizeVector } from "./issue-vector-format";

describe("compact issue vector format", () => {
  it("round-trips within one quantization step and keeps cosine ranking", () => {
    const v = Array.from({ length: 1536 }, (_, i) => Math.cos(i * 0.7) * 0.05);
    const back = dequantizeVector(quantizeVector(v));
    expect(back).toHaveLength(1536);
    const step = 0.05 / 127;
    expect(Math.max(...back.map((x, i) => Math.abs(x - v[i])))).toBeLessThanOrEqual(step / 2 + 1e-12);
    const cos = (a: number[], b: number[]) => {
      let d = 0, aa = 0, bb = 0;
      for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
      return d / Math.sqrt(aa * bb);
    };
    expect(cos(v, back)).toBeGreaterThan(0.9999);
  });

  it("encodes a zero vector without dividing by zero", () => {
    expect(dequantizeVector(quantizeVector([0, 0, 0]))).toEqual([0, 0, 0]);
  });

  it("recognizes only well-formed compact values", () => {
    expect(isCompactVector(quantizeVector([0.1, -0.2]))).toBe(true);
    expect(isCompactVector([0.1, 0.2])).toBe(false);
    expect(isCompactVector({ f: "i8", s: -1, d: "" })).toBe(false);
  });
});
