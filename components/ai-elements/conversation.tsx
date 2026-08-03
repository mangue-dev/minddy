"use client";

import { Button, cn } from "mangue-ui";
import { ArrowDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
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
 * Fil de conversation défilant.
 *
 * Ce qu'il NE fait PAS, et c'est tout le sujet : suivre la réponse pendant qu'elle
 * s'écrit. Le fil ne se déplace QUE sur un geste de l'utilisateur — ouvrir une
 * conversation, envoyer un message (prop `anchor`), cliquer le bouton de retour en
 * bas. Tant que Numo écrit, la vue ne bouge pas d'un pixel : on lit ce qu'on lisait,
 * le contenu grandit dessous, et le bouton de retour en bas dit qu'il y en a.
 *
 * D'où le remplacement de `use-stick-to-bottom`, dont c'était exactement le métier
 * inverse (recoller en bas à chaque changement de taille du contenu).
 */

/** Tolérance (px) sous laquelle on se considère « en bas » : un défilement lisse
 *  s'arrête rarement au pixel près, et le bouton clignoterait pour un demi-pixel. */
const BOTTOM_SLACK = 24;

type ConversationContextValue = {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  /** Recalcule `isAtBottom` — branché sur le défilement ET sur la taille du contenu. */
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
   * Point d'ancrage : à CHAQUE changement de cette valeur, le fil se recale en bas,
   * sans animation. L'hôte y met ce qui vaut « ramène-moi en bas » — la conversation
   * ouverte, le nombre de messages envoyés.
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

  // Ancrage (ouverture, envoi) : sans animation — c'est un point de départ, pas un
  // mouvement à regarder. useLayoutEffect → avant peinture, donc pas de flash du
  // haut du fil. L'effet tourne aussi au montage : on ouvre une conversation en bas.
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

  // Le contenu grandit SOUS l'utilisateur pendant que Numo écrit : sans observer sa
  // taille, « suis-je en bas ? » ne se rafraîchirait qu'au prochain geste de
  // défilement — et le bouton de retour en bas n'apparaîtrait jamais.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [contentRef, measure]);

  return (
    <div
      ref={scrollRef}
      onScroll={measure}
      className="h-full w-full overflow-y-auto"
      style={{ scrollbarGutter: "stable both-edges" }}
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
      <Button
        aria-label={tc("scrollToBottom")}
        title={tc("scrollToBottom")}
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
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};
