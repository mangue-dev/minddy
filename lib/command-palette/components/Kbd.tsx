/**
 * Kbd - Minimal keyboard-key chips used in footers and hints.
 */

import { Kbd as AppKbd } from "@/components/ui/kbd";
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
        <AppKbd key={i} size={size === "sm" ? "sm" : "default"}>
          {key}
        </AppKbd>
      ))}
    </span>
  );
}

export default Kbd;
