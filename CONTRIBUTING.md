# Contribuer à minddy

Merci de contribuer. Toute participation est soumise au
[Code of Conduct](CODE_OF_CONDUCT.md). Les questions d'utilisation vont dans
[GitHub Discussions](https://github.com/mangue-dev/minddy-issues/discussions),
les bugs et améliorations dans les formulaires d'issue, et les vulnérabilités
exclusivement par le canal privé de [SECURITY.md](SECURITY.md).

Avant un changement non trivial, ouvrez une issue et attendez que le périmètre
soit accepté. Une issue ouverte n'est pas une réservation : indiquez que vous
souhaitez la traiter, gardez le travail visible et prévenez si vous l'abandonnez.
La gouvernance, les délais de décision et les rôles de revue sont décrits dans
[GOVERNANCE.md](GOVERNANCE.md).

## Licence et DCO

Les contributions sont distribuées sous **AGPL-3.0-only**. Aucun CLA ni aucune
cession de copyright n'est demandé. Chaque commit doit toutefois porter le DCO
suivant, qui atteste que vous avez le droit de soumettre votre contribution sous
cette licence :

```
Signed-off-by: Prénom Nom <email@example.com>
```

Utilisez `git commit -s` pour l'ajouter. La politique complète, y compris les
notices et la règle applicable aux opérateurs d'instances modifiées, est dans
[docs/licensing.md](docs/licensing.md).

Le sign-off est requis sur **chaque commit**, y compris après un rebase. Pour
corriger le dernier commit, utilisez `git commit --amend --signoff`; pour une
série, rebasez-la et signez chaque commit. Le workflow DCO bloque la fusion s'il
manque une ligne valide. Le sign-off atteste vos droits, il ne remplace pas
l'auteur et ne cède pas votre copyright.

## ⚠ Ce dépôt exécute du code dès l'installation

À lire avant de cloner une pull request sur sa machine. Ce n'est pas une
précaution de principe : **ouvrir ce dépôt et le faire tourner suffit à exécuter
le code qu'il contient**, sans jamais ouvrir un fichier de test.

Trois chemins, tous déclenchés par des commandes qu'on tape sans y penser :

| Commande | Ce qui s'exécute |
| --- | --- |
| `pnpm install` / `npm install` | les scripts d'installation des dépendances autorisées (`pnpm.onlyBuiltDependencies` : `esbuild`) |
| `npm run test` (`vitest`) | [scripts/build-pages-md.mjs](scripts/build-pages-md.mjs), lancé en sous-process par [test/build-pages-md-setup.ts](test/build-pages-md-setup.ts) **avant le premier test** |
| `npm run dev`, `npm run build` | `predev`/`prebuild` → [scripts/build-agent-vm.mjs](scripts/build-agent-vm.mjs) et `build-pages-md.mjs` |

Sur le poste d'un mainteneur, ce code s'exécute **à côté d'un `.env` qui porte
la clé `service_role` de production**. Un fichier de `scripts/` modifié dans une
PR, ou une dépendance ajoutée au lockfile, lit ce fichier aussi facilement que
`cat`.

**La conséquence pratique : ne vérifiez pas une PR en la lançant sur votre poste
de travail.** La CI est là pour ça — elle joue exactement ces gates dans un
runner jetable qui ne voit aucun secret. Si vous devez malgré tout exécuter une
PR localement :

1. Lisez d'abord le diff de `scripts/`, `package.json`, les lockfiles,
   `vitest.config.ts` et `test/` — c'est là que vit ce qui s'exécute tout seul.
2. Faites-le dans un conteneur ou une VM jetable, sur un clone **sans `.env`**.
3. À défaut, retirez `.env` du dossier le temps de l'essai. Un `.env.example`
   suffit à faire tourner la suite : elle est pure, elle ne parle à rien.

## La CI est le pipeline

[.github/workflows/ci.yml](.github/workflows/ci.yml) joue, sur chaque pull
request et chaque push sur `main`/`production` :

- `pnpm run check:public-repo`
- `pnpm run lint`
- `pnpm run typecheck`
- `node scripts/build-desktop.mjs`
- `pnpm run test`
- `node scripts/audit.mjs` — vulnérabilités high/critical sur les **trois**
  lockfiles du dépôt (`pnpm-lock.yaml`, `package-lock.json`,
  `desktop/package-lock.json`), arbre entier

Le workflow se déclenche sur `pull_request` et **jamais** sur
`pull_request_target` : le job qui exécute du code de fork tourne sans accès aux
secrets du dépôt, avec un `GITHUB_TOKEN` en lecture seule. Aucun `secrets.*` ne
doit apparaître dans ce fichier. Un job qui a besoin d'un secret est un job qui
ne doit pas exécuter du code de PR.

[`deploy.sh`](deploy.sh) est une aide locale de release : elle rejoue les
garde-fous et vérifie la CI du commit à publier. Ses conventions de branches et
d'hébergement sont à adapter à chaque instance ; la CI ci-dessus reste le
pipeline versionné commun.

## Préparer une pull request

1. Partez d'une branche à jour et gardez un seul objectif par pull request.
2. Ajoutez ou adaptez les tests, la documentation et les catalogues de langue.
3. Exécutez `pnpm lint`, `pnpm typecheck` et `pnpm test` dans un environnement
   sans secret.
4. Décrivez le pourquoi, les changements, les vérifications, les risques et la
   licence de toute nouvelle dépendance ou ressource dans le modèle de PR.
5. Signez chaque commit avec `git commit -s`.

Une contribution externe est d'abord relue sans exécuter son code. Un
mainteneur autorise ensuite la CI du fork, demande les corrections nécessaires
et vérifie le DCO, les checks et les conversations avant fusion. Une approbation
code owner est obligatoire ; l'auteur n'approuve pas sa propre PR. La fusion se
fait par squash. Les mainteneurs peuvent refuser un changement hors périmètre,
insuffisamment sûr ou dont le coût de maintenance dépasse le bénéfice, même si
son implémentation fonctionne.

## Travailler dans le dépôt

- **Gestionnaire de paquets : pnpm.** C'est lui qui installe réellement
  (`node_modules` est un store pnpm). Le dépôt tient aussi un
  `package-lock.json` : après un `pnpm add`, resynchroniser avec
  `npm install --package-lock-only --legacy-peer-deps` (un conflit de peers
  tiptap préexistant bloque npm sans ce drapeau).
- **Un comportement neuf vient avec son test.** `npx vitest run` (18 s).
  Le typecheck ne le remplace pas.
- **Chaînes visibles** : elles passent par next-intl et vivent en double dans
  `messages/en.json` et `messages/fr.json`, avec les mêmes clés et les mêmes
  placeholders. Après y avoir touché : `npx vitest run lib/i18n-contract.test.ts`.
- Les conventions détaillées du dépôt sont dans [CLAUDE.md](CLAUDE.md), son
  architecture de sécurité dans [SECURITY.md](SECURITY.md).

Les mises à jour de dépendances suivent [GOVERNANCE.md](GOVERNANCE.md) : origine
et licence vérifiées, lockfiles synchronisés, aucune fusion automatique d'une
version majeure, CI et audit high/critical obligatoires.

## Signaler une faille

Ne pas ouvrir d'issue publique : écrire au contact indiqué en fin de
[SECURITY.md](SECURITY.md), qui décrit aussi la procédure d'incident.
