---
name: changelog
description: Ajoute une entrée au changelog public de minddy (/changelog, /fr/nouveautes et son flux RSS) à partir de ce qui a été livré depuis la dernière entrée. Une entrée = UNE nouveauté, dite simplement. Utiliser quand l'utilisateur tape `/changelog`, dit "ajoute une nouveauté", "publie un changelog", "note ça dans les nouveautés", ou vient de finir une feature visible.
---

# /changelog — Ajouter une nouveauté à minddy

Tu écris **une** entrée du changelog public de minddy, à partir de ce qui a été
livré depuis la dernière. Parle français à l'utilisateur ; écris l'entrée en
anglais ET en français, le site est bilingue et l'anglais est canonique.

---

## La règle qui gouverne tout : une entrée = une nouveauté

C'est la différence avec le changelog d'AutoKap, qui agrège des cards par
livraison. Ici, une entrée raconte **une seule chose**, en un titre et deux ou
trois phrases. Si trois choses ont été livrées, ce sont trois entrées, ou une
seule si les deux autres ne méritent pas d'être racontées.

Le doute se tranche toujours dans le même sens : **une entrée de moins**. Un
changelog qui liste tout est un journal de commits, et personne ne lit un
journal de commits.

---

## Ce que produit une entrée, sans rien câbler

Une entrée écrite ici apparaît, au prochain déploiement :

- sur `/changelog` et `/fr/nouveautes`, avec sa date ;
- dans le flux RSS des deux langues ;
- dans la version Markdown servie aux agents (`Accept: text/markdown`) ;
- dans le `lastModified` de la page au sitemap — c'est la seule page du site
  dont la fraîcheur est dérivée, et c'est le premier critère de Perplexity ;
- dans le ping IndexNow de `deploy.sh`, qui prévient Bing (donc ChatGPT Search).

Tu n'as donc **rien d'autre à modifier** que ce que fait le script.

---

## Étape 1 — Trouver ce qui a été livré

**Borne basse** : la date de la première entrée de `lib/changelog.ts` (la liste
est triée du plus récent au plus ancien).

```bash
head -20 lib/changelog.ts | grep -m1 'date: "'
```

**Les issues passées à `done`** sur le projet minddy, via le MCP minddy
(`minddy_list_issues` avec `status: ["done"]`). C'est la meilleure source : une
issue dit ce qui a été voulu, un commit dit ce qui a été tapé.

**Les commits**, en complément, pour ce qui a été livré sans issue :

```bash
git log --since="AAAA-MM-JJ" --no-merges --pretty=format:"%ad %s" --date=short
```

Ne fais pas confiance aux messages : un `refactor:` peut cacher un vrai
changement visible, et un `feat:` être purement interne.

## Étape 2 — Choisir

Garde ce qu'un utilisateur **voit ou peut faire de nouveau**. Écarte, sans le
proposer :

- refactos, dette technique, tests, CI, migrations ;
- performance, sauf si elle change l'usage — « la page s'ouvre plus vite sur un
  téléphone » se raconte, « le bundle perd 40 Ko » non ;
- analytics, tracking, SEO technique, infrastructure ;
- sécurité et correctifs de vulnérabilité : **jamais**, dans aucune formulation ;
- réglages internes, dashboard d'administration, outillage.

S'il ne reste rien, dis-le et n'écris pas d'entrée. C'est un résultat valide.

## Étape 3 — Rédiger

Regarde les entrées existantes dans `messages/en.json` → `Changelog` avant
d'écrire : elles donnent le ton mieux que n'importe quelle consigne.

**Le titre** — une phrase courte qui dit ce qu'on peut faire, pas un nom de
fonctionnalité. 70 caractères maximum.

- ✅ « Search issues and objectives from anywhere »
- ✅ « Launch an agent from the task notebook »
- ❌ « Recherche globale » (un nom, pas une nouvelle)
- ❌ « Nouvelle fonctionnalité : la recherche » (« nouvelle » est implicite)

**Le corps** — deux ou trois phrases, 320 caractères maximum. Ce qui change pour
la personne qui l'utilise, et rien sur la façon dont c'est fait.

- ✅ « Chaque tâche finie passe à fait dans le ticket. Vous suivez sans rien
  demander. »
- ❌ « L'agent appelle `minddy_update_plan_task` pour basculer l'état de la
  case. » (personne ne s'en soucie)
- ❌ « Liste produite par le serveur lui-même, donc impossible à désynchroniser. »
  (de l'auto-satisfaction d'ingénieur ; ça se dit dans un commentaire de code)

**Les règles de la maison**, non négociables :

- **Aucun tiret cadratin.** Nulle part sur la surface publique. Deux-points,
  point ou virgule. Le script refuse l'entrée sinon.
- Pas de jargon interne : ni MCP tool, ni RSC, ni Supabase, ni Vercel. Les noms
  produit se disent (ticket, plan, cycle, bloc-notes, board de feedback, Numo,
  serveur MCP).
- Pas de raccourci clavier dans la copie publique.
- Pas d'emoji, pas de markdown, pas de superlatif marketing.
- Vouvoiement en français, comme le reste du site public.

**L'identifiant** — kebab-case, court, stable : il sert de clé i18n, d'ancre
d'URL (`/changelog#mon-id`) et de `guid` RSS. Un `guid` qui change republie
l'entrée chez tous les abonnés, donc on ne le renomme jamais après coup.

## Étape 4 — Faire valider

Montre l'entrée à l'utilisateur en français, dans les deux langues, avant
d'écrire quoi que ce soit. Utilise `--dry-run` pour l'afficher telle qu'elle
sera :

```bash
node scripts/changelog-add.mjs --dry-run --id <id> \
  --title-en "…" --body-en "…" --title-fr "…" --body-fr "…"
```

Itère jusqu'à validation explicite. S'il y a plusieurs entrées à écrire,
présente-les toutes, puis écris-les une par une.

## Étape 5 — Écrire et vérifier

```bash
node scripts/changelog-add.mjs --id <id> \
  --title-en "…" --body-en "…" --title-fr "…" --body-fr "…"

npx vitest run lib/changelog.test.ts
```

Le script écrit dans `lib/changelog.ts`, `messages/en.json` et
`messages/fr.json`, et refuse : un identifiant déjà pris, une date antérieure à
la dernière entrée, un tiret cadratin, un texte trop long, un champ manquant.

`--date` vaut aujourd'hui. Ne la mets à la main que si le déploiement a eu lieu
un autre jour : c'est cette date qui pilote la fraîcheur du sitemap.

Puis dis à l'utilisateur que c'est à lui de committer — il commit ses chantiers
lui-même.

---

## Vérifier le rendu, si besoin

```bash
npm run build && npx next start -p 3111
curl -s -H "Accept: text/markdown" http://localhost:3111/changelog | head -20
curl -s "http://localhost:3111/changelog/rss.xml?locale=fr" | head -20
```

La page est à `http://localhost:3111/changelog` et `/fr/nouveautes`. Le flux
s'affiche habillé dans un navigateur — il a sa feuille de style CSS
(`rss.css/route.ts`), et il est servi en `text/xml` pour que le navigateur le
parse ; ne repasse pas ce type en `application/rss+xml`, Chrome cesserait alors
de l'afficher autrement qu'en balisage brut.

## Ce que ce skill ne fait pas

- Il ne bumpe **aucune version** et ne pose aucun tag git.
- Il ne déploie pas, et ne commit pas.
- Il ne touche pas aux `lastModified` de `lib/public-routes.ts` : celui du
  changelog est dérivé de la première entrée, les autres se tiennent à la main
  page par page (voir `CLAUDE.md`).
