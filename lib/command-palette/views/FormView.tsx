/**
 * FormView - Inline action form view.
 *
 * Shown when a contextual action declares `requiresForm`. Uses
 * InlineActionInput for the single-line inline form experience.
 *
 * Advanced behavior:
 * - Fields with `loadOptions` resolve their options dynamically (async),
 *   with a loading state on the field while resolving.
 * - Fields with `dependsOn` are cleared and re-resolved when one of their
 *   dependencies changes (e.g. member list depends on selected project).
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePaletteConfig } from "../config";
import { usePaletteStore } from "../store";
import { InlineActionInput, type InlineFieldConfig } from "../inline/InlineActionInput";
import type { ActionExecutionContext, FormSelectOption } from "../registry/types";
import styles from "../styles/FormView.module.css";

// =============================================================================
// TYPES
// =============================================================================

export interface FormViewProps {
  /** Context for action execution. */
  actionContext: ActionExecutionContext;
  /** Callback when form is submitted successfully. */
  onSuccess?: () => void;
  /** Callback when form is cancelled. */
  onCancel?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FormView({ actionContext, onSuccess }: FormViewProps) {
  const { t } = usePaletteConfig();
  const pendingAction = usePaletteStore((s) => s.pendingAction);
  const pendingActionItem = usePaletteStore((s) => s.pendingActionItem);
  const formValues = usePaletteStore((s) => s.formValues);
  const setFormValue = usePaletteStore((s) => s.setFormValue);
  const setFormValues = usePaletteStore((s) => s.setFormValues);
  const resetForm = usePaletteStore((s) => s.resetForm);
  const closeForm = usePaletteStore((s) => s.closeForm);

  const fieldSpecs = useMemo(
    () => pendingAction?.requiresForm?.fields ?? [],
    [pendingAction]
  );

  // Resolved dynamic options per field key
  const [resolvedOptions, setResolvedOptions] = useState<
    Record<string, FormSelectOption[]>
  >({});
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set());

  // Track resolve generations to discard stale async results
  const resolveGeneration = useRef<Record<string, number>>({});

  /** Resolve loadOptions for one field. */
  const resolveField = useCallback(
    (key: string, values: Record<string, unknown>) => {
      const spec = fieldSpecs.find((f) => f.key === key);
      if (!spec?.loadOptions) return;

      const generation = (resolveGeneration.current[key] ?? 0) + 1;
      resolveGeneration.current[key] = generation;

      const result = spec.loadOptions(values, actionContext);

      if (result instanceof Promise) {
        setLoadingFields((prev) => new Set(prev).add(key));
        result
          .then((options) => {
            if (resolveGeneration.current[key] !== generation) return; // Stale
            setResolvedOptions((prev) => ({ ...prev, [key]: options }));
          })
          .catch((error) => {
            console.error("[command-palette] loadOptions failed", key, error);
          })
          .finally(() => {
            if (resolveGeneration.current[key] !== generation) return;
            setLoadingFields((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          });
      } else {
        setResolvedOptions((prev) => ({ ...prev, [key]: result }));
      }
    },
    [fieldSpecs, actionContext]
  );

  // Initial resolution of dynamic fields.
  // Fields whose dependencies are still empty wait for handleFieldChange.
  useEffect(() => {
    for (const spec of fieldSpecs) {
      if (!spec.loadOptions) continue;
      const dependenciesFilled = (spec.dependsOn ?? []).every((dep) => {
        const value = formValues[dep];
        return typeof value === "string" ? value.trim() !== "" : value != null;
      });
      if (dependenciesFilled) {
        resolveField(spec.key, formValues);
      }
    }
    // Only on action change — dependent re-resolution happens in handleFieldChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction]);

  // Build inline field configs with resolved options
  const fields = useMemo<InlineFieldConfig[]>(() => {
    return fieldSpecs.map((spec): InlineFieldConfig => ({
      spec,
      label: spec.label,
      placeholder: spec.placeholder,
      options: resolvedOptions[spec.key] ?? spec.options,
      isLoading: loadingFields.has(spec.key),
    }));
  }, [fieldSpecs, resolvedOptions, loadingFields]);

  // Action title and icon
  const actionTitle = pendingAction?.label ?? "";
  const actionIcon = useMemo(() => {
    if (!pendingAction?.icon) return null;
    const Icon = pendingAction.icon;
    return <Icon style={{ width: 16, height: 16 }} />;
  }, [pendingAction]);

  // Field change with dependent-field clearing + re-resolution
  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      const dependents = fieldSpecs.filter((f) => f.dependsOn?.includes(key));

      if (dependents.length > 0) {
        const nextValues = { ...formValues, [key]: value };
        for (const dep of dependents) {
          nextValues[dep.key] = "";
        }
        setFormValues(nextValues);
        for (const dep of dependents) {
          if (dep.loadOptions) {
            resolveField(dep.key, nextValues);
          }
        }
      } else {
        setFormValue(key, value);
      }
    },
    [fieldSpecs, formValues, setFormValue, setFormValues, resolveField]
  );

  // Submit
  const handleSubmit = useCallback(async () => {
    if (!pendingAction?.requiresForm?.onSubmit || !pendingActionItem) return;

    try {
      const result = await pendingAction.requiresForm.onSubmit(
        formValues,
        pendingActionItem,
        actionContext
      );

      if (result.success) {
        // closeMenu === false returns to the previous view instead of closing
        if (result.closeMenu === false) {
          closeForm();
        } else {
          resetForm();
          onSuccess?.();
        }
      }
    } catch {
      actionContext.showToast?.(t("form.actionFailed"), "error");
    }
  }, [pendingAction, pendingActionItem, formValues, actionContext, t, resetForm, closeForm, onSuccess]);

  // Cancel — back to previous view
  const handleCancel = useCallback(() => {
    closeForm();
  }, [closeForm]);

  if (!pendingAction || !pendingAction.requiresForm) {
    return (
      <div className={styles.formView}>
        <div className={styles.emptyState}>{t("form.noActionPending")}</div>
      </div>
    );
  }

  return (
    <div className={styles.formView}>
      <InlineActionInput
        actionTitle={actionTitle}
        actionIcon={actionIcon}
        fields={fields}
        values={formValues}
        onFieldChange={handleFieldChange}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </div>
  );
}

export default FormView;
