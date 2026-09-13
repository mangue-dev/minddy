"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useAuth } from "@/lib/auth-context";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";

type AssistantUploads = ReturnType<typeof useAttachmentUploads>;

interface AssistantComposerContextValue {
  draftHtml: string;
  setDraftHtml: Dispatch<SetStateAction<string>>;
  uploads: AssistantUploads;
}

const AssistantComposerContext =
  createContext<AssistantComposerContextValue | null>(null);

/** Keep the unsent composer state alive while its page or FAB projection moves. */
export function AssistantComposerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const getUploadPrefix = useCallback(() => `chat/${userId ?? ""}`, [userId]);
  const uploads = useAttachmentUploads(getUploadPrefix, { max: 5 });
  const [draftHtml, setDraftHtml] = useState("");
  const ownerRef = useRef(userId);

  useEffect(() => {
    const previousOwner = ownerRef.current;
    ownerRef.current = userId;
    if (!previousOwner || previousOwner === userId) return;
    setDraftHtml("");
    uploads.clear();
  }, [uploads, userId]);

  const value = useMemo<AssistantComposerContextValue>(
    () => ({ draftHtml, setDraftHtml, uploads }),
    [draftHtml, uploads],
  );

  return (
    <AssistantComposerContext.Provider value={value}>
      {children}
    </AssistantComposerContext.Provider>
  );
}

export function useAssistantComposer(): AssistantComposerContextValue {
  const context = useContext(AssistantComposerContext);
  if (!context) {
    throw new Error(
      "useAssistantComposer must be used within an AssistantComposerProvider",
    );
  }
  return context;
}
