"use client";

// Ce que la PAGE ajoute à la tâche partagée : sa surface (MIN-274).
//
// Le pendant de `ScratchpadTaskSurface` (components/scratchpad/scratchpad-task.tsx),
// et il ne diffère que là où les deux surfaces diffèrent vraiment :
//
//  - QUITTER. Le carnet est une modale : on la ferme, et son démontage flushe
//    l'autosave. Une page ne se ferme pas — mais la passation vient d'écrire un
//    `[~]` dans le document, et la navigation qui suit démonterait l'éditeur
//    avec cette écriture encore en attente. D'où le `flush()` explicite avant
//    de partir, exactement comme l'ouverture d'une sous-page (page-view.tsx).
//  - LE PROMPT. `buildPageTaskPrompt` (lib/pages-prompt.ts) : la page a un nom,
//    et ses outils MCP sont ceux des pages.
//  - PROMOUVOIR. Numo a déjà la page en contexte ambiant (`useAssistantContext`,
//    MIN-273) : il peut donc en retirer la tâche lui-même une fois le ticket
//    créé, ce que le prompt lui demande.

import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  FREE_COMPOSE_PARAM,
  setAgentComposeDraft,
} from "@/lib/agent-compose-draft";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { buildPageTaskPrompt } from "@/lib/pages-prompt";
import {
  TaskSurfaceProvider,
  type TaskSurface,
} from "@/components/scratchpad/task-surface";

export function PageTaskSurface({
  pageTitle,
  flush,
  children,
}: {
  /** Le titre AFFICHÉ de la page — donc celui qu'on vient peut-être de taper. */
  pageTitle: string;
  /** Écrire ce qui est en attente. À attendre avant toute navigation. */
  flush: () => Promise<void>;
  children: ReactNode;
}) {
  const t = useTranslations("Pages");
  const router = useRouter();
  const openAssistant = useAssistantPanel().open;

  const surface = useMemo<TaskSurface>(
    () => ({
      // Le bloc MCP sert l'agent EXTERNE (Claude Code, Cursor) dans lequel on
      // colle : lui a les outils de page et peut cocher la ligne en repartant.
      copyPrompt: (markdown) =>
        buildPageTaskPrompt(markdown, { page: pageTitle }),

      // Le run Numo, lui, part SANS le bloc — même règle que le carnet : ce
      // qu'on lit dans le composer est exactement ce qui part (le serveur
      // laisse passer un prompt déjà emballé, cf. `isScratchpadPrompt`).
      launchAgent: (markdown) => {
        const prompt = buildPageTaskPrompt(markdown, {
          page: pageTitle,
          mcp: false,
        });
        setAgentComposeDraft({ kind: "free", prompt });
        void flush().finally(() =>
          router.push(`/agents?compose=${FREE_COMPOSE_PARAM}`)
        );
      },

      promote: (note) => {
        // Le panneau s'ouvre tout de suite — il ne démonte pas l'éditeur, donc
        // rien ne presse l'écriture ; on la lance quand même, pour que le `[~]`
        // soit parti avant que Numo ne relise la page.
        void flush();
        openAssistant({
          prompt: t("promotePrompt", { note, page: pageTitle }),
        });
      },
    }),
    [t, pageTitle, flush, router, openAssistant]
  );

  return <TaskSurfaceProvider value={surface}>{children}</TaskSurfaceProvider>;
}
