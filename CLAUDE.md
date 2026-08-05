# Conventions minddy

## i18n : le placeholder est un contrat entre deux fichiers

Toute chaîne visible passe par next-intl, et vit en double : `messages/en.json`
et `messages/fr.json`. Les deux catalogues portent **exactement les mêmes clés**
et **exactement les mêmes placeholders**.

La règle qui compte : **un message à placeholder s'appelle avec ses valeurs.**

```tsx
// messages/en.json → "deleteViewTitle": "Delete “{name}”?"
t("deleteViewTitle", { name: view.name })   // ✅
t("deleteViewTitle")                        // ❌ affiche « Board.deleteViewTitle »
```

L'oubli ne lève rien et ne journalise rien : next-intl retombe silencieusement
sur le chemin de la clé, et c'est ce chemin que l'utilisateur lit à l'écran.
C'est arrivé deux fois (le dialog de suppression de vue, l'aide de signature des
webhooks), et dans les deux cas le code était juste dans chaque fichier pris
séparément — la faute n'existait qu'entre les deux.

Écrire une chaîne **et** son appel dans le même geste, c'est écrire les deux
moitiés d'un contrat. Les relire séparément ne le vérifie pas. Ce qui le vérifie :

```bash
npx vitest run lib/i18n-contract.test.ts   # < 1 s
```

Il appelle le vrai formateur sur les 2 600 clés et signale, en `fichier:ligne`,
tout message à placeholder appelé sans ses valeurs, plus toute divergence fr/en.
**Le lancer dès qu'on a touché à `messages/*.json` ou ajouté un `t(...)`.**

Deux pièges de plus :

- `tsc` vérifie les **noms** de clés (via [global.d.ts](global.d.ts)) mais **pas**
  les placeholders — les valeurs de chaîne d'un import JSON sont élargies en
  `string`. Un type-check vert ne dit rien sur ce contrat-là ; seul le test ci-dessus le dit.
- `<mot>` dans un message est lu comme une **balise riche**, pas comme du texte.
  Pour de la doc technique, écrire `HMAC-SHA256(corps)`, jamais `<HMAC du corps>`.

Une clé assemblée à l'exécution (`t(\`errors.${code}\`)`) échappe au typage : la
caster en `MessageKey<"Namespace">` ([lib/i18n-keys.ts](lib/i18n-keys.ts)), et
typer les **tables** de clés avec `MessageKey` plutôt que `string`. Enfin, un
translator passé en prop se type `ReturnType<typeof useTranslations<"Namespace">>` :
sans le namespace, TypeScript renonce (TS2589) et ne vérifie plus rien du tout.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
