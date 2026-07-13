"use client";

import { forwardRef, useEffect, useRef, useCallback } from "react";
import styles from "../styles/InlineActionInput.module.css";

export interface InlineTextInputProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  autoFocus?: boolean;
}

export const InlineTextInput = forwardRef<HTMLTextAreaElement, InlineTextInputProps>(
  function InlineTextInput(
    { value, placeholder, onChange, onFocus, onBlur, onKeyDown, autoFocus },
    ref
  ) {
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const mirrorRef = useRef<HTMLSpanElement>(null);
    // Track if autoFocus has been handled to prevent re-focusing
    const autoFocusHandledRef = useRef(false);

    // Combine refs and handle autoFocus with preventScroll
    const setRefs = useCallback((el: HTMLTextAreaElement | null) => {
      internalRef.current = el;
      if (typeof ref === "function") {
        ref(el);
      } else if (ref) {
        ref.current = el;
      }
      // Handle autoFocus with preventScroll to avoid mobile scroll issues
      if (el && autoFocus && !autoFocusHandledRef.current) {
        autoFocusHandledRef.current = true;
        el.focus({ preventScroll: true });
      }
    }, [ref, autoFocus]);

    // Auto-resize based on content
    const adjustSize = useCallback(() => {
      const textarea = internalRef.current;
      const mirror = mirrorRef.current;
      if (!textarea || !mirror) return;

      // Update mirror content (add a space to prevent collapse on empty)
      mirror.textContent = value || placeholder || " ";

      // Get computed width from mirror and apply to textarea
      const mirrorWidth = mirror.offsetWidth;
      const minWidth = 150;
      const maxWidth = 500;
      textarea.style.width = `${Math.max(minWidth, Math.min(mirrorWidth + 16, maxWidth))}px`;

      // Reset height to auto to get accurate scrollHeight
      textarea.style.height = "auto";
      // Set height to scrollHeight to show all content
      textarea.style.height = `${textarea.scrollHeight}px`;
    }, [value, placeholder]);

    // Adjust size on value change
    useEffect(() => {
      adjustSize();
    }, [value, adjustSize]);

    // Initial size adjustment
    useEffect(() => {
      // Small delay to ensure styles are applied
      requestAnimationFrame(adjustSize);
    }, [adjustSize]);

    return (
      <div className={styles.inlineField}>
        {/* Hidden mirror element for width measurement */}
        <span
          ref={mirrorRef}
          className={styles.inlineTextMirror}
          aria-hidden="true"
        />
        <textarea
          ref={setRefs}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className={styles.inlineTextInput}
          rows={1}
        />
      </div>
    );
  }
);
