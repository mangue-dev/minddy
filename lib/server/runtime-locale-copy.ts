import type { Locale } from "@/i18n/config";
import { resolveApplicationLocale } from "@/lib/locale-language";

const COMMENT_DONE: Record<Locale, string> = {
  en: "Done.",
  fr: "C'est fait.",
  de: "Erledigt.",
  "pt-BR": "Concluído.",
  it: "Fatto.",
  es: "Hecho.",
};

const PRIOR_CONVERSATION_LOST: Record<Locale, string> = {
  en: "Note: the earlier turns of this session ran on the previous engine, whose history cannot be read here. You cannot see that exchange — work from the issue and the state of the repository, and say so if it matters.",
  fr: "Note : les tours précédents de cette session ont été joués par l'ancien moteur, dont l'historique n'est pas lisible ici. Tu ne vois pas cet échange — repars du ticket et de l'état du dépôt, et dis-le si ça change quelque chose.",
  de: "Hinweis: Die früheren Durchläufe dieser Sitzung liefen mit der vorherigen Engine, deren Verlauf hier nicht gelesen werden kann. Du kannst diesen Austausch nicht sehen — arbeite vom Ticket und vom Zustand des Repositorys aus und erwähne es, falls es relevant ist.",
  "pt-BR": "Observação: os turnos anteriores desta sessão foram executados pelo mecanismo anterior, cujo histórico não pode ser lido aqui. Você não consegue ver essa conversa — trabalhe a partir da tarefa e do estado do repositório e informe isso se for relevante.",
  it: "Nota: i turni precedenti di questa sessione sono stati eseguiti dal motore precedente, la cui cronologia non è leggibile qui. Non puoi vedere quello scambio — riparti dal ticket e dallo stato del repository e segnalalo se è rilevante.",
  es: "Nota: los turnos anteriores de esta sesión se ejecutaron con el motor anterior, cuyo historial no se puede leer aquí. No puedes ver ese intercambio — trabaja a partir de la incidencia y del estado del repositorio e indícalo si es relevante.",
};

export function commentFallbackDone(locale: string): string {
  return COMMENT_DONE[resolveApplicationLocale(locale)];
}

export function priorConversationLostNote(locale: string): string {
  return PRIOR_CONVERSATION_LOST[resolveApplicationLocale(locale)];
}
