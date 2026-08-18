/**
 * InlineActionInput - Raycast-style inline form.
 *
 * Renders the action title followed by its fields on a single line:
 *   ‹ [icon] Assign task : [project ▾] [member ▾] [note…]
 *
 * Keyboard model:
 * - Tab / Shift+Tab cycle fields (focus trap)
 * - ←/→ navigate fields (← on first field cancels)
 * - Enter selects an option / submits on the last field
 * - Filling the last required field auto-submits
 * - Escape cancels
 */

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePaletteConfig } from "../config";
import { ChevronLeftIcon } from "../icons";
import { matchesSearch } from "../search/engine";
import { Kbd } from "../components/Kbd";
import styles from "../styles/InlineActionInput.module.css";
import { InlineSelect, type SelectOption } from "./InlineSelect";
import { InlineTextInput } from "./InlineTextInput";
import { autoFocusFieldIndex } from "./auto-focus";
import type { FormFieldSpec } from "../registry/types";
import type { ReactNode } from "react";

export interface InlineFieldConfig {
  spec: FormFieldSpec;
  label: string;
  placeholder?: string;
  options?: SelectOption[];
  disabled?: boolean;
  /** Field is loading data (focusable but shows loading state). */
  isLoading?: boolean;
}

export interface InlineActionInputProps {
  actionTitle: string;
  actionIcon?: ReactNode;
  fields: InlineFieldConfig[];
  values: Record<string, unknown>;
  onFieldChange: (key: string, value: unknown) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isExecuting?: boolean;
}

type ActiveFieldState = {
  key: string;
  type: "select" | "text";
  searchQuery: string;
  activeOptionIndex: number;
} | null;

export function InlineActionInput({
  actionTitle,
  actionIcon,
  fields,
  values,
  onFieldChange,
  onSubmit,
  onCancel,
  isExecuting: _isExecuting,
}: InlineActionInputProps) {
  const { t } = usePaletteConfig();
  const [activeField, setActiveField] = useState<ActiveFieldState>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Map<string, HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>>(new Map());
  const optionRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Keep a ref to the latest onSubmit to avoid stale closure issues
  const onSubmitRef = useRef(onSubmit);
  useLayoutEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  // Get filtered options for the active select field
  const filteredOptions = useMemo(() => {
    if (!activeField || activeField.type !== "select") return [];

    const fieldConfig = fields.find((f) => f.spec.key === activeField.key);
    if (!fieldConfig?.options) return [];

    const query = activeField.searchQuery.trim();
    if (!query) return fieldConfig.options;

    // Unified search: abbreviations, stop word skipping, accent normalization
    return fieldConfig.options.filter((opt) => matchesSearch(query, opt.label));
  }, [activeField, fields]);

  // The field that takes the cursor when opened: the first to fill, and to
  // default the first one altogether — a fully pre-filled form is a
  // proposition, pas un formulaire fini (cf. auto-focus.ts).
  const autoFocusIndex = useMemo(
    () => autoFocusFieldIndex(fields.map((f) => f.spec.key), values),
    [fields, values]
  );

  // Scroll active option into view
  useEffect(() => {
    if (activeField?.type === "select") {
      const optionEl = optionRefs.current.get(activeField.activeOptionIndex);
      optionEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeField?.activeOptionIndex, activeField?.type]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!activeField || activeField.type !== "select") return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(`.${styles.inlineOptionsDropdown}`) || target.closest(`.${styles.inlineSelect}`)) {
        return;
      }
      setActiveField(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeField]);

  // Focus trap using native event listener with capture phase
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTabCapture = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      e.preventDefault();
      e.stopPropagation();

      // Close any open dropdown when navigating with Tab
      setActiveField(null);

      // Find which field is currently focused
      const activeElement = document.activeElement;
      let currentFieldKey: string | null = null;
      let currentIndex = -1;

      for (const [key, el] of fieldRefs.current.entries()) {
        if (el === activeElement) {
          currentFieldKey = key;
          currentIndex = fields.findIndex((f) => f.spec.key === key);
          break;
        }
      }

      if (currentFieldKey !== null && currentIndex !== -1) {
        // Navigate between fields with cycling
        let nextIndex: number;
        if (e.shiftKey) {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : fields.length - 1;
        } else {
          nextIndex = currentIndex < fields.length - 1 ? currentIndex + 1 : 0;
        }
        const nextField = fields[nextIndex];
        const nextRef = fieldRefs.current.get(nextField.spec.key);
        nextRef?.focus({ preventScroll: true });
      } else if (fields.length > 0) {
        // Focus is not on any field, move to first/last
        const targetField = e.shiftKey ? fields[fields.length - 1] : fields[0];
        const ref = fieldRefs.current.get(targetField.spec.key);
        ref?.focus({ preventScroll: true });
      }
    };

    container.addEventListener("keydown", handleTabCapture, true);
    return () => container.removeEventListener("keydown", handleTabCapture, true);
  }, [fields]);

  const handleFieldFocus = useCallback((key: string, type: "select" | "text") => {
    setActiveField({ key, type, searchQuery: "", activeOptionIndex: 0 });
  }, []);

  // Navigate to next field (cycles back to first)
  const focusNextField = useCallback((currentKey: string) => {
    if (fields.length === 0) return false;
    const currentIndex = fields.findIndex((f) => f.spec.key === currentKey);
    const nextIndex = currentIndex < fields.length - 1 ? currentIndex + 1 : 0;
    const nextField = fields[nextIndex];
    setTimeout(() => {
      const nextRef = fieldRefs.current.get(nextField.spec.key);
      nextRef?.focus({ preventScroll: true });
    }, 0);
    return true;
  }, [fields]);

  // Navigate to previous field (cycles to last)
  const focusPreviousField = useCallback((currentKey: string) => {
    if (fields.length === 0) return false;
    const currentIndex = fields.findIndex((f) => f.spec.key === currentKey);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : fields.length - 1;
    const prevField = fields[prevIndex];
    setTimeout(() => {
      const prevRef = fieldRefs.current.get(prevField.spec.key);
      prevRef?.focus({ preventScroll: true });
    }, 0);
    return true;
  }, [fields]);

  const handleSelectOption = useCallback((option: SelectOption) => {
    if (!activeField) return;

    onFieldChange(activeField.key, option.value);
    setActiveField(null);

    // Move to next field
    const currentIndex = fields.findIndex((f) => f.spec.key === activeField.key);
    const nextField = fields[currentIndex + 1];

    if (nextField) {
      setTimeout(() => {
        const nextRef = fieldRefs.current.get(nextField.spec.key);
        nextRef?.focus({ preventScroll: true });
      }, 0);
    } else {
      // Last field: auto-submit when all required fields are filled
      const updatedValues = { ...values, [activeField.key]: option.value };

      const allFieldsFilled = fields.every((field) => {
        const value = updatedValues[field.spec.key];
        const hasValue = typeof value === "string" && value.trim() !== "";
        const isRequired = field.spec.required !== false;
        if (!isRequired) return true;
        return hasValue;
      });

      if (allFieldsFilled) {
        // setTimeout so the field value lands before submitting
        setTimeout(() => {
          onSubmitRef.current();
        }, 0);
      }
    }
  }, [activeField, fields, onFieldChange, values]);

  const handleSelectSearchChange = useCallback((value: string) => {
    setActiveField((prev) => {
      if (!prev) return prev;
      return { ...prev, searchQuery: value, activeOptionIndex: 0 };
    });
  }, []);

  const handleSelectKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement | HTMLButtonElement>, fieldKey: string) => {
    const isSelectOpen = activeField?.key === fieldKey && activeField?.type === "select";
    const currentIndex = fields.findIndex((f) => f.spec.key === fieldKey);
    const isFirstField = currentIndex === 0;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isSelectOpen) {
        setActiveField({ key: fieldKey, type: "select", searchQuery: "", activeOptionIndex: 0 });
      } else {
        setActiveField((prev) => {
          if (!prev) return prev;
          const nextIndex = Math.min(prev.activeOptionIndex + 1, filteredOptions.length - 1);
          return { ...prev, activeOptionIndex: nextIndex };
        });
      }
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (isSelectOpen) {
        setActiveField((prev) => {
          if (!prev) return prev;
          const nextIndex = Math.max(prev.activeOptionIndex - 1, 0);
          return { ...prev, activeOptionIndex: nextIndex };
        });
      }
    }

    // ArrowRight: next field (when dropdown is closed)
    if (e.key === "ArrowRight") {
      if (!isSelectOpen) {
        e.preventDefault();
        e.stopPropagation();
        focusNextField(fieldKey);
      }
    }

    // ArrowLeft: previous field, or cancel on first field (dropdown closed)
    if (e.key === "ArrowLeft") {
      if (!isSelectOpen) {
        e.preventDefault();
        e.stopPropagation();
        if (isFirstField) {
          onCancel();
        } else {
          focusPreviousField(fieldKey);
        }
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (isSelectOpen && filteredOptions.length > 0) {
        const selectedOption = filteredOptions[activeField?.activeOptionIndex ?? 0];
        if (selectedOption) {
          handleSelectOption(selectedOption);
        }
      } else if (!isSelectOpen) {
        setActiveField({ key: fieldKey, type: "select", searchQuery: "", activeOptionIndex: 0 });
      }
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }

    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      if (isSelectOpen) {
        setActiveField(null);
      }
      if (e.shiftKey) {
        focusPreviousField(fieldKey);
      } else {
        focusNextField(fieldKey);
      }
    }
  }, [activeField, filteredOptions, handleSelectOption, onCancel, focusNextField, focusPreviousField, fields]);

  const handleTextInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>, fieldKey: string) => {
    const currentIndex = fields.findIndex((f) => f.spec.key === fieldKey);
    const isFirstField = currentIndex === 0;
    const isLastField = currentIndex === fields.length - 1;
    const target = e.target as HTMLTextAreaElement;
    const cursorAtStart = target.selectionStart === 0 && target.selectionEnd === 0;
    const cursorAtEnd = target.selectionStart === target.value.length && target.selectionEnd === target.value.length;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isLastField) {
        onSubmit();
      } else {
        focusNextField(fieldKey);
      }
    }

    // ArrowLeft at cursor position 0: previous field or cancel
    if (e.key === "ArrowLeft" && cursorAtStart) {
      e.preventDefault();
      e.stopPropagation();
      if (isFirstField) {
        onCancel();
      } else {
        focusPreviousField(fieldKey);
      }
    }

    // ArrowRight at end of text: next field
    if (e.key === "ArrowRight" && cursorAtEnd) {
      e.preventDefault();
      e.stopPropagation();
      focusNextField(fieldKey);
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }

    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        focusPreviousField(fieldKey);
      } else {
        focusNextField(fieldKey);
      }
    }
  }, [fields, onSubmit, onCancel, focusNextField, focusPreviousField]);

  const handleBackClick = useCallback(() => {
    onCancel();
  }, [onCancel]);

  // Position of active select for dropdown placement
  const activeSelectRef = activeField?.key ? fieldRefs.current.get(activeField.key) : null;

  const renderField = (fieldConfig: InlineFieldConfig, index: number) => {
    const { spec, label, placeholder, options, disabled, isLoading } = fieldConfig;
    const value = values[spec.key];

    const shouldAutoFocus = index === autoFocusIndex;

    // Select if: type select, has options, or is loading (will have options)
    const isSelect = spec.type === "select" || (options && options.length > 0) || isLoading;
    const isActive = activeField?.key === spec.key && activeField?.type === "select";

    if (isSelect) {
      return (
        <InlineSelect
          key={spec.key}
          ref={(el) => {
            if (el) fieldRefs.current.set(spec.key, el);
            else fieldRefs.current.delete(spec.key);
          }}
          value={typeof value === "string" ? value : ""}
          options={options || []}
          placeholder={label || placeholder}
          onChange={(v) => onFieldChange(spec.key, v)}
          onFocus={() => handleFieldFocus(spec.key, "select")}
          onKeyDown={(e) => handleSelectKeyDown(e, spec.key)}
          onSearchChange={handleSelectSearchChange}
          searchValue={isActive ? activeField?.searchQuery || "" : ""}
          disabled={disabled}
          isActive={isActive}
          autoFocus={shouldAutoFocus}
          isLoading={isLoading}
        />
      );
    }

    return (
      <InlineTextInput
        key={spec.key}
        ref={(el) => {
          if (el) fieldRefs.current.set(spec.key, el);
          else fieldRefs.current.delete(spec.key);
        }}
        value={typeof value === "string" ? value : ""}
        placeholder={label || placeholder}
        onChange={(v) => onFieldChange(spec.key, v)}
        onFocus={() => handleFieldFocus(spec.key, "text")}
        onKeyDown={(e) => handleTextInputKeyDown(e, spec.key)}
        autoFocus={shouldAutoFocus}
      />
    );
  };

  const isSelectActive = activeField?.type === "select";

  return (
    <div ref={containerRef} className={styles.inlineContainer}>
      {/* Search bar area */}
      <div className={styles.inlineSearchBar}>
        <button
          type="button"
          className={styles.inlineBackButton}
          onClick={handleBackClick}
          aria-label={t("form.back")}
          tabIndex={-1}
        >
          <ChevronLeftIcon className={styles.inlineBackIcon} />
        </button>

        {/* Action title and inline fields */}
        <div className={styles.inlineFieldsRow}>
          {actionIcon && <span className={styles.inlineActionIcon}>{actionIcon}</span>}
          <span className={styles.inlineActionTitle}>{actionTitle}</span>
          <span className={styles.inlineSeparator}>:</span>
          {fields.map((field, index) => renderField(field, index))}
        </div>
      </div>

      {/* Options dropdown for select fields */}
      {isSelectActive && activeSelectRef && filteredOptions.length > 0 && (
        <div key={activeField?.key} className={styles.inlineOptionsDropdown}>
          <ul className={styles.inlineOptionsList} role="listbox">
            {filteredOptions.map((option, index) => {
              const isActiveOption = index === activeField?.activeOptionIndex;
              return (
                <li key={option.value}>
                  <button
                    ref={(el) => {
                      if (el) optionRefs.current.set(index, el);
                      else optionRefs.current.delete(index);
                    }}
                    type="button"
                    className={`${styles.inlineOption} ${isActiveOption ? styles.inlineOptionActive : ""}`}
                    onClick={() => handleSelectOption(option)}
                    role="option"
                    aria-selected={isActiveOption}
                    tabIndex={-1}
                  >
                    {option.color && (
                      <span
                        className={styles.inlineColorSwatch}
                        style={{ backgroundColor: option.color }}
                        aria-hidden="true"
                      />
                    )}
                    {option.icon && (
                      <span className={styles.inlineOptionIcon} aria-hidden="true">
                        {option.icon}
                      </span>
                    )}
                    <span className={styles.inlineOptionLabel}>{option.label}</span>
                    {option.description && (
                      <span className={styles.inlineOptionDescription}>{option.description}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Empty state when no options match */}
      {isSelectActive && filteredOptions.length === 0 && activeField?.searchQuery && (
        <div key={`${activeField?.key}-empty`} className={styles.inlineOptionsDropdown}>
          <div className={styles.inlineEmptyOptions}>
            {t("form.noResults")}
          </div>
        </div>
      )}

      {/* Footer hints */}
      <div className={styles.inlineFooter}>
        {fields.length > 1 && (
          <div className={styles.inlineFooterHint}>
            <Kbd keys={["shift", t("form.keys.tab")]} size="sm" />
            <Kbd keys={t("form.keys.tab")} size="sm" />
            <span>{t("form.navigateFields")}</span>
          </div>
        )}
        <div className={styles.inlineFooterHint}>
          <Kbd keys={t("form.keys.enter")} size="sm" />
          <span>{isSelectActive ? t("form.select") : t("form.execute")}</span>
        </div>
        <div className={styles.inlineFooterHint}>
          <Kbd keys={t("form.keys.escape")} size="sm" />
          <span>{t("form.cancel")}</span>
        </div>
      </div>
    </div>
  );
}
