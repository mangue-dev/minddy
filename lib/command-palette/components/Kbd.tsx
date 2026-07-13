/**
 * Kbd - Minimal keyboard-key chips used in footers and hints.
 */

import styles from "../styles/Kbd.module.css";

export interface KbdProps {
  keys: string | string[];
  size?: "sm" | "md";
}

export function Kbd({ keys, size = "md" }: KbdProps) {
  const list = Array.isArray(keys) ? keys : [keys];
  return (
    <span className={styles.group}>
      {list.map((key, i) => (
        <kbd key={i} className={`${styles.kbd} ${size === "sm" ? styles.sm : ""}`}>
          {key}
        </kbd>
      ))}
    </span>
  );
}

export default Kbd;
