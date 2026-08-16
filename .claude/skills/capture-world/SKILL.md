---
name: capture-world
description: Crée et maintient le compte de démo de minddy et ses données, dans la base de production, sous garde-fous stricts. Utiliser quand une capture a besoin de données qui n'existent pas encore (un board rempli, plusieurs membres, des tickets de priorités variées), ou quand il faut inspecter/nettoyer le monde de démo. Ne pas utiliser pour prendre une capture — c'est capture-shot.
---

# capture-world

Le monde de démo est un compte réel de minddy, sur la base de **production**,
dont les données sont créées délibérément pour être photographiées. Ce skill
le crée, le fait grandir, et tient son registre.

## La base est celle de production. Lis ça avant tout.

Il n'y a pas de Supabase locale sur ce projet. Chaque insertion touche la vraie
base, à côté de vrais utilisateurs. Les règles ci-dessous ne sont pas des
conseils.

**L'invariant, et il tient en une phrase :** aucune écriture ne peut atteindre
une ligne qui n'appartient pas au monde de démo.

Ce n'est pas « on n'écrit que des INSERT ». Corriger le titre d'un ticket de
démo, changer son statut pour équilibrer un board, retirer trois tickets en
trop : tout ça est normal et prévu (`plan.update()`, `plan.remove()`). Les
lignes visées sont relues et vérifiées avant qu'on y touche. Tu n'as pas besoin
de tout détruire et de tout recréer pour une correction.

**Interdits absolus, sans exception ni demande possible :**

- Aucune réinitialisation de base. Jamais. Aucun `db reset`, aucun `truncate`,
  aucune migration rejouée, aucun script de reseed global.
- Aucun SQL arbitraire, aucun accès psql, aucune RPC hors liste blanche.
- Aucun appel à l'API HTTP de l'app pour créer de la donnée. Passer par
  `/api/...` déclencherait le Smart Assign (un appel IA facturé), les
  notifications, les events PostHog et les emails Resend. On écrit en base.
- Aucune écriture qui rattacherait quoi que ce soit à un utilisateur réel ou à
  un projet réel.

**Passage obligé :** toute écriture passe par `captures/lib/guards.mjs`. Tu
n'importes jamais `@supabase/supabase-js` directement dans un script de seed —
`createDemoUser()` couvre même la création de compte. Le module valide, mesure
ce qui bouge hors périmètre, et refuse d'écrire sans confirmation.

## Demander avant de créer

Avant toute insertion, tu présentes à l'utilisateur **en français et sans
jargon technique** :

1. **quelles données** tu vas créer, listées et lisibles ;
2. **pourquoi**, c'est-à-dire quelle capture en a besoin et ce qu'elle doit
   montrer ;
3. **ce que ça change** pour lui : rien n'est visible par d'autres comptes,
   rien n'est envoyé, rien n'est facturé.

Tu ne parles ni de tables, ni de colonnes, ni de clés étrangères. Tu dis
« 12 tickets dans un projet de démo, dont 3 urgents et 2 assignés à Alice »,
pas « INSERT INTO issues ».

Puis tu attends une réponse claire. Un silence, un « ok vas-y » sur autre
chose, ou une approbation d'un plan différent ne valent pas accord.

## Procédure

### 1. Lire l'état avant d'agir

Toujours interroger l'environnement de démonstration avant d'agir. Si la donnée
requise existe déjà, il n'y a rien à créer : tu le dis et tu t'arrêtes.

### 2. Créer le compte, si c'est la première fois

```js
import { createDemoUser } from "../../lib/guards.mjs";
const user = await createDemoUser({ password, fullName: "Camille Roy", confirmed: true });
```

`createDemoUser` est idempotent : relancé, il renvoie le compte existant. Il
refuse tout email hors motif de démo.

Le mot de passe est généré, puis **tu demandes à l'utilisateur de le coller
lui-même** dans `.env` sous `CAPTURES_DEMO_PASSWORD`. Tu ne l'écris nulle part
ailleurs, ni dans un fichier versionné, ni dans le registre.

Des membres secondaires (pour les écrans à plusieurs personnes) suivent le même
motif : `captures-demo+alice@minddy.app`. Ils sont couverts par les mêmes
garde-fous parce que le motif les reconnaît.

### 3. Écrire un script de seed

Un fichier par ajout, numéroté, dans `captures/world/seed/` :
`001-projet-mdy.mjs`, `002-tickets-board.mjs`…

Le script est **idempotent** : relancé, il ne duplique rien. Il lit l'état
existant, ne crée que ce qui manque.

Le squelette est toujours le même :

```js
import { openDemoWorld, createPlan, callRpc } from "../../lib/guards.mjs";

const world = await openDemoWorld();
const plan = createPlan(world);

plan.insert("issues", rows, "ticket");
plan.update("issues", { id }, { status: "in_review" }, "ticket à passer en revue");
plan.remove("issues", { id }, "ticket en trop");

console.log(plan.describe());   // à montrer à l'utilisateur
await plan.apply({ confirmed: true });  // seulement après son accord
```

`confirmed: true` n'est écrit qu'après l'accord réel de l'utilisateur. Ce n'est
pas une formalité de code, c'est la trace de son consentement.

### 4. Respecter le schéma réel

Valeurs autorisées, définies dans `captures/lib/config.mjs` et vérifiées par
des contraintes CHECK en base :

| Champ | Valeurs |
|---|---|
| `issues.status` | `backlog` `todo` `in_progress` `in_review` `done` `canceled` |
| `issues.priority` | `none` `urgent` `high` `medium` `low` |
| `issues.effort` | `xs` `s` `m` `l` `xl` |

Les numéros de tickets (`issues.number`) viennent de la RPC
`next_issue_number(p_project_id)`, jamais d'un compteur local : elle est atomique
et alimente l'identifiant affiché `CLÉ-42`. Elle est sur liste blanche et vérifie
que le projet visé est bien un projet de démo.

Un projet a besoin de `owner_id`, `name`, `key`. La clé doit être unique parmi
les projets vivants du même propriétaire.

### 5. Documenter le seed sans données de production

Dans le **même commit** que le script de seed, expliquer son objectif et les
données de démonstration qu'il crée dans le README du dossier de seeds. Ne
consigner ni identifiant de compte vivant, ni adresse e-mail, ni état de la base
de production dans le dépôt.

### 6. Vérifier

Après application, `guards.mjs` a déjà comparé les compteurs hors périmètre.

- **« des lignes hors démo ont DISPARU »** : arrête tout immédiatement et
  préviens l'utilisateur avec le détail. Ne tente aucune correction, aucun
  rollback, aucune suppression : le diagnostic passe avant le geste.
- **« activité concurrente »** : simple information. Un vrai utilisateur a créé
  quelque chose pendant le run. Ça n'a aucun rapport avec nous, continue.

## Corriger et nettoyer

Une correction ponctuelle ne demande pas de tout refaire : `plan.update()` et
`plan.remove()` visent des lignes de démo précises, après relecture et
vérification. C'est la voie normale pour rééquilibrer un board ou retirer un
ticket qui ne rend pas bien à l'image.

`deleteDemoWorld()` est l'option lourde : elle supprime le compte de démo, et
les clés étrangères nettoient projets et tickets en cascade. Elle refuse tout
compte dont l'email ne correspond pas au motif. Elle demande une confirmation
explicite de l'utilisateur, formulée par lui, dans le message courant.

## Ce que ce skill ne fait pas

- Il ne prend aucune capture. C'est `capture-shot`.
- Il ne touche à aucun code de l'application.
- Il ne crée pas de clips ni de vidéos : hors périmètre, définitivement.
