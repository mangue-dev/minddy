"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DictateWaveform } from "./dictate-waveform";

/**
 * The voice-reactive wave in the middle of the dictation pill (MIN-773).
 *
 * A Siri-style chromatic wave drawn by one fragment shader on a raw WebGL
 * canvas (ported from the 21st.dev `siri-wave` component). The original drives
 * its low/mid/high bands with sine clocks; here they come from the microphone,
 * so the wave lies flat in silence and swells with the voice. While the take is
 * transcribed (`busy`) it stops listening and rolls a fixed, repeating wave.
 *
 * The canvas is transparent (alpha follows the glow), so the pill keeps the
 * app's theme. The four chromatic lines are built around the accent colour
 * (the palette's primary, or minddy's brand blue when the primary is a plain
 * ink) with the colour scheme of the brand blue, replayed in OKLCH (see
 * WAVE_LINES). The glow's core stays a light tint of that accent.
 *
 * Without WebGL — old GPUs, jsdom — the classic bars take its place.
 */

const VERTEX_SHADER = "attribute vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); }";

const WAVE_SHADER = `precision highp float;
uniform vec2 iResolution; uniform float iTime;
uniform float uLow; uniform float uMid; uniform float uHigh; uniform float uLevel;
uniform float uFreq; uniform vec3 uInk; uniform vec3 uHues[4];
const float PI = 3.14159265359;
const float FREQ        = 1.1;
const float ABER_FREQ   = 1.0;
const float SPEED       = 2.4;
const float WAVE_SCALE  = 0.75;
const float ABERRATION  = 2.6;
const float THICKNESS   = 3.0;
const float INTENSITY   = 2.0;
const float FALLOFF     = 1.1;
const float EDGE_MASK   = 0.4;
const float EDGE_FADE_START = 0.45;
const float BAND_FILL   = 30000.0;
const float BAND_THICK  = 0.08;
const float SOFTNESS    = 2.5;
const float LOW_INT     = 1.5;
const float MID_ABER    = 0.8;
const float MID_ABAMP   = 0.05;
const float MID_SOFT    = 0.4;
const float HIGH_ABER   = 0.5;
const float HIGH_ABAMP  = 0.06;


void main(){
  vec2 R = iResolution.xy;
  float aspect = R.x / R.y;
  vec2 p = (gl_FragCoord.xy + 0.5) * 2.0 / R - 1.0;
  p.x *= aspect;
  float yScreen = p.y;
  p /= WAVE_SCALE;

  float drift = mod(iTime, 20.0*PI) * SPEED;
  float xN  = p.x / max(aspect, 1.0);
  float env = cos(PI*0.5 * min(abs(0.9*xN), 1.0));
  env *= env;

  // Flat in silence, full swing on a loud voice.
  float A1    = mix(0.035, 0.95, uLevel) + 0.06*uLow;
  float A2    = A1 + uMid*MID_ABAMP + uHigh*HIGH_ABAMP;
  float AB    = ABERRATION + uMid*MID_ABER + uHigh*HIGH_ABER;
  float th    = 0.01*THICKNESS;
  float inten = 0.01*(INTENSITY + uLow*LOW_INT);
  float soft  = 0.01*max(0.0, SOFTNESS + uMid*MID_SOFT);

  float yMain = A1 * env * sin(p.x*FREQ*uFreq + drift);
  float bandAmt = 1e-4 * BAND_FILL * inten;
  vec3 num = vec3(0.0), den = vec3(0.0);
  for(int s = 0; s < 4; s++){
    vec3 hue = s == 0 ? uHues[0] : s == 1 ? uHues[1] : s == 2 ? uHues[2] : uHues[3];
    // Normalise by brightness, not per channel: a per-channel sum turns any
    // set of neighbouring hues back to white (the original's spectrum).
    den += vec3(max(max(hue.r, hue.g), hue.b));
    float ab = mix(-AB, AB, float(s)/3.0);
    float yL = A2 * env * sin(p.x*ABER_FREQ*uFreq + drift + ab);
    float d = abs(p.y - yL);
    float line = inten / (sqrt(d*d + soft*soft) + th);
    float lo = min(yMain, yL), hi = max(yMain, yL);
    float dBand = max(0.0, max(p.y - hi, lo - p.y));
    float band = bandAmt / (dBand + BAND_THICK);
    num += hue * (line + band);
  }
  vec3 col = num / den;
  float dM = abs(p.y - yMain);
  col += 0.5 * inten / (sqrt(dM*dM + soft*soft) + th);

  col = pow(max(col, 0.0), vec3(1.5));
  float emT = clamp((abs(yScreen) - 1.0) / (-EDGE_MASK), 0.0, 1.0);
  float em  = emT*emT*(3.0 - 2.0*emT);
  col *= em * exp(-pow(xN*FALLOFF, 2.0));
  // Fade to nothing before the canvas ends, glow included, so the wave
  // dissolves towards the buttons instead of being cut at the edge.
  float xScreen = abs(gl_FragCoord.x / R.x * 2.0 - 1.0);
  col *= 1.0 - smoothstep(EDGE_FADE_START, 1.0, xScreen);
  col = min(col, 1.0);
  // Premultiplied: the glow is its own alpha, the ground shows through. Its
  // white part (the share every channel has) takes the ink colour instead.
  float a = max(max(col.r, col.g), col.b);
  vec3 n = a > 0.0 ? col / a : vec3(0.0);
  float w = min(min(n.r, n.g), n.b);
  gl_FragColor = vec4(((n - w) + w * uInk) * a, a);
}`;

// Analyser bins at fftSize 256 (≈ 187 Hz each at 48 kHz): voice fundamentals,
// the formants, then sibilants.
const FFT_SIZE = 256;
const BANDS = { low: [1, 3], mid: [3, 12], high: [12, 40] } as const;
const ATTACK = 0.45;
const RELEASE = 0.08;
// While transcribing: a steady swing and a tighter, repeating wave.
const BUSY = { low: 0.35, mid: 0.3, high: 0.15, level: 0.6, freq: 1.8 } as const;
// How often the colours are re-read, in frames: they change only with the theme.
const COLOR_REFRESH_FRAMES = 30;
// The wave's colour scheme, measured on minddy's brand blue (where it reads
// best) and replayed around any accent in OKLCH: each line keeps the blue
// scheme's lightness and chroma at the same hue offset from the accent, so
// every palette gets the same balance — one pale line, one deep, two between.
// Chroma only drops where a hue cannot reach it on screen.
const WAVE_LINES = [
  { hueOffset: -78, lightness: 0.86, chroma: 0.14 },
  { hueOffset: -15, lightness: 0.69, chroma: 0.17 },
  { hueOffset: 4, lightness: 0.49, chroma: 0.29 },
  { hueOffset: 39, lightness: 0.57, chroma: 0.23 },
] as const;
// The glow's core: a near-white tint of the accent.
const WAVE_CORE = { lightness: 0.93, chroma: 0.035 } as const;
// Below this chroma the primary is an ink (black, white, grey), not an accent:
// the brand colour stands in for it.
const MIN_ACCENT_CHROMA = 0.05;

function bandEnergy(data: Uint8Array, [from, to]: readonly [number, number]): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += data[i] ?? 0;
  return Math.min(1, (sum / (to - from) / 255) * 1.6);
}

function follow(current: number, target: number): number {
  return current + (target - current) * (target > current ? ATTACK : RELEASE);
}

type Rgb = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB (0–1) → OKLCH as [lightness, chroma, hue in degrees]. */
function rgbToOklch(rgb: Rgb): Rgb {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

/** OKLCH → sRGB (0–1), or null when outside the sRGB gamut. */
function oklchToRgb(L: number, C: number, h: number): Rgb | null {
  const A = C * Math.cos((h * Math.PI) / 180);
  const B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  if (linear.some((c) => c < -1e-4 || c > 1 + 1e-4)) return null;
  return linear.map((c) => toGamma(Math.min(1, Math.max(0, c)))) as Rgb;
}

/** The colour at this lightness and hue, its chroma lowered until it fits sRGB. */
function inGamut(L: number, C: number, h: number): Rgb {
  const exact = oklchToRgb(L, C, h);
  if (exact) return exact;
  let low = 0;
  let high = C;
  let best = oklchToRgb(L, 0, h) ?? [L, L, L];
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) / 2;
    const rgb = oklchToRgb(L, mid, h);
    if (rgb) {
      best = rgb;
      low = mid;
    } else high = mid;
  }
  return best;
}

/** The wave's colours from the current theme: four lines and the core. */
function waveColors(): { hues: Float32Array; core: Rgb } {
  const styles = getComputedStyle(document.documentElement);
  let accent = rgbToOklch(cssColorToRgb(styles.getPropertyValue("--primary")));
  if (accent[1] < MIN_ACCENT_CHROMA) {
    accent = rgbToOklch(cssColorToRgb(styles.getPropertyValue("--brand")));
  }
  const hue = accent[2];
  const hues = new Float32Array(WAVE_LINES.length * 3);
  WAVE_LINES.forEach(({ hueOffset, lightness, chroma }, i) => {
    hues.set(inGamut(lightness, chroma, (hue + hueOffset + 360) % 360), i * 3);
  });
  return { hues, core: inGamut(WAVE_CORE.lightness, WAVE_CORE.chroma, hue) };
}

/** A CSS colour (oklch included) as linear 0–1 RGB, through a 1×1 canvas. */
function cssColorToRgb(color: string): Rgb {
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe) return [1, 1, 1];
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

interface DictationWaveProps {
  /** The live microphone; `null` while not listening. */
  stream: MediaStream | null;
  /** The take is being transcribed: a fixed, repeating wave. */
  busy?: boolean;
  className?: string;
}

export function DictationWave({ stream, busy = false, className }: DictationWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(
    () => typeof window !== "undefined" && typeof WebGLRenderingContext === "undefined",
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || fallback) return;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) {
      setFallback(true);
      return;
    }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn("[DictationWave] shader compile failed", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, WAVE_SHADER);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      setFallback(true);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const uResolution = uniform("iResolution");
    const uTime = uniform("iTime");
    const uLow = uniform("uLow");
    const uMid = uniform("uMid");
    const uHigh = uniform("uHigh");
    const uLevel = uniform("uLevel");
    const uFreq = uniform("uFreq");
    const uInk = uniform("uInk");
    const uHues = uniform("uHues");

    // Match the drawing buffer to the laid-out size (capped at 2× density).
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    };
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(canvas);

    // The microphone's energy, read from its own analyser.
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    if (stream) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.6;
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        void audioContext.resume().catch(() => {});
      }
    }
    const frequencies = new Uint8Array(analyser?.frequencyBinCount ?? 0);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let low = 0;
    let mid = 0;
    let high = 0;
    let level = 0;
    const freq = busy ? BUSY.freq : 1;
    let colors = waveColors();
    let frames = 0;
    const startedAt = performance.now();
    let raf = 0;
    const frame = () => {
      const seconds = (performance.now() - startedAt) / 1000;
      if (frames++ % COLOR_REFRESH_FRAMES === 0) colors = waveColors();
      if (busy) {
        low = follow(low, BUSY.low);
        mid = follow(mid, BUSY.mid);
        high = follow(high, BUSY.high);
        level = follow(level, BUSY.level);
      } else if (analyser) {
        analyser.getByteFrequencyData(frequencies);
        low = follow(low, bandEnergy(frequencies, BANDS.low));
        mid = follow(mid, bandEnergy(frequencies, BANDS.mid));
        high = follow(high, bandEnergy(frequencies, BANDS.high));
        level = follow(level, Math.min(1, (low * 0.5 + mid * 0.35 + high * 0.15) * 1.5));
      } else {
        low = follow(low, 0);
        mid = follow(mid, 0);
        high = follow(high, 0);
        level = follow(level, 0);
      }
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      // Reduced motion: the wave still answers the voice, but no longer drifts.
      gl.uniform1f(uTime, reducedMotion ? 0 : seconds);
      gl.uniform1f(uLow, low);
      gl.uniform1f(uMid, mid);
      gl.uniform1f(uHigh, high);
      gl.uniform1f(uLevel, level);
      gl.uniform1f(uFreq, freq);
      gl.uniform3f(uInk, ...colors.core);
      gl.uniform3fv(uHues, colors.hues);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      source?.disconnect();
      audioContext?.close().catch(() => {});
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, [stream, busy, fallback]);

  if (fallback) return <DictateWaveform stream={stream} className={className} barClassName="bg-foreground" />;
  return <canvas ref={canvasRef} aria-hidden className={cn("block h-10 w-full", className)} />;
}
