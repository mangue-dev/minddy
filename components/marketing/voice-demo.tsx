import { getTranslations } from "next-intl/server";
import { VoiceDemoPlayer } from "./voice-demo-player";

/**
 * L'enveloppe SERVEUR de la démo de dictée (MIN-150).
 *
 * Elle n'existe que pour une raison : `Field` et `Priority` ne font pas partie
 * des namespaces servis au navigateur sur le site public
 * (`lib/public-client-messages.ts` — le catalogue complet pesait 39 Ko gzippés
 * dans le document). Les lire ici et passer les neuf intitulés en props coûte
 * quelques dizaines d'octets dans le flux RSC, et garde la démo alignée sur les
 * mots exacts de l'app : si « Échéance » change dans le produit, il change ici.
 */
export async function VoiceDemo() {
  const [tField, tPriority] = await Promise.all([
    getTranslations("Field"),
    getTranslations("Priority"),
  ]);

  return (
    <VoiceDemoPlayer
      labels={{
        priority: tField("priority"),
        dueDate: tField("dueDate"),
        assignee: tField("assignee"),
        categories: tField("categories"),
        priorities: {
          none: tPriority("none"),
          urgent: tPriority("urgent"),
          high: tPriority("high"),
          medium: tPriority("medium"),
          low: tPriority("low"),
        },
      }}
    />
  );
}
