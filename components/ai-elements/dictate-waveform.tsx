"use client";

import { useEffect, useRef } from "react";
// Sous-chemin et pas le baril `mangue-ui` : ce composant est monté par la démo
// publique de la landing, où le baril tirerait framer-motion, cmdk et vaul dans
// le bundle initial (cf. `lib/public-client-messages.ts`, même chasse).
import { cn } from "mangue-ui/lib/utils";

const BAR_COUNT = 16;
const FFT_SIZE = 64;
const MIN_HEIGHT_PX = 4;
const MAX_HEIGHT_PX = 32;

interface DictateWaveformProps {
  stream: MediaStream | null;
  className?: string;
}

export function DictateWaveform({ stream, className }: DictateWaveformProps) {
  const barRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (!stream) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const audioContext = new AudioCtx();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const binsPerBar = Math.max(1, Math.floor(bufferLength / BAR_COUNT));

    let rafId = 0;
    const tick = () => {
      analyser.getByteFrequencyData(dataArray);
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < binsPerBar; j++) {
          sum += dataArray[i * binsPerBar + j] ?? 0;
        }
        const avg = sum / binsPerBar / 255;
        const height = MIN_HEIGHT_PX + avg * (MAX_HEIGHT_PX - MIN_HEIGHT_PX);
        const bar = barRefs.current[i];
        if (bar) bar.style.height = `${height}px`;
      }
      rafId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      audioContext.close().catch(() => {});
    };
  }, [stream]);

  return (
    <div
      className={cn(
        "flex h-9 items-center justify-center gap-[3px]",
        className,
      )}
      aria-hidden
    >
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className="w-[3px] rounded-full bg-brand transition-[height] duration-75 ease-out"
          style={{ height: `${MIN_HEIGHT_PX}px` }}
        />
      ))}
    </div>
  );
}
