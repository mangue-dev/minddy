import type { Locale } from "@/i18n/config";
import { formatChangelogAge, formatChangelogDate } from "@/lib/changelog";

/**
 * La liste des livraisons, telle qu'elle s'affiche — partagée par la page
 * publique `/changelog` et par le modal « Nouveautés » de l'app.
 *
 * Le composant ne traduit RIEN : il reçoit des titres et des corps déjà
 * résolus. C'est ce qui lui permet d'être rendu des deux côtés de la frontière
 * serveur/client sans rien coûter. Le root layout n'envoie au navigateur que
 * les quatre namespaces du site public (MIN-100) ; un composant client qui
 * appellerait `useTranslations("Changelog")` afficherait des chemins de clés
 * sur `/changelog`, ou obligerait à embarquer le namespace — qui grandit à
 * chaque livraison — dans le bundle de la landing. Les deux appelants savent
 * déjà traduire, chacun avec sa moitié de next-intl.
 */

export interface ChangelogEntryContent {
  /** Slug stable : ancre de l'URL et `guid` du flux RSS. */
  id: string;
  /** Date de déploiement, ISO court. */
  date: string;
  title: string;
  body: string;
}

export function ChangelogEntries({
  entries,
  locale,
}: {
  entries: ReadonlyArray<ChangelogEntryContent>;
  locale: Locale;
}) {
  return (
    <ol className="flex flex-col">
      {entries.map((entry) => (
        // L'ancre permet de pointer une livraison précise — c'est ce qu'on
        // colle dans une réponse à un utilisateur qui attendait quelque chose.
        <li
          key={entry.id}
          id={entry.id}
          className="scroll-mt-24 border-b border-border py-8 first:pt-0 last:border-b-0"
        >
          <time
            dateTime={entry.date}
            title={formatChangelogDate(entry.date, locale)}
            className="mb-3 block font-mono text-xs text-muted-foreground"
          >
            {formatChangelogAge(entry.date, locale)}
          </time>
          <h2 className="mb-3 text-xl font-semibold tracking-tight text-balance sm:text-2xl">
            {entry.title}
          </h2>
          <p className="leading-relaxed text-pretty text-muted-foreground">
            {entry.body}
          </p>
        </li>
      ))}
    </ol>
  );
}
