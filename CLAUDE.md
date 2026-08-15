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

## TypeScript : l'éditeur et le dépôt ne compilent pas avec le même binaire

Depuis MIN-180, `typescript` est en **7.0.2**, le compilateur natif. C'est lui
que lancent `npm run typecheck` et le type-check de `next build` : sur le Mac
(12 cœurs), 14,8 s → 2,1 s à froid pour le premier, 15,4 s → 2,4 s pour le
second, et le build complet passe de 26,6 s à 13,2 s.

**Le gain est plus modeste sur Vercel, et c'est une question de cœurs.** La
machine de build est en `standard` (4 cœurs) : mesuré à conditions égales — même
machine, même cache, deux déploiements consécutifs ne différant que par la version
du compilateur — le type-check y passe de **38,9 s à 14,5 s** (×2,7, pas ×6), et
le travail de build de 59,7 s à 43,3 s. Le compilateur natif est massivement
parallèle ; sur 4 cœurs il ne peut pas rendre ce qu'il rend sur 12. Ne pas
transposer les chiffres du poste à la CI, dans un sens ni dans l'autre.

**La contrepartie**, à savoir plutôt qu'à découvrir : `typescript@7` ne livre pas
de `tsserver.js`. `typescript.tsdk` ne peut donc pas pointer dessus, et l'éditeur
continue d'utiliser son TypeScript embarqué — en JS, en 5.x. **L'éditeur et la CI
ne font plus tourner le même compilateur.** Sur ce code les deux rendent des
diagnostics identiques, mesuré en MIN-174 : dépôt propre à 0 erreur des deux
côtés, et sur 6 sondes portant 11 fautes délibérées, mêmes codes, mêmes
`ligne:colonne`, mêmes messages — garde-fou i18n compris (un translator passé en
prop sans son namespace reste refusé). C'est donc vivable. Mais si un jour un
diagnostic diverge, **c'est `npm run typecheck` qui fait foi**, pas le
soulignement rouge de l'éditeur.

`typescript@7` ne livre pas non plus l'API du compilateur : son export racine
pointe sur `lib/version.cjs`, le paquet ne contient que `bin/tsc` et le binaire
natif. D'où l'alias `typescript-api` (→ `typescript@5.9.3`) dans `package.json`,
dont [le test structurel de MIN-169](lib/server/agent/subagent-runner-init.test.ts)
est le seul consommateur — il lui faut `createSourceFile` pour lire un arbre.
Ce n'est pas une coquille : un `import ts from "typescript"` ailleurs dans le
dépôt ne compilerait pas.

Deux réflexes qui vont avec :

- `incremental` est à `true` : **purger `tsconfig.tsbuildinfo`** avant tout
  comptage d'erreurs ou toute mesure de durée, sinon les deux mentent.
- Le dépôt tient **deux lockfiles**. Ajouter par `pnpm add`, puis resynchroniser
  avec `npm install --package-lock-only --legacy-peer-deps` (le dépôt porte un
  conflit de peers tiptap préexistant qui bloque npm sans ce drapeau).
- **Installer avec la version de pnpm de la CI — `10.28.0`**, celle qu'épingle
  [ci.yml](.github/workflows/ci.yml), jamais `pnpm@latest`. pnpm 11 réécrit le
  lockfile en perdant les injections de `packageExtensions` : sur pnpm 11, le
  `shiki: ^3.19.0` que `package.json` pousse dans `streamdown` disparaît, les
  deux copies de shiki divergent et `npm run typecheck` tombe sur une erreur
  dans `components/ai-elements/message.tsx` — un fichier que personne n'a
  touché. Le symptôme ne désigne pas sa cause : vérifier
  `git diff pnpm-lock.yaml` avant de partir déboguer le code.

## Lint : une règle éteinte est une décision, pas un oubli

```bash
npm run lint      # oxlint --deny-warnings — tout le dépôt, 2 s
```

**Le lancer avant de répondre.** Il tourne aussi en CI, avant le typecheck, et
il attrape une classe d'erreurs que `tsc` ne voit pas : optional chaining qui
déréférence `undefined`, variable morte, `fetch` avec un corps sur un GET.

Deux jeux de règles y tournent : les règles `correctness` d'oxlint, et
**anti-slop** ([github.com/dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop)),
quinze règles qui refusent les motifs TypeScript à faible preuve. Le plugin est
**vendorisé** dans `tools/oxlint/anti-slop/` — c'est le principe de son auteur :
les fichiers sont à nous, donc modifiables. `tsconfig.json` les exclut, ils sont
chargés par oxlint, pas par `tsc`.

**La sélection est le cœur d'[oxlint.config.ts](oxlint.config.ts).** Les quinze
règles anti-slop à `error` sur ce dépôt donnent **7 926 erreurs** ; un linter
qu'on ne lance jamais n'attrape rien. Ce qui est allumé est donc ce que le dépôt
tient à **zéro** — donc ce qu'une PR ne peut plus regresser. Ce qui est éteint
l'est **avec son compte au jour de l'audit**, en commentaire sur la ligne :

```ts
"anti-slop/no-unknown-returns": "off",       // 77 — le plus proche d'être tenable
"anti-slop/require-safety-comment-for-type-assertion": "off", // 3653
```

Ce nombre est ce qui rend un cliquet possible : **on rallume une règle quand son
compte est retombé à zéro, pas avant.** Sans lui, « off » ne se distingue plus
d'un oubli, et personne ne sait ce qu'il en coûterait de rallumer.

Certaines lignes ne sont pas un compte à faire baisser mais un **désaccord de
fond**, et le commentaire le dit : `no-module-mocking` refuse `vi.mock`, alors
que la doctrine de test ci-dessous est déjà plus fine que la règle ;
`no-shape-in-symbol-names` refuse le mot « shape », qui ici est presque toujours
du domaine (la forme d'une puce de mention, les formes du canvas de grain).

**Une exception locale s'écrit avec sa raison.** `oxlint-disable-next-line` seul
ne dit rien à celui qui passera après :

```ts
// Le spread n'est PAS superflu : `headers.delete()` mute la collection qu'on
// itère. Sans la copie, l'itérateur saute des en-têtes — et ceux qu'il saute
// sont précisément ceux qu'on voulait retirer.
// oxlint-disable-next-line unicorn/no-useless-spread
for (const name of [...headers.keys()]) {
```

C'est le cas qui compte le plus, parce que la règle y a **tort** et que la
« corriger » introduirait le bug. Il y en a cinq dans le dépôt, tous commentés :
[proxy.ts](proxy.ts) et [lib/analytics.ts](lib/analytics.ts) (mutation pendant
l'itération), [lib/server/mcp/tools.ts](lib/server/mcp/tools.ts) (`Reflect.get`
est l'API du piège Proxy, seule à transmettre `receiver`), et
[captures/shots/issue-plan/shot.mjs](captures/shots/issue-plan/shot.mjs) — dont
le `const RETIRED = true` n'est ni exporté ni référencé parce que `publish.mjs`
le lit **par regex sur le texte source**. Le « nettoyer » remettrait ce dossier
en production, en silence.

## Tests : un comportement neuf vient avec le sien

```bash
npx vitest run                       # 362 fichiers, 4 559 cas, 18 s
npx vitest run lib/server/agent      # un dossier, quand on itère
```

**Le lancer avant de répondre, sur tout ce qui touche au comportement.**
`npm run typecheck` ne le remplace pas : il dit que les types s'accordent, pas
que le code fait ce qu'on croit. La feature de la PR 48 compilait — elle
s'abonnait à un canal temps réel et n'en redescendait jamais. Un type-check vert
ne dit rien d'un cycle de vie, et la suite ne dit rien d'un comportement que
personne n'a écrit : **ce qu'on ajoute vient avec son test, dans le même geste.**

Ces 362 fichiers sont la meilleure documentation du dépôt, et la plus invisible :
on ne tombe pas dessus, il faut aller les ouvrir. **Avant d'écrire un test, en
lire un qui ressemble** — il donne la forme, les mocks et la frontière, et il
évite d'inventer un décor que le voisin a déjà construit :

| Ce qu'on teste | L'exemple à ouvrir |
| --- | --- |
| Logique pure (pas d'IO) | [prune.test.ts](lib/server/agent/prune.test.ts) — on appelle, on assert, rien à monter |
| Une boucle qui parle à une API | [supervisor.test.ts](lib/server/agent/vm/supervisor.test.ts) — faux serveur opencode, flux SSE rejoué, et ce qui n'est PAS appelé |
| Un tool de l'agent | [opencode-tools.test.ts](lib/server/agent/vm/opencode-tools.test.ts) — le vrai générateur de tools, confronté au job |
| Une surface serveur | [control-plane.test.ts](lib/server/agent/control-plane.test.ts) — on ne moque que ce qui SORT du process (base, direct, ledger) |

Cas particulier déjà traité plus haut : le contrat i18n, dont
`lib/i18n-contract.test.ts` est le garde-fou — à lancer dès qu'on touche à
`messages/*.json` ou qu'on ajoute un `t(...)`.

## Travail de fond : une promesse détachée meurt avec la réponse

Dans une requête, tout travail hors chemin critique — horodatage d'usage, purge
opportuniste, glissade de session, flush d'analytics — passe par
**`afterOrNow`** ([lib/server/after-safe.ts](lib/server/after-safe.ts)).

```ts
// ❌ la réponse part, Vercel gèle l'invocation, le fetch meurt en vol
void service.from("api_keys").update({ last_used_at: now }).eq("id", id)
  .then(({ error }) => { if (error) console.error(…) });

// ✅ après la réponse, mais l'invocation reste en vie le temps qu'il faut
afterOrNow(async () => {
  const { error } = await service.from("api_keys").update({ last_used_at: now }).eq("id", id);
  if (error) console.error(…);
});
```

Une promesse détachée n'est connue de personne : dès que la réponse est rendue,
la fonction est gelée et la connexion sortante coupée. `after()` est le seul
canal qui dise le contraire à la plateforme — Next passe au `waitUntil` ce que
**rend** son callback ([after-context.js](node_modules/next/dist/server/after/after-context.js),
`await callback()`). D'où la forme du crochet : il faut lui **rendre** la
promesse, pas la détacher à l'intérieur. `afterOrNow` s'en charge, et retombe
sur une exécution immédiate hors requête (cascades d'automatisations, MIN-147).

**Ce que ça donne dans les logs** : `TypeError: fetch failed` — le message
d'erreur réseau que `postgrest-js` recopie tel quel dans `error.message`. Le
signe qui tranche, c'est l'asymétrie : *seuls* les appels détachés échouent, les
`await` du même handler passent. Une panne Supabase, elle, ferait tomber les
deux. Ne pas partir chercher une panne.

Et surtout, ça ne se voit pas toujours. La requête réussit, l'utilisateur n'a
rien, le test passe — au mieux une ligne d'erreur isolée, au pire rien du tout :
la glissade de session du board public était détachée depuis le début, sans
jamais rien dire, et les sessions expiraient à 90 jours fixes au lieu de glisser.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
