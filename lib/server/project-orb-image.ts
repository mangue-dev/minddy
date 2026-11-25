import "server-only";

import { crc32, deflateSync } from "node:zlib";
import {
  oklabToRgb,
  projectOrbStyle,
  type ProjectOrbStyle,
} from "@/lib/project-orb-colors";

/**
 * The project orb as a PNG, for surfaces that cannot paint `<ProjectOrb>`:
 * the invitation email (MIN-963). A mail client reads neither `oklch()`, nor
 * `conic-gradient`, nor `filter: blur()`, so the email used to show a flat
 * two-stop gradient that did not look like the app's orb. This module paints
 * the same three layers as `components/project-orb.tsx`, pixel by pixel:
 *
 * 1. a conic gradient twice the size of the patch, centered on it, its stops
 *    interpolated in OKLab like a browser does for `oklch()` stops;
 * 2. a Gaussian blur of `BLUR_CSS_PX`, the component's `blur(4px)`;
 * 3. the glassy radial highlight, composited on top;
 *
 * then clips the patch to a rounded square with antialiased transparent
 * corners, which also gives Outlook (no `border-radius`) a rounded orb.
 *
 * The image is drawn from the seven traits of `projectOrbStyle`, never from the
 * seed: its public URL carries those numbers only, so the project id stays out
 * of mail logs and image proxies (`lib/app-urls.ts` keeps ids out of URLs for
 * the same reason).
 */

/** Display size of the orb in the email, in CSS pixels. */
export const ORB_IMAGE_CSS_SIZE = 56;
/** Corner radius at that size — the ratio of the app's `size-9 rounded-[10px]`. */
export const ORB_IMAGE_CSS_RADIUS = 15;
/** Pixel density: painted at 2x so the orb stays sharp on retina screens. */
const SCALE = 2;
/** The component's `filter: blur(4px)`, in CSS pixels at the display size. */
const BLUR_CSS_PX = 4;

export const ORB_IMAGE_PX = ORB_IMAGE_CSS_SIZE * SCALE;

/** The traits in URL order, with the bounds `projectOrbStyle` draws them in. */
const TRAITS: ReadonlyArray<{ key: keyof ProjectOrbStyle; min: number; max: number }> = [
  { key: "hue", min: 0, max: 360 },
  { key: "hue2", min: 0, max: 360 },
  { key: "chroma", min: 0.1, max: 0.185 },
  { key: "lightness", min: 0.56, max: 0.74 },
  { key: "angle", min: 0, max: 360 },
  { key: "highlightX", min: 22, max: 62 },
  { key: "highlightY", min: 18, max: 46 },
];

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The canonical query value for an orb style: seven numbers, comma-separated. */
export function orbStyleParam(style: ProjectOrbStyle): string {
  return TRAITS.map(({ key }) => String(round3(style[key]))).join(",");
}

/** The image path of a seed's orb, relative to the site origin. */
export function projectOrbImagePath(seed: string): string {
  return `/og/orb?o=${orbStyleParam(projectOrbStyle(seed))}`;
}

/**
 * Read an orb style from a public query value. Anyone can call the route, so
 * every trait is clamped to the range the app draws from: an out-of-range
 * number would paint an orb no project has. Returns `null` when the value is
 * not seven finite numbers.
 */
export function parseOrbStyleParam(raw: string | null): ProjectOrbStyle | null {
  if (!raw) return null;
  const parts = raw.split(",");
  if (parts.length !== TRAITS.length) return null;
  const style = {} as ProjectOrbStyle;
  for (let i = 0; i < TRAITS.length; i++) {
    const part = parts[i].trim();
    const value = part === "" ? Number.NaN : Number(part);
    if (!Number.isFinite(value)) return null;
    const { key, min, max } = TRAITS[i];
    style[key] = round3(Math.min(max, Math.max(min, value)));
  }
  return style;
}

type Lab = [number, number, number];

function oklchToLab(l: number, c: number, hue: number): Lab {
  const rad = (hue * Math.PI) / 180;
  return [l, c * Math.cos(rad), c * Math.sin(rad)];
}

/** Gaussian blur of one channel plane, horizontal then vertical, edges clamped. */
function blurPlane(plane: Float32Array, size: number, sigma: number): Float32Array {
  const radius = Math.ceil(sigma * 3);
  const kernel = new Float32Array(radius * 2 + 1);
  let total = 0;
  for (let i = -radius; i <= radius; i++) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = weight;
    total += weight;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= total;

  const clamp = (value: number) => Math.min(size - 1, Math.max(0, value));
  const horizontal = new Float32Array(plane.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += plane[y * size + clamp(x + k)] * kernel[k + radius];
      }
      horizontal[y * size + x] = sum;
    }
  }
  const out = new Float32Array(plane.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += horizontal[clamp(y + k) * size + x] * kernel[k + radius];
      }
      out[y * size + x] = sum;
    }
  }
  return out;
}

/** Coverage of a pixel by the rounded square, from its signed distance. */
function roundedCoverage(x: number, y: number, size: number, radius: number): number {
  const half = size / 2;
  const qx = Math.abs(x - half) - (half - radius);
  const qy = Math.abs(y - half) - (half - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  const distance = outside + inside - radius;
  return Math.min(1, Math.max(0, 0.5 - distance));
}

/**
 * The orb's pixels: `ORB_IMAGE_PX` squared, RGBA, 8 bits per channel, with the
 * alpha of the rounded corners.
 */
export function renderOrbPixels(style: ProjectOrbStyle): Uint8Array {
  const { hue, hue2, chroma, lightness, angle, highlightX, highlightY } = style;
  const size = ORB_IMAGE_PX;
  const sigma = BLUR_CSS_PX * SCALE;
  // `inset-[-50%]` makes the conic layer twice the patch, centered on it, but
  // the blurred patch only reads the layer up to the kernel's reach around it:
  // painting and blurring that square alone gives the same pixels for half the
  // work.
  const reach = Math.ceil(sigma * 3);
  const area = size + reach * 2;

  const light = lightness + 0.07;
  const deep = lightness - 0.07;
  const soft = Math.max(0.06, chroma - 0.03);
  const vivid = chroma + 0.03;
  const stops: Lab[] = [
    oklchToLab(light, soft, hue),
    oklchToLab(deep, vivid, hue2),
    oklchToLab(light, soft, hue),
    oklchToLab(lightness, chroma, hue2),
    oklchToLab(light, soft, hue),
  ];

  const planes = [0, 1, 2].map(() => new Float32Array(area * area));
  const center = area / 2;
  for (let y = 0; y < area; y++) {
    for (let x = 0; x < area; x++) {
      // CSS conic angles start at the top and turn clockwise.
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const theta = (Math.atan2(dx, -dy) * 180) / Math.PI;
      const turn = ((((theta - angle) % 360) + 360) % 360) / 360;
      const scaled = turn * 4;
      const index = Math.min(3, Math.floor(scaled));
      const t = scaled - index;
      const from = stops[index];
      const to = stops[index + 1];
      const rgb = oklabToRgb(
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      );
      const at = y * area + x;
      planes[0][at] = rgb[0];
      planes[1][at] = rgb[1];
      planes[2][at] = rgb[2];
    }
  }
  const blurred = planes.map((plane) => blurPlane(plane, area, sigma));

  // `radial-gradient(ellipse 70% 50% at X% Y%, oklch(0.95 0.02 hue / 40%) 0%, transparent 70%)`
  const highlight = oklabToRgb(...oklchToLab(0.95, 0.02, hue));
  const rx = size * 0.7;
  const ry = size * 0.5;
  const hx = (size * highlightX) / 100;
  const hy = (size * highlightY) / 100;
  const radius = ORB_IMAGE_CSS_RADIUS * SCALE;

  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const at = (y + reach) * area + (x + reach);
      const distance = Math.hypot((px - hx) / rx, (py - hy) / ry);
      const alpha = distance < 0.7 ? 0.4 * (1 - distance / 0.7) : 0;
      const out = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const base = blurred[channel][at];
        const value = highlight[channel] * alpha + base * (1 - alpha);
        pixels[out + channel] = Math.round(Math.min(1, Math.max(0, value)) * 255);
      }
      pixels[out + 3] = Math.round(roundedCoverage(px, py, size, radius) * 255);
    }
  }
  return pixels;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encode square RGBA pixels as a PNG: no filter, one IDAT, sRGB declared. */
export function encodePng(pixels: Uint8Array, size: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    // Each row starts with its filter type, 0 (none).
    Buffer.from(pixels.buffer, pixels.byteOffset + y * size * 4, size * 4).copy(
      rows,
      y * (size * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("sRGB", Buffer.from([0])),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function renderOrbPng(style: ProjectOrbStyle): Buffer {
  return encodePng(renderOrbPixels(style), ORB_IMAGE_PX);
}
