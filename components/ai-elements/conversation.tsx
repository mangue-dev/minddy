"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { useScrollFade } from "@/lib/use-scroll-fade";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Scrolling conversation thread.
 *
 * What it DOES NOT do, and that's the whole point: follow the response as it
 * is written. The thread ONLY moves on a user gesture — open a
 * conversation, send a message (prop `anchor`), click the back button
 * down. As long as Numo writes, the view does not move a single pixel: we read what we read,
 * the content grows underneath, and the back button at the bottom says there is.
 *
 * Hence the replacement of `use-stick-to-bottom`, whose job that was exactly
 * reverse (paste at the bottom each time the content size changes).
 */

/** Tolerance (px) under which one considers oneself “at the bottom”: smooth scrolling
 * rarely stops at the pixel level, and the button would blink for half a pixel. */
const BOTTOM_SLACK = 24;

type ConversationContextValue = {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  /** Recalculates `isAtBottom` — plugged into scrolling AND content size. */
  measure: () => void;
  isAtBottom: boolean;
  scrollToBottom: () => void;
};

const ConversationContext = createContext<ConversationContextValue | null>(null);

function useConversationContext(): ConversationContextValue {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error("Conversation parts must be used within <Conversation>");
  }
  return context;
}

export type ConversationProps = Omit<ComponentProps<"div">, "children"> & {
  children: ReactNode;
  /**
   * Anchor point: EACH change in this value, the wire resets at the bottom,
   * without animation. The host puts in what amounts to “take me back downstairs” — the conversation
   * open, the number of messages sent.
   */
  anchor?: string | number;
};

export const Conversation = ({
  className,
  anchor,
  children,
  ...props
}: ConversationProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const measure = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    setIsAtBottom(
      node.scrollHeight - node.scrollTop - node.clientHeight <= BOTTOM_SLACK
    );
  }, []);

  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, []);

  // Anchor (open, send): without animation — this is a starting point, not a
  // movement to watch. useLayoutEffect → before painting, so no flash of the
  // top of the wire. The effect also works in the editing: we open a conversation at the bottom.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    measure();
  }, [anchor, measure]);

  return (
    <ConversationContext.Provider
      value={{ scrollRef, contentRef, measure, isAtBottom, scrollToBottom }}
    >
      <div
        className={cn("relative flex-1 overflow-y-hidden", className)}
        role="log"
        {...props}
      >
        {children}
      </div>
    </ConversationContext.Provider>
  );
};

export type ConversationContentProps = ComponentProps<"div">;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => {
  const { scrollRef, contentRef, measure } = useConversationContext();
  const {
    ref: fadeRef,
    scrollProps: { onScroll: updateFade, style: fadeStyle },
  } = useScrollFade<HTMLDivElement>();
  const setScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      fadeRef(node);
    },
    [fadeRef, scrollRef],
  );
  // What the reader is looking at: the bottom, or the first visible message
  // and its offset. A width change (the panel switching compact ⇄ expanded)
  // reflows every message, and the thread would otherwise land elsewhere.
  // Recorded on scroll, one frame at a time; restored only when the WIDTH
  // changes, never when Numo's answer grows (the thread does not follow it).
  const reading = useRef<{ atBottom: boolean; node: Element | null; offset: number }>({
    atBottom: true,
    node: null,
    offset: 0,
  });
  const readingFrame = useRef<number | null>(null);
  const rememberReading = useCallback(() => {
    if (readingFrame.current !== null) return;
    readingFrame.current = requestAnimationFrame(() => {
      readingFrame.current = null;
      const scroller = scrollRef.current;
      const content = contentRef.current;
      if (!scroller || !content) return;
      const top = scroller.getBoundingClientRect().top;
      const atBottom =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= BOTTOM_SLACK;
      let node: Element | null = null;
      let offset = 0;
      for (const child of content.children) {
        const rect = child.getBoundingClientRect();
        if (rect.bottom > top) {
          node = child;
          offset = rect.top - top;
          break;
        }
      }
      reading.current = { atBottom, node, offset };
    });
  }, [contentRef, scrollRef]);
  useEffect(() => () => {
    if (readingFrame.current !== null) cancelAnimationFrame(readingFrame.current);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let width = scroller.clientWidth;
    const observer = new ResizeObserver(() => {
      if (scroller.clientWidth === width) return;
      width = scroller.clientWidth;
      const { atBottom, node, offset } = reading.current;
      if (atBottom) scroller.scrollTop = scroller.scrollHeight;
      else if (node?.isConnected) {
        scroller.scrollTop += node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset;
      }
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scrollRef]);

  const handleScroll = useCallback(() => {
    measure();
    updateFade();
    rememberReading();
  }, [measure, updateFade, rememberReading]);

  // The content grows UNDER the user while Numo writes: without observing its
  // waist, “am I down?” » would only refresh with the next gesture of
  // scrolling — and the back button at the bottom would never appear.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [contentRef, measure]);

  return (
    <div
      ref={setScrollRef}
      onScroll={handleScroll}
      className="h-full w-full overflow-y-auto"
      style={{
        scrollbarGutter: "stable both-edges",
        ...fadeStyle,
      }}
    >
      <div
        ref={contentRef}
        className={cn("flex flex-col gap-8 p-4", className)}
        {...props}
      />
    </div>
  );
};

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const tc = useTranslations("Common");
  const { isAtBottom, scrollToBottom } = useConversationContext();

  return (
    !isAtBottom && (
      <AppTooltip label={tc("scrollToBottom")}>
        <Button
          aria-label={tc("scrollToBottom")}
          className={cn(
            "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted",
            className
          )}
          onClick={scrollToBottom}
          size="icon"
          type="button"
          variant="outline"
          {...props}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" />
        </Button>
      </AppTooltip>
    )
  );
};
