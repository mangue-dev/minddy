"use client";

import {
  type ReactNode,
  useRef,
  useCallback,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import { useTranslations } from "next-intl";
import { Button, SendButtonWithCost, cn } from "mangue-ui";
import { Paperclip, Square } from "lucide-react";
import { AgentBeam } from "@/components/agent-beam";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { PageContextBadge } from "@/components/assistant/page-context-badge";
import { AttachmentPills, DropOverlay, useFileDrop } from "@/components/attachments";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { useAuth } from "@/lib/auth-context";
import type { AssistantPageContext } from "@/lib/assistant-types";
import type { AttachmentInput } from "@/lib/types";

/** What the "+" offers Numo: files it can actually read (images, PDF, CSV,
    text-ish) — MIN-24 scope. */
const ACCEPT =
  "image/*,application/pdf,text/csv,text/plain,text/markdown,application/json,.csv,.txt,.md,.json,.log";

interface ChatInputProps {
  onSend: (message: string, attachments: AttachmentInput[]) => void;
  onAbort?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  noBorder?: boolean;
  placeholder?: string;
  /**
   * Hide the attach affordances (file button + drop overlay + paste-to-attach).
   * The home composer sets this: it hands the prompt off to the global panel via
   * `open({ prompt })`, which carries no files, so an attach button there would
   * silently drop the upload. Attachments still belong in the panel itself.
   */
  hideAttach?: boolean;
  /**
   * The assistant's current context (open issue / board), shown as a chip
   * tucked into the top of the composer, above the placeholder. Its radius is
   * set so `badge radius + padding === surface radius` (concentric nesting).
   */
  pageContext?: AssistantPageContext | null;
  /**
   * Text to seed the editor with on mount (caret placed at the end, ready to
   * edit). Used by the agent launch composer to pre-write "Work on MIN-42".
   * One-shot: only read once when the composer mounts.
   */
  initialValue?: string;
  /**
   * Extra controls pinned to the LEFT of the bottom bar (the send/dictate
   * cluster stays right). The agent launch composer drops its model picker here.
   */
  leadingControls?: ReactNode;
  /**
   * Liseré animé « réponse en cours » autour de la surface (même effet que les
   * cartes d'issue). Le chat Numo et la conversation de l'agent l'activent tant
   * qu'une réponse se génère.
   */
  beam?: boolean;
  /**
   * Pendant une réponse en cours (`isStreaming`), autorise l'ENVOI : le bouton Stop
   * n'apparaît que si l'input est vide ; dès qu'on tape, il devient un bouton
   * d'envoi. L'agent conversationnel l'active (envoyer = interrompre + steerer en
   * priorité). Défaut : off (le chat Numo garde Stop tant qu'il génère).
   */
  sendWhileStreaming?: boolean;
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
      hideAttach = false,
      pageContext = null,
      initialValue,
      leadingControls,
      beam,
      sendWhileStreaming,
    },
    ref
  ) {
    const t = useTranslations("Assistant");
    const tAttach = useTranslations("Attachments");
    const effectivePlaceholder = placeholder ?? t("inputPlaceholder");
    const editorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isEmpty, setIsEmpty] = useState(true);
    const [isFocused, setIsFocused] = useState(false);
    const { user } = useAuth();
    const userId = user?.id;
    const uploads = useAttachmentUploads(() => `chat/${userId}`, { max: 5 });
    const drop = useFileDrop((files) => {
      if (userId) uploads.addFiles(files);
    });

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
      if (!value || disabled || uploads.uploading) return;
      onSend(value, uploads.inputs);
      clearEditor();
      uploads.clear();
      // Le caret reste dans le composer après l'envoi. Sans ça le focus s'échappe
      // (vider un contentEditable le perd ; cliquer Envoyer focus un bouton qui
      // disparaît juste après), et dans le panneau Numo le FocusScope du Sheet le
      // rapatriait sur la coquille — d'où un halo de focus autour du panneau.
      editorRef.current?.focus();
    }, [serializeContent, onSend, disabled, clearEditor, uploads]);

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

    // Dictated text is additive: appended after the existing content, caret at
    // the end (same behavior as AutoKap's composer).
    const appendDictated = useCallback((text: string) => {
      const el = editorRef.current;
      if (!el) return;
      const current = (el.textContent ?? "").trim();
      el.textContent = current ? `${current} ${text}` : text;
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

    // Pré-remplissage one-shot (montage) : on écrit le texte initial, caret en
    // fin, prêt à être édité — le composer de lancement d'agent s'en sert pour
    // pré-écrire « Travaille sur MIN-42 ».
    useEffect(() => {
      const el = editorRef.current;
      if (!initialValue || !el) return;
      el.textContent = initialValue;
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
      // Volontairement au montage uniquement (pas de resync sur changement).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        {/* `keepMounted` : le composer ne doit JAMAIS être remonté quand le liseré
            s'allume ou s'éteint — sinon l'éditeur perd le focus (le FocusScope du
            Sheet le repose alors sur la coquille) et le texte tapé pendant la
            réponse disparaît. */}
        <AgentBeam active={!!beam} keepMounted className="rounded-2xl">
        <div
          className={cn(
            "chat-input-surface relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all",
            drop.dragging
              ? "border-brand ring-2 ring-brand/20"
              : isFocused
                ? "border-brand/40 ring-2 ring-brand/10"
                : "border-border"
          )}
          {...(hideAttach ? {} : drop.handlers)}
        >
          <DropOverlay show={drop.dragging} />
          {(pageContext || uploads.pending.length > 0) && (
            // Context row above the text: the page badge and the attachment
            // pills share it (same height — the pills mirror the badge's
            // anatomy). Concentric nesting: the surface is rounded-2xl
            // (--radius-2xl = --radius + 8px = 24px), so the chips' rounded-md
            // (--radius - 2px = 14px) + the 10px (p-2.5) gap to the surface
            // edge === 24px.
            <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-2.5">
              {pageContext && (
                <PageContextBadge
                  context={pageContext}
                  className="rounded-md shadow-none"
                />
              )}
              <AttachmentPills
                pillClassName="rounded-md shadow-none"
                attachments={uploads.pending.filter((p) => p.status === "done")}
                pending={uploads.pending}
                onRemove={(a) => {
                  const match = uploads.pending.find(
                    (p) => p.storage_path === a.storage_path
                  );
                  if (match) uploads.remove(match.localId);
                }}
                onRemovePending={uploads.remove}
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
              onPaste={(e) => {
                if (!hideAttach && userId && e.clipboardData.files.length > 0) {
                  e.preventDefault();
                  uploads.addFiles(e.clipboardData.files);
                }
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className="min-h-[24px] whitespace-pre-wrap break-words text-sm leading-relaxed outline-none [&:empty]:before:pointer-events-none [&:empty]:before:text-muted-foreground [&:empty]:before:content-[attr(aria-placeholder)]"
            />
          </div>

          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
            {/* Contrôles de gauche (ex. picker de modèle). Vide → la barre reste
                visuellement identique (le cluster d'envoi collé à droite). */}
            <div className="flex min-w-0 items-center gap-1.5">{leadingControls}</div>
            <div className="flex shrink-0 items-center gap-1.5">
              {isStreaming && (isEmpty || !sendWhileStreaming) ? (
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
                <>
                  {!isStreaming && !hideAttach && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={ACCEPT}
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.length) uploads.addFiles(e.target.files);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={disabled || !userId}
                        onClick={() => fileInputRef.current?.click()}
                        className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
                        aria-label={tAttach("attach")}
                        title={tAttach("attach")}
                      >
                        <Paperclip className="size-4" />
                      </Button>
                    </>
                  )}
                  {!isStreaming && (
                    <DictateButton
                      onTranscription={appendDictated}
                      disabled={disabled}
                    />
                  )}
                  {!isEmpty && (
                    <SendButtonWithCost
                      cost={null}
                      isLoading={false}
                      disabled={(disabled ?? false) || uploads.uploading}
                      onClick={handleSubmit}
                      ariaLabel={t("send")}
                      tooltipLabel={t("send")}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        </AgentBeam>
      </div>
    );
  }
);
