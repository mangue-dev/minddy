import type { CSSProperties } from "react";
import styles from "./nav-wordmark.module.css";

const WORDMARK_COLORS = ["#cbd9e6", "#ccdccb", "#e7d3c4", "#c9dedd", "#c9dedd", "#dfd9b8"];

export function WordmarkLetters({ text }: { text: string }) {
  return Array.from(text, (letter, index) => (
    <span key={index} className={styles.letter} style={{
      "--letter-color": WORDMARK_COLORS[index % WORDMARK_COLORS.length],
      "--letter-index": index,
    } as CSSProperties}>
      {letter}
    </span>
  ));
}
