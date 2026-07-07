"use client";

import {
  useRef,
  useCallback,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import { useTranslations } from "next-intl";
import { Button, SendButtonWithCost, cn } from "mangue-ui";
import { Square } from "lucide-react";
import { PageContextBadge } from "@/components/assistant/page-context-badge";
import type { AssistantPageContext } from "@/lib/assistant-types";

interface ChatInputProps {
  onSend: (message: string) => void;
  onAbort?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  noBorder?: boolean;
  placeholder?: string;
  /**
   * The assistant's current context (open issue / board), shown as a chip
   * tucked into the top of the composer, above the placeholder. Its radius is
   * set so `badge radius + padding === surface radius` (concentric nesting).
   */
  pageContext?: AssistantPageContext | null;
}

export interface ChatInputHandle {
  fill: (text: string) => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    {
      onSend,
      onAbort,
      disabled,
      isStreaming,
      noBorder,
      placeholder,
      pageContext = null,
    },
    ref
  ) {
    const t = useTranslations("Assistant");
    const effectivePlaceholder = placeholder ?? t("inputPlaceholder");
    const editorRef = useRef<HTMLDivElement>(null);
    const [isEmpty, setIsEmpty] = useState(true);
    const [isFocused, setIsFocused] = useState(false);

    const serializeContent = useCallback((): string => {
      const el = editorRef.current;
      if (!el) return "";

      const parts: string[] = [];

      function walk(node: Node) {
        if (node.nodeType === Node.TEXT_NODE) {
          parts.push(node.textContent || "");
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;

          if (element.tagName === "BR") {
            parts.push("\n");
            return;
          }

          if (element.tagName === "DIV" || element.tagName === "P") {
            if (parts.length > 0 && parts[parts.length - 1] !== "\n") {
              parts.push("\n");
            }
            for (const child of element.childNodes) walk(child);
            return;
          }

          for (const child of element.childNodes) walk(child);
        }
      }

      for (const child of el.childNodes) walk(child);
      return parts.join("").trim();
    }, []);

    const clearEditor = useCallback(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
        setIsEmpty(true);
      }
    }, []);

    const handleSubmit = useCallback(() => {
      const value = serializeContent();
      if (!value || disabled) return;
      onSend(value);
      clearEditor();
    }, [serializeContent, onSend, disabled, clearEditor]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      },
      [handleSubmit]
    );

    const handleInput = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;
      const empty = !el.textContent?.trim();
      setIsEmpty(empty);

      if (empty && el.innerHTML !== "") {
        el.innerHTML = "";
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        fill(text: string) {
          const el = editorRef.current;
          if (!el) return;
          el.textContent = text;
          setIsEmpty(false);
          el.focus();
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        },
      }),
      []
    );

    useEffect(() => {
      if (noBorder && editorRef.current) {
        editorRef.current.focus();
      }
    }, [noBorder]);

    const focusEditorAtEnd = useCallback(() => {
      const el = editorRef.current;
      if (!el || disabled) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }, [disabled]);

    const handleContainerMouseDown = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (editorRef.current?.contains(target)) return;
        if (target.closest("button, a, input, textarea, select")) return;
        e.preventDefault();
        focusEditorAtEnd();
      },
      [focusEditorAtEnd]
    );

    return (
      <div
        className={noBorder ? "px-3 pb-3" : "px-3 py-3"}
        onMouseDown={handleContainerMouseDown}
      >
        <div
          className={cn(
            "chat-input-surface flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all",
            isFocused
              ? "border-brand/40 ring-2 ring-brand/10"
              : "border-border"
          )}
        >
          {pageContext && (
            // Concentric nesting: the surface is rounded-2xl (--radius-2xl =
            // --radius + 8px = 24px), so the badge's rounded-md (--radius - 2px =
            // 14px) + the 10px (p-2.5) gap to the surface edge === 24px. `flex`
            // keeps the badge sized to its content (a corner chip) rather than
            // stretching to the full surface width.
            <div className="flex px-2.5 pt-2.5">
              <PageContextBadge
                context={pageContext}
                className="rounded-md shadow-none"
              />
            </div>
          )}
          <div className="relative max-h-[180px] min-h-[52px] overflow-y-auto px-4 pb-1 pt-3">
            <div
              ref={editorRef}
              contentEditable={!disabled}
              role="textbox"
              aria-multiline="true"
              aria-placeholder={effectivePlaceholder}
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className="min-h-[24px] whitespace-pre-wrap break-words text-sm leading-relaxed outline-none [&:empty]:before:pointer-events-none [&:empty]:before:text-muted-foreground [&:empty]:before:content-[attr(aria-placeholder)]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 px-2 pb-2 pt-1">
            <div className="flex items-center gap-1.5">
              {isStreaming ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={onAbort}
                  className="h-8 w-8 shrink-0 rounded-full"
                  title={t("stop")}
                >
                  <Square className="h-3 w-3" />
                </Button>
              ) : (
                !isEmpty && (
                  <SendButtonWithCost
                    cost={null}
                    isLoading={false}
                    disabled={disabled ?? false}
                    onClick={handleSubmit}
                    ariaLabel={t("send")}
                    tooltipLabel={t("send")}
                  />
                )
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
