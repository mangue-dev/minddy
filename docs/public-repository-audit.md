# Audit de publication du dépôt

Date : 16 août 2026. Portée : branche `main`, branche `production`, remotes de
suivi, et objets Git locaux inaccessibles. Ce document est un état d'audit ; il
ne vaut ni avis juridique ni révocation effective d'un secret.

## Résultat

**Réécriture locale effectuée, publication non encore poussée.** Le contrôle
automatisé doit être relancé après suppression des refs de sauvegarde locales et
purge des objets ; les branches et tags réécrits seront alors les seules refs à
vérifier avant tout push vers un dépôt public.

Le scan n'a pas identifié de clé privée ni de jeton actif correspondant aux
motifs GitHub, OpenAI, Anthropic, Slack, AWS ou Google dans l'arbre courant. Les
chaînes ressemblant à des secrets des tests et de `scripts/extract-apns-secret.mjs`
sont volontairement ignorées : elles servent à vérifier la détection et ne sont
pas des identifiants opérationnels. Une recherche textuelle trouve des URLs de
loopback et des noms de services dans la documentation et les tests ; elles sont
nécessaires au développement local et ne sont pas des URLs d'infrastructure
interne publiée.

## Historique à assainir

Les chemins ci-dessous sont encore atteignables depuis les refs et font échouer
`npm run check:public-repo` :

- `.claude/launch.json` et `.claude/settings.json` ; le premier contenait un
  chemin absolu de poste de travail ;
- `MIN-102-plan.md`, `MIN-184-plan.md`, `copy-audit*.{json,md}`, `dev.log` et
  `problems.md` ; documents et journaux de travail internes ;
- `captures/world/world.md` ; état de capture privé ;
- `docs/audits/securite-2026-08-05.md`, `docs/desktop-signing.md` et
  `docs/rgpd/registre-des-traitements.md` ; documentation interne ;
- une ancienne version de `scripts/seed-inbox.mjs` contenant un identifiant de
  compte par défaut.

La suppression de `.claude/launch.json` de l'arbre courant est incluse dans ce
changement. Le 16 août 2026, les branches locales, refs `origin/*` suivies et
tags ont été réécrits avec `git filter-branch` afin de retirer chaque chemin
listé, ainsi que toutes les versions historiques de `scripts/seed-inbox.mjs`.
La version actuelle du script, qui exige un UUID passé en argument, est ensuite
réintroduite. Une sauvegarde miroir pré-réécriture est conservée hors du dépôt
à publier dans `/private/tmp/minddy-before-public-history-rewrite-20260816.git`.

Les métadonnées Git exposent aussi les identités d'auteur suivantes : Clément
Guérin (`81526886+mangue-dev@users.noreply.github.com`), mangué (adresse GitHub noreply), `minddy
agent` et `minddy-app[bot]`. Elles ne sont pas des secrets, mais constituent des
données personnelles ou des attributions : les personnes concernées doivent
confirmer leur publication. Les messages de commit contiennent du contexte de
produit ; ils sont inclus dans le périmètre de relecture humaine avant export.

## Procédure de réécriture et de révocation

1. Avant toute réécriture, déterminer si l'identifiant de seed a jamais été
   actif. S'il l'a été, le désactiver/faire tourner côté fournisseur avant de
   publier : retirer un texte Git ne révoque rien.
2. Cloner un miroir de sauvegarde hors du dépôt de publication et geler les
   pushes. Lister les refs à conserver avec `git for-each-ref`.
3. Sur une copie de travail, employer `git filter-repo` (ou BFG après revue) pour
   supprimer les chemins listés ci-dessus de **toutes** les refs destinées à être
   publiées. Si l'identifiant de seed doit rester dans le code, le remplacer par
   une valeur de fixture clairement synthétique avant réécriture.
4. Vérifier `git log --all`, `git fsck --full --no-reflogs --unreachable` et
   `npm run check:public-repo`; ne pousser que les refs nettoyées avec
   `--force-with-lease` après avoir averti les contributeurs. Invalider tags,
   caches, forks et archives qui exposeraient les anciens SHA.
5. Dans chaque clone contrôlé, expirer les reflogs puis purger :
   `git reflog expire --expire=now --all` et `git gc --prune=now`. Ces commandes
   sont destructrices : ne les lancer qu'après validation de la sauvegarde.

Les objets inaccessibles observés localement ne sont pas envoyés par un push
ordinaire, mais ils doivent être purgés avant de transférer un dossier `.git`,
de créer un bundle ou de remettre une archive de dépôt.

## Inventaire de l'arbre actuel

| Élément | Constat | Décision avant publication |
| --- | --- | --- |
| `captures/world/seed/` et `captures/shots/` | Données/captures de démonstration suivies, dont JSONL, markdown et images. | Vérifier manuellement qu'elles ne représentent que des comptes, emails, projets et avatars fictifs. |
| `public/captures/` | 32 captures WebP destinées au site public. | Confirmer leur origine synthétique et l'absence de données réelles. |
| `public/agents/*.svg`, `public/import/*.svg` | Logos de produits et services tiers. | Obtenir/archiver l'autorisation ou remplacer par des pictogrammes génériques ; les marques ne sont pas concédées par l'AGPL. |
| `public/logo.svg`, icônes `app/` et `desktop/build/` | Assets de marque minddy. | Le titulaire doit confirmer qu'il en possède les droits ; documenter la politique de marque séparée. |
| `app/fonts/inter-arrows.woff2` | Police Inter, avec `app/fonts/LICENSE-Inter.txt`. | Conserver la notice SIL OFL-1.1 lors de toute distribution. |
| `.claude/` et `CLAUDE.md` | Instructions/outils de développement suivis. | Revoir licence et confidentialité avant maintien public ; `launch.json` a été retiré car il divulguait un chemin local. |

Les documents RGPD encore suivis (`docs/rgpd/`) doivent être relus pour confirmer
qu'ils décrivent des procédures génériques et non des sous-traitants, contacts ou
configurations non destinés au public.

## Licences et chaîne de droits

Le projet déclare `AGPL-3.0-only` dans `package.json`; `LICENSE`, `NOTICE` et
`docs/licensing.md` conservent la notice MIT historique, l'attribution des
contributeurs connus, la politique DCO et la notice Inter. Cette architecture est
compatible avec la publication sous AGPL, à condition que les contributeurs
historiques aient bien autorisé leur contribution sous cette licence ou que leur
code soit retiré/relicencié.

L'inventaire des dépendances est verrouillé dans `pnpm-lock.yaml` et
`package-lock.json`. La politique existante recense MIT, Apache-2.0, ISC, BSD,
MPL-2.0 et LGPL-3.0-or-later (notamment via `sharp`) et ne signale pas de
GPL-2.0-only. Ces licences sont en principe compatibles avec la distribution
AGPL du projet, sous réserve de conserver les notices et de respecter les
obligations de la LGPL/MPL pour les composants concernés. La commande
`pnpm licenses list --json` n'a pas pu produire l'inventaire exhaustif dans cet
environnement car l'index du store pnpm est incomplet ; la CI de publication doit
l'exécuter depuis une installation propre et archiver son résultat avec le tag.

## Contrôle permanent

`scripts/check-public-repo.mjs` contrôle l'index, les chemins interdits et les
motifs de secrets. Hors mode `--staged`, il inspecte aussi chaque blob atteignable
depuis les branches, tags et refs `origin/*`, afin qu'un secret supprimé de HEAD
reste bloquant tant que l'historique publiable n'est pas nettoyé. Les checkpoints
locaux sous `refs/codex/*` ne sont pas inclus : ils ne font pas partie d'un push
standard et ne doivent jamais être exportés avec `git push --mirror` ou une copie
du dossier `.git`. Le mode
`--staged` reste volontairement limité aux changements candidats : il est adapté
au hook local ; la CI doit exécuter la commande sans option.
