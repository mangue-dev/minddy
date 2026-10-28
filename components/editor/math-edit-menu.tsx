"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { MobileSheetContent } from "@/components/ui/mobile-sheet";
import { Textarea } from "@/components/ui/textarea";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";
import {
  BLOCK_MATH_NODE,
  isMathNode,
  mathError,
  renderMath,
} from "@/components/pages/blocks/math";

interface Target {
  pos: number;
  display: boolean;
}

/**
 * The LaTeX editor of an equation: a popover anchored to the node on desktop,
 * the bottom sheet on a phone. The block registry opens it through
 * `storage.blockMath.edit` (click on an equation, ↵ on a selected one, the
 * “/Equation” entry); saving empty LaTeX removes the equation, and so does
 * closing a new one that was never written.
 */
export function MathEditMenu({ editor }: { editor: Editor | null }) {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const mobile = useMobileLayout() === true;
  const inputId = useId();
  const [target, setTarget] = useState<Target | null>(null);
  const [draft, setDraft] = useState("");
  // The position follows the document while the editor is open (a
  // collaborator typing above it moves it).
  const posRef = useRef<number | null>(null);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.storage.blockMath) return;
    const storage = editor.storage.blockMath;
    storage.edit = (pos) => {
      const node = editor.state.doc.nodeAt(pos);
      if (!isMathNode(node) || !node) return;
      posRef.current = pos;
      setDraft(String(node.attrs.latex ?? ""));
      setTarget({ pos, display: node.type.name === BLOCK_MATH_NODE });
    };
    return () => {
      storage.edit = null;
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || !target) return;
    const follow = ({ transaction }: { transaction: Transaction }) => {
      if (posRef.current === null) return;
      // Mapped to the left: an attribute change (the block ID stamped on a new
      // equation, a collaborator's edit) replaces the atom, which counts as
      // deleting what follows its start.
      const mapped = transaction.mapping.map(posRef.current, -1);
      if (!isMathNode(editor.state.doc.nodeAt(mapped))) {
        posRef.current = null;
        setTarget(null);
        return;
      }
      posRef.current = mapped;
    };
    editor.on("transaction", follow);
    return () => {
      editor.off("transaction", follow);
    };
  }, [editor, target]);

  const close = useCallback(
    (save: boolean) => {
      const pos = posRef.current;
      posRef.current = null;
      setTarget(null);
      if (!editor || editor.isDestroyed || pos === null) return;
      const node = editor.state.doc.nodeAt(pos);
      if (!node || !isMathNode(node)) return;
      const latex = save ? draft.trim() : String(node.attrs.latex ?? "").trim();
      const tr = editor.state.tr;
      if (!latex) {
        // Nothing to show: an equation saved empty, or a new one abandoned.
        tr.delete(pos, pos + node.nodeSize);
      } else {
        if (save && latex !== node.attrs.latex) tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex });
        const after = tr.doc.nodeAt(pos);
        if (after) {
          tr.setSelection(
            after.isInline
              ? TextSelection.create(tr.doc, pos + after.nodeSize)
              : NodeSelection.create(tr.doc, pos)
          );
        }
      }
      editor.view.dispatch(tr.scrollIntoView());
      editor.commands.focus();
    },
    [editor, draft]
  );

  // The anchor reads the node's box each time the popover measures, so it
  // stays on the equation while the page scrolls.
  const anchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => {
          const pos = posRef.current;
          const dom = editor && pos !== null && !editor.isDestroyed ? editor.view.nodeDOM(pos) : null;
          return dom instanceof HTMLElement ? dom.getBoundingClientRect() : new DOMRect();
        },
      },
    }),
    [editor]
  );

  if (!editor) return null;
  const open = target !== null;
  const display = target?.display ?? false;

  const form = (
    <MathForm
      inputId={inputId}
      draft={draft}
      display={display}
      onDraft={setDraft}
      onSave={() => close(true)}
      onCancel={() => close(false)}
      labels={{
        latex: t("mathLatexLabel"),
        placeholder: t("mathPlaceholder"),
        preview: t("mathPreview"),
        previewEmpty: t("mathPreviewEmpty"),
        error: t("mathError"),
        removeHint: t("mathRemoveHint"),
        save: tCommon("save"),
        cancel: tCommon("cancel"),
      }}
      mobile={mobile}
    />
  );

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={(next) => { if (!next) close(false); }}>
        <MobileSheetContent side="bottom" aria-describedby={undefined} className="gap-3 p-4 pt-12">
          <SheetTitle className="mobile-picker-title truncate">{t("mathEditTitle")}</SheetTitle>
          {form}
        </MobileSheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={(next) => { if (!next) close(false); }}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        side="bottom"
        align={display ? "center" : "start"}
        sideOffset={6}
        collisionPadding={12}
        data-floating-surface
        aria-label={t("mathEditTitle")}
        className="w-[min(26rem,calc(100vw-2rem))]"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {form}
      </PopoverContent>
    </Popover>
  );
}

function MathForm({
  inputId,
  draft,
  display,
  onDraft,
  onSave,
  onCancel,
  labels,
  mobile,
}: {
  inputId: string;
  draft: string;
  display: boolean;
  onDraft: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  labels: Record<"latex" | "placeholder" | "preview" | "previewEmpty" | "error" | "removeHint" | "save" | "cancel", string>;
  mobile: boolean;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const latex = draft.trim();
  const error = useMemo(() => (latex ? mathError(latex, display) : null), [latex, display]);
  const errorId = `${inputId}-error`;

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    if (latex) renderMath(latex, preview, display);
    else preview.textContent = "";
  }, [latex, display]);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSave();
      }}
    >
      <label htmlFor={inputId} className="text-sm font-medium">
        {labels.latex}
      </label>
      <Textarea
        id={inputId}
        autoFocus={allowInputAutoFocus()}
        value={draft}
        rows={display ? 3 : 1}
        placeholder={labels.placeholder}
        spellCheck={false}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="min-h-10 font-mono text-sm"
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => {
          // ⌘↵ saves everywhere; ↵ saves an inline equation, which is one
          // line, while a block keeps ↵ for its next line.
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          if (event.metaKey || event.ctrlKey || (!display && !event.shiftKey)) {
            event.preventDefault();
            onSave();
          }
        }}
      />
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{labels.preview}</span>
        <div
          className="page-math-preview min-h-10 overflow-x-auto rounded-md bg-control px-3 py-2 text-foreground"
          aria-live="polite"
        >
          <div ref={previewRef} />
          {!latex && <span className="text-sm text-muted-foreground">{labels.previewEmpty}</span>}
        </div>
        {error ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {labels.error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{labels.removeHint}</p>
        )}
      </div>
      <div className={mobile ? "flex flex-col gap-2" : "flex justify-end gap-2"}>
        <Button type="submit" size={mobile ? "lg" : "sm"} className={mobile ? "w-full" : "order-last"}>
          {labels.save}
        </Button>
        <Button type="button" variant="outline" size={mobile ? "lg" : "sm"} className={mobile ? "w-full" : undefined} onClick={onCancel}>
          {labels.cancel}
        </Button>
      </div>
    </form>
  );
}
