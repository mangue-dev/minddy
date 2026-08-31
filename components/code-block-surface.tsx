"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ChevronsUpDown,
  WrapText,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, IconButton, cn } from "mangue-ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const COPY_RESET_MS = 2000;
const COLLAPSED_CODE_HEIGHT_PX = 460;

/** The language control shared by editable Page blocks and read-only Agent blocks. */
export function CodeBlockLanguageTrigger({
  label,
  disabled,
}: {
  label: string;
  disabled: boolean;
}) {
  const t = useTranslations("Common");
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      aria-label={t("codeLanguage")}
      className="code-block-node-language-trigger"
    >
      <span className="truncate">{label}</span>
      <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
    </Button>
  );
}

/** Read-only language label for rendered Agent code. It intentionally keeps
 * the selector's footprint and typography without exposing button semantics,
 * a chevron, or any click behavior. */
export function CodeBlockLanguageLabel({ label }: { label: string }) {
  return <span className="code-block-node-language-label">{label}</span>;
}

/**
 * The visual and interactive shell of the Markdown code block used in Pages.
 * Pages place editable TipTap content inside it; Agent responses provide a
 * read-only highlighted `<code>` node. Both therefore share the same language
 * header, wrap/copy controls, overflow measurement, and expand/collapse UI.
 */
export function CodeBlockSurface({
  code,
  languageControl,
  children,
  className,
}: {
  code: string;
  languageControl: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("Common");
  const tAssistant = useTranslations("Assistant");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [wrapped, setWrapped] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pre = useRef<HTMLPreElement | null>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    const element = pre.current;
    if (!element) return;

    const measure = () => {
      const next = element.scrollHeight > COLLAPSED_CODE_HEIGHT_PX;
      setOverflows(next);
      if (!next) setExpanded(false);
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [code, wrapped]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // Clipboard access can be unavailable in a non-secure or restricted context.
    }
  };

  return (
    <div
      className={cn("code-block-node-view", className)}
      data-expanded={expanded ? "true" : "false"}
      data-overflowing={overflows ? "true" : "false"}
      data-wrapped={wrapped ? "true" : "false"}
    >
      <div className="code-block-node-header" contentEditable={false}>
        {languageControl}
        <div className="code-block-node-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                size="sm"
                className="code-block-node-wrap"
                aria-label={t("codeWrap")}
                aria-pressed={wrapped}
                data-active={wrapped ? "true" : "false"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setWrapped((current) => !current)}
              >
                <WrapText className="size-4" />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>{t("codeWrap")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                size="sm"
                className={cn("code-block-node-copy", copied && "text-primary")}
                aria-label={copied ? t("copied") : t("copy")}
                data-copied={copied ? "true" : "false"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void copy()}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>{copied ? t("copied") : t("copy")}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <pre ref={pre}>{children}</pre>
      {overflows && (
        <div className="code-block-node-expand" contentEditable={false}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            {expanded ? tAssistant("collapse") : tAssistant("expand")}
          </Button>
        </div>
      )}
    </div>
  );
}
