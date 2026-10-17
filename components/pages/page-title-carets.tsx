"use client";

// Collaborators' carets over the page TITLE (MIN-688).
//
// A textarea draws no decorations, so the carets are an overlay: each offset is
// measured in an invisible mirror that copies the field's typography and width,
// which is the only way to know where a WRAPPED title puts a given character.

import { useLayoutEffect, useState, type RefObject } from "react";

import type { TitleCaretView } from "@/lib/use-page-collaboration";

const MIRRORED = [
  "boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight",
  "textTransform", "wordSpacing", "textIndent", "tabSize",
] as const;

interface Placed {
  caret: TitleCaretView;
  left: number;
  top: number;
  height: number;
}

function measure(field: HTMLTextAreaElement, carets: TitleCaretView[]): Placed[] {
  const style = getComputedStyle(field);
  const mirror = document.createElement("div");
  for (const property of MIRRORED) mirror.style[property] = style[property];
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  document.body.append(mirror);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  try {
    return carets.map((caret) => {
      const offset = Math.min(caret.head, field.value.length);
      mirror.textContent = field.value.slice(0, offset);
      const marker = document.createElement("span");
      // A zero-width space keeps the marker on the caret's line, even at the end.
      marker.textContent = "​";
      mirror.append(marker);
      return { caret, left: marker.offsetLeft, top: marker.offsetTop, height: lineHeight };
    });
  } finally {
    mirror.remove();
  }
}

export function PageTitleCarets({
  fieldRef,
  carets,
  value,
}: {
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  carets: TitleCaretView[];
  value: string;
}) {
  const [placed, setPlaced] = useState<Placed[]>([]);
  const signature = JSON.stringify(carets);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field || carets.length === 0) {
      setPlaced([]);
      return;
    }
    const update = () => setPlaced(measure(field, carets));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(field);
    return () => observer.disconnect();
    // `signature` stands for `carets`, a fresh array on every render.
  }, [fieldRef, signature, value]);

  if (placed.length === 0) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {placed.map(({ caret, left, top, height }) => (
        <span
          key={caret.sessionId}
          className="page-collab-caret absolute"
          style={{ left, top, height, "--collab-color": caret.color } as React.CSSProperties}
        >
          <span className="page-collab-caret-label">{caret.name}</span>
        </span>
      ))}
    </div>
  );
}
