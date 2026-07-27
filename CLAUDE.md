# Conventions minddy

## Sitemap : tenir `lastModified` à la main

Quand le **contenu d'une page publique change vraiment**, mettre à jour le
`lastModified` de sa route dans [lib/public-routes.ts](lib/public-routes.ts),
à la date du changement (ISO court, `YYYY-MM-DD`).

`lastModified` est le seul des trois champs du sitemap que Google lit encore
(`priority` et `changeFrequency` sont ignorés depuis longtemps ; Bing les
regarde encore un peu) : c'est lui qui déclenche un nouveau passage du crawler.
D'où la tenue à la main. Une date de build, remise à jour à chaque déploiement,
dirait « tout a changé » à chaque fois — et Google apprend vite à ne plus la
croire, sur tout le domaine.

**Ce qui compte comme un vrai changement** : le texte lu par un visiteur. Les
namespaces i18n des pages publiques dans `messages/en.json` et `messages/fr.json`
(`Landing`, `Pricing`, `Legal`, `Terms`, `Privacy`, `Cookies`), et les
composants que ces pages rendent.

**Ce qui n'en est pas un** : un refactor, un ajustement de style ou d'animation,
une correction de typo — rien de ce qui laisse la page dire la même chose.

Une seule page change → une seule date bouge. Ne jamais remonter les six d'un
coup : c'est exactement le signal que la tenue à la main sert à éviter.

| Clé | Pages | Contenu |
| --- | --- | --- |
| `home` | `/`, `/fr` | [app/(marketing)/page.tsx](<app/(marketing)/page.tsx>) + namespace `Landing` |
| `pricing` | `/pricing`, `/fr/tarifs` | [app/(marketing)/pricing/page.tsx](<app/(marketing)/pricing/page.tsx>) + namespace `Pricing` |
| `legal` | `/legal`, `/fr/mentions-legales` | [app/(legal)/legal/page.tsx](<app/(legal)/legal/page.tsx>) + namespace `Legal` |
| `terms` | `/terms`, `/fr/cgu` | [app/(legal)/terms/page.tsx](<app/(legal)/terms/page.tsx>) + namespace `Terms` |
| `privacy` | `/privacy`, `/fr/confidentialite` | [app/(legal)/privacy/page.tsx](<app/(legal)/privacy/page.tsx>) + namespace `Privacy` |
| `cookies` | `/cookies`, `/fr/cookies` | [app/(legal)/cookies/page.tsx](<app/(legal)/cookies/page.tsx>) + namespace `Cookies` |

Le sitemap ([app/sitemap.ts](app/sitemap.ts)) lit cette table, comme le proxy,
les métadonnées de page et les liens de la nav et du pied de page. Ajouter une
page publique = une entrée de plus dans `PUBLIC_ROUTES`, rien d'autre à câbler.
