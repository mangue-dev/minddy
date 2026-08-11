"use client";

// CE QUE LA VUE D'UNE TÂCHE NE PEUT PAS SAVOIR — et que sa surface, elle, sait.
//
// Une tâche est le même objet dans le carnet et dans une page (task-nodes.ts) ;
// sa vue est donc la même (task-item-view.tsx). Ce qui diffère n'est jamais la
// tâche : c'est ce qu'il faut faire AUTOUR quand on la confie.
//
//  - QUITTER : le carnet est une modale, et son démontage flushe l'autosave
//    (scratchpad-editor.tsx) ; une page ne se ferme pas, elle écrit ce qui
//    traîne avant de laisser la navigation partir.
//  - LE PROMPT : les notes du carnet se relisent avec `minddy_get_scratchpad`,
//    une page avec `minddy_get_page` — et une tâche de page vient d'un document
//    qui a un nom, ce que l'agent doit lire.
//  - PROMOUVOIR : la formulation adressée à Numo nomme d'où sort la note.
//
// D'où ce contexte, et sa forme : trois GESTES déjà décidés, pas trois réglages
// que la vue aurait à recombiner. La vue appelle `launchAgent(md)` ; ce qu'il
// advient de la surface, de quel prompt on emballe et de quel projet on parle
// n'est pas son affaire — c'est exactement ce qui lui permet d'être la même des
// deux côtés.

import { createContext, useContext, type ReactNode } from "react";

export interface TaskSurface {
  /**
   * Le prompt à mettre dans le presse-papier pour cette tâche. Reçoit le
   * markdown porté par la tâche — les titres de sa section, puis la tâche et
   * ses sous-tâches (cf. task-item-view.tsx).
   */
  copyPrompt: (markdown: string) => string;

  /**
   * Confier la tâche à un agent : quitter la surface (en enregistrant ce qui
   * traîne), amorcer le composer de la page Agents et y naviguer. Reçoit le
   * même markdown que `copyPrompt`.
   */
  launchAgent: (markdown: string) => void;

  /**
   * Promouvoir la note en ticket : quitter la surface et ouvrir Numo avec la
   * demande. Reçoit le TEXTE de la tâche (et de ses sous-tâches), pas un
   * prompt — la formulation appartient à la surface, qui seule sait d'où la
   * note sort.
   */
  promote: (note: string) => void;
}

const TaskSurfaceContext = createContext<TaskSurface | null>(null);

export function TaskSurfaceProvider({
  value,
  children,
}: {
  value: TaskSurface;
  children: ReactNode;
}) {
  return (
    <TaskSurfaceContext.Provider value={value}>
      {children}
    </TaskSurfaceContext.Provider>
  );
}

/**
 * La surface qui porte la tâche. `null` hors de tout provider — la vue rend
 * alors la case à cocher seule, sans menu ⋯ ni raccourcis : une tâche reste
 * cochable partout, mais on ne confie rien depuis une surface qui n'a pas dit
 * ce que « confier » veut dire chez elle.
 */
export function useTaskSurface(): TaskSurface | null {
  return useContext(TaskSurfaceContext);
}
