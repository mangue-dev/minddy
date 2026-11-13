"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChatMessage } from "@/components/assistant/chat-message";
import { useAuth } from "@/lib/auth-context";
import type { AssistantMessage } from "@/lib/assistant-types";
import { mentionMarkdown } from "@/lib/mention-link";
import { useProjects } from "@/lib/projects-context";
import { capabilitiesForProject } from "@/lib/use-project-capabilities";

/**
 * Numo introducing itself to an account it has nothing to say to yet
 * (MIN-907): on Home under the greeting, and in an empty Numo panel. The app
 * writes it, not the model: it costs nothing, is never stored, and leaves as
 * soon as Numo has a word of its own (`useHomeBriefQuery`). It names the
 * person and their first project as mentions, so it reads like Numo.
 */
export function NumoIntro() {
  const t = useTranslations("Assistant");
  const { user } = useAuth();
  const { projects } = useProjects();
  const project = projects.find((item) => capabilitiesForProject(item, user?.id ?? null).canWrite) ?? null;

  const message = useMemo<AssistantMessage | null>(() => {
    if (!user) return null;
    const me = mentionMarkdown("member", user.id);
    const content = project
      ? t("introWithProject", { me, project: mentionMarkdown("project", project.id) })
      : t("introWithoutProject", { me });
    return {
      id: "numo-intro",
      conversation_id: "",
      role: "assistant",
      content,
      tool_calls: null,
      tool_call_id: null,
      tool_name: null,
      metadata: {},
      context: null,
      created_at: user.created_at,
    };
  }, [user, project, t]);

  if (!message) return null;
  return (
    <div data-testid="numo-intro">
      <ChatMessage message={message} />
    </div>
  );
}
