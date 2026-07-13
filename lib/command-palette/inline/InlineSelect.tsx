"use client";

import { forwardRef, useEffect, useRef } from "react";
import { ChevronDownIcon, LoaderIcon } from "../icons";
import styles from "../styles/InlineActionInput.module.css";
import type { FormSelectOption } from "../registry/types";

export type SelectOption = FormSelectOption;

export interface InlineSelectProps {
  value: string;
  options: SelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLButtonElement>) => void;
  onSearchChange?: (value: string) => void;
  searchValue?: string;
  disabled?: boolean;
  isActive?: boolean;
  autoFocus?: boolean;
  /** Show loading spinner instead of dropdown arrow. */
  isLoading?: boolean;
  /** Text to show when loading (defaults to placeholder). */
  loadingText?: string;
}

export const InlineSelect = forwardRef<HTMLButtonElement | HTMLInputElement, InlineSelectProps>(
  function InlineSelect(
    { value, options, placeholder, onChange: _onChange, onFocus, onBlur, onKeyDown, onSearchChange, searchValue, disabled, isActive, autoFocus, isLoading, loadingText },
    ref
  ) {
    const selectedOption = options.find((opt) => opt.value === value);
    const displayValue = selectedOption?.label || "";
    const inputRef = useRef<HTMLInputElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    // Track if autoFocus has been handled to prevent re-focusing on isActive changes
    const autoFocusHandledRef = useRef(false);
    // Track loading state transitions for focus retention
    const wasLoadingRef = useRef(false);
    // Only restore focus after loading if the field had it when loading started
    const hadFocusBeforeLoadingRef = useRef(false);

    // Focus the input when the select becomes active
    useEffect(() => {
      if (isActive && inputRef.current) {
        inputRef.current.focus({ preventScroll: true });
      }
    }, [isActive]);

    // Handle autoFocus for button (when not active) - only once on mount
    useEffect(() => {
      if (autoFocus && !isActive && buttonRef.current && !autoFocusHandledRef.current) {
        autoFocusHandledRef.current = true;
        buttonRef.current.focus({ preventScroll: true });
      }
    }, [autoFocus, isActive]);

    // Focus retention: re-focus when loading completes, but only if the
    // field owned the focus when loading started (an initial background
    // loadOptions must not steal focus from the first field)
    useEffect(() => {
      if (!wasLoadingRef.current && isLoading) {
        const active = document.activeElement;
        hadFocusBeforeLoadingRef.current =
          active === inputRef.current || active === buttonRef.current;
      }
      if (wasLoadingRef.current && !isLoading && hadFocusBeforeLoadingRef.current) {
        requestAnimationFrame(() => {
          if (isActive && inputRef.current) {
            inputRef.current.focus({ preventScroll: true });
          } else if (buttonRef.current) {
            buttonRef.current.focus({ preventScroll: true });
          }
        });
      }
      wasLoadingRef.current = isLoading ?? false;
    }, [isLoading, isActive]);

    // When active, show an input for searching
    if (isActive) {
      return (
        <div className={`${styles.inlineField} ${styles.inlineFieldActive} ${isLoading ? styles.inlineFieldLoading : ""}`}>
          <input
            ref={(el) => {
              inputRef.current = el;
              if (typeof ref === "function") {
                ref(el);
              } else if (ref) {
                (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
              }
            }}
            type="text"
            value={searchValue || ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            placeholder={isLoading ? (loadingText || placeholder || "Loading...") : (placeholder || "Search...")}
            disabled={disabled}
            className={styles.inlineSelectInput}
            autoComplete="off"
            autoFocus={autoFocus}
          />
          {isLoading ? (
            <LoaderIcon className={`${styles.inlineSelectIcon} ${styles.inlineSelectIconActive} ${styles.inlineSelectIconLoading}`} />
          ) : (
            <ChevronDownIcon className={`${styles.inlineSelectIcon} ${styles.inlineSelectIconActive}`} />
          )}
        </div>
      );
    }

    // When not active, show a button with the selected value
    return (
      <div className={`${styles.inlineField} ${isLoading ? styles.inlineFieldLoading : ""}`}>
        <button
          ref={(el) => {
            buttonRef.current = el;
            if (typeof ref === "function") {
              ref(el);
            } else if (ref) {
              (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
            }
          }}
          type="button"
          onClick={isLoading ? undefined : onFocus}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          disabled={disabled}
          aria-busy={isLoading}
          className={`${styles.inlineSelect} ${!selectedOption && !isLoading ? styles.inlineSelectPlaceholder : ""}`}
        >
          {selectedOption?.color && !isLoading && (
            <span
              className={styles.inlineColorSwatch}
              style={{ backgroundColor: selectedOption.color }}
              aria-hidden="true"
            />
          )}
          {selectedOption?.icon && !isLoading && (
            <span className={styles.inlineSelectIconPrefix} aria-hidden="true">
              {selectedOption.icon}
            </span>
          )}
          <span className={styles.inlineSelectValue}>
            {isLoading ? (loadingText || placeholder || "Loading...") : (displayValue || placeholder)}
          </span>
          {selectedOption?.description && !isLoading && (
            <span className={styles.inlineSelectDescription}>
              {selectedOption.description}
            </span>
          )}
          {isLoading ? (
            <LoaderIcon className={`${styles.inlineSelectIcon} ${styles.inlineSelectIconLoading}`} />
          ) : (
            <ChevronDownIcon className={styles.inlineSelectIcon} />
          )}
        </button>
      </div>
    );
  }
);
