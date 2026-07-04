# minddy — Plan de cadrage

> Issue tracking simplifié. Une interface sobre, un seul moyen de faire les choses.
> Ce document est le résultat de la session de cadrage — il décrit **comment minddy doit marcher**,
> le modèle de données qui en découle, et le périmètre v1 vs différé.

---

## 1. Vision & positionnement

minddy est un outil d'issue tracking **volontairement opinionated et minimal**, à contre-courant de la
flexibilité de Linear/Jira. Le principe directeur : **un seul moyen de faire chaque chose**. Pas de
config à rallonge, pas de workflows personnalisables, pas de statuts sur mesure. La valeur est dans la
sobriété et la prévisibilité.

Référence de conception (logique **et** interface) : **AutoKap** (repo `screenshot-agent`). On clone ses
patterns d'architecture et on réutilise **mangue-ui** pour toute la coquille UI.

---

## 2. Concepts & vocabulaire

Le mot « projet » désignait deux choses — c'est désormais tranché :

| Terme (UI) | Ce que c'est | Analogie Linear |
|---|---|---|
| **Projet** | Le **workspace**, l'unité de base. Les issues, membres, catégories y sont scopés. Sans Projet, l'utilisateur ne peut rien faire. | Team / Workspace |
| **Objectif** | Un **groupe d'issues** d'un Projet partageant un but commun (« Refactor UI »). Une « grosse issue ». | Project |
| **Issue** | L'unité de travail atomique. | Issue |
| **onglet** | Le niveau de nav haut dans un Projet : *My issues*, *All issues*, *Objectifs*. | Vue de section |
| **Vue** | Une « tab » sauvegardée **dans** un onglet issues = un kanban avec ses filtres + son tri. | Saved view |
| **Triage** | Une **zone d'arrivage** de proto-issues non traitées (pas un statut). Différé (voir §8). | Triage |

Convention code : garder des noms techniques non ambigus (ex. `project` = Projet, `objective` = Objectif)
pour ne jamais confondre les deux niveaux.

---

## 3. Stack technique

Clone de la stack AutoKap, sur une **instance Supabase séparée** (auth propre à minddy — un utilisateur
minddy n'est pas partagé avec AutoKap).

- **Front** : Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · **mangue-ui**
- **Données** : Supabase (Postgres) · **Supabase Auth** (email/password + OAuth Google/GitHub)
- **Multi-tenant** : RLS Postgres + fonctions `SECURITY DEFINER` (`can_access_project()`-style), calqué
  sur AutoKap (`project_members`, `project_invitations`, owner = `projects.user_id`)
- **Data client** : TanStack React Query + **Supabase Realtime** (mutations optimistes, patch du cache en live)
- **API** : route handlers sous `app/api/*` (pas de server actions pour les mutations)
- **Ajouts spécifiques minddy** : **dnd-kit** (drag & drop du kanban)

Fichiers AutoKap à mirrorer : `web/lib/migrations/001_create_projects.sql`,
`016_create_project_collaboration.sql`, `026_create_project_invitations.sql`,
`web/lib/server/project-access.ts`, `web/app/api/projects/route.ts`.

---

## 4. L'issue en détail

Champs d'une issue :

| Champ | Type / valeurs | Notes |
|---|---|---|
| **Titre** | texte, obligatoire | |
| **Description** | rich-text (markdown) | commandes `/` plus tard |
| **Identifiant** | `CLÉ-numéro` (ex. `MIND-42`) | clé du Projet + compteur **par Projet** |
| **Statut** | **figé** : `Backlog · Todo · In Progress · In Review · Done · Canceled` | = colonnes du kanban. Non personnalisable. |
| **Assigné** | **1 seul** membre (ou aucun) | responsabilité claire |
| **Priorité** | `Aucune · Urgent · Haute · Moyenne · Basse` | figé |
| **Effort** | `XS · S · M · L · XL` | figé (t-shirt) |
| **Catégories** | multi-select | **personnalisables par Projet** (créer/éditer/supprimer dans ses paramètres), partagées par tous ses membres |
| **Objectif** | 0 ou 1 | lien optionnel |
| **Due date** | date, optionnelle | dispo dès v1 |
| **Parent** | `parent_id` (self-FK) | sous-issues, **1 seul niveau** |
| **Commentaires** | fil par issue, rich-text markdown | activé surtout quand le Projet est partagé |
| Méta | `created_by`, `created_at`, `updated_at`, `position` | `position` = ordre manuel dans une colonne |

**Sous-issues** : une sous-issue est une **issue à part entière** (identifiant, statut, assigné propres),
elle apparaît sur le kanban comme les autres. Le parent affiche la liste de ses enfants + une **barre de
progression** (X/Y done). Une sous-issue hérite par défaut de l'Objectif du parent (modifiable).
Supprimer un parent **détache** ses enfants (ne les supprime pas). Imbrication limitée à un niveau.

---

## 5. Navigation & Vues

### Structure dans un Projet ouvert

```
Projet  ┌─ My issues       ← onglet, seulement si le Projet est partagé · pré-filtré assigné = moi
        ├─ All issues      ← onglet, toujours dispo · toutes les issues du Projet
        ├─ Objectifs       ← liste des objectifs
        ├─ Paramètres      ← catégories, membres, clé, nom
        └─ (Triage)        ← différé, voir §8
```

### Les Vues (tabs dans un onglet issues)

Une **Vue** = un kanban sauvegardé avec ses **filtres** + son **tri**. Règles :

- **`All issues` → Vues partagées** par tout le Projet (process d'équipe commun). N'importe quel membre
  peut créer/modifier une Vue partagée (pas de droits fins en v1).
- **`My issues` → Vues personnelles** à chaque membre (toutes implicitement filtrées sur assigné = moi).
- Chaque onglet démarre sur une **Vue par défaut non supprimable** (« Toutes »).
- **Le kanban regroupe TOUJOURS par statut.** Une Vue ne fait que **filtrer** (statut, priorité,
  catégorie, assigné, objectif, effort) et **trier** — jamais regrouper autrement. UI prévisible.
- Options d'affichage d'une Vue : masquer les issues `Done`, afficher/masquer les sous-issues, etc.

### Portée

Tout est **scopé au Projet courant** en v1. Pas de vue « Mes issues » globale (cross-projet) — envisagée
plus tard au niveau Home.

---

## 6. Objectifs

Un Objectif = un groupe d'issues avec un but commun.

| Champ | Valeurs |
|---|---|
| **Nom** | obligatoire |
| **Description** | rich-text |
| **Statut** | figé : `Planifié · En cours · Terminé · Annulé` |
| **Lead** | 1 membre responsable (optionnel) |
| **Date cible** | optionnelle |
| **Couleur / icône** | optionnelle (repérage visuel) |
| **Progression** | **auto** = issues `Done` / total des issues liées (barre) |

- **Onglet Objectifs** = une **liste simple** (nom, statut, progression, lead, nb d'issues). Pas de
  système de Vues/tabs ici.
- **Cliquer un Objectif** → ouvre le board `All issues` **filtré** sur cet objectif. Ce board filtré
  porte un **bandeau d'en-tête** : nom, statut, progression, lead, date cible + bouton **Éditer**
  (dialog/SidePanel pour name/description/lead/date/statut/couleur).
- **Créer un Objectif** = un dialog.

---

## 7. Création & interactions

- **Créer une issue** : bouton « Nouvelle issue » + raccourci **`C`** → **dialog de création rapide**
  (titre focus, statut/priorité/assigné/objectif optionnels en inline, création au clavier). L'issue peut
  ensuite s'ouvrir en **SidePanel** pour la détailler.
- **Détail d'une issue** : s'ouvre dans le **SidePanel** (`SidePanel` de mangue-ui), jamais en pleine page.
  Contient tous les champs méta + le fil de **commentaires** + la liste des **sous-issues** avec
  progression. une **timeline unifiée** en bas : **journal d'activité + commentaires** entrelacés chronologiquement
  (voir « Journal d'activité » ci-dessous).
- **Drag & drop** (dnd-kit) : glisser une carte entre colonnes change son statut ; ordre manuel dans une
  colonne via `position`.
- **Temps réel** : le board se met à jour en live (Supabase Realtime).
- **Clavier — niveau modéré** : ⌘K (recherche d'issue par titre/identifiant via `CommandMenu`) + quelques
  raccourcis clés (`C` créer, `échap` fermer, navigation flèches). Pas de clavier-first intégral en v1.

### Journal d'activité (timeline)

Chaque issue garde une **trace de tous ses événements**, affichée comme une timeline dans le SidePanel,
**entrelacée avec les commentaires** (façon Linear).

- **Événements tracés** : création, changement de titre, description, statut, priorité, effort, assigné,
  objectif, due date, catégorie (ajout/retrait), parent, ajout/retrait d'une sous-issue.
- **Stockage** (`issue_events`) : `type`, `field`, `from_value`, `to_value`, `actor_id`, `created_at`.
- **Génération** : côté serveur dans les route handlers de mutation (diff avant/après = source unique
  d'écriture ; triggers Postgres en alternative si on veut être exhaustif).
- **Description** : comme elle peut être volumineuse, on enregistre seulement l'événement
  « description modifiée » (sans stocker le diff complet) en v1. Les autres champs stockent `from`/`to`.
  Le versioning/diff complet de la description reste différé.

---

## 8. Triage (différé)

Le Triage est une **zone d'arrivage** : un item de triage est un **proto-issue** léger (titre +
description, sans statut/assigné/priorité) qui devient une vraie issue quand un humain le **traite**
(Accepter → pose statut/priorité/assigné/objectif · Rejeter · Fusionner en doublon).

**Décision de périmètre** : une issue créée par un membre **naît directement sur le board** (pas via le
Triage). Les seules sources qui alimentent le Triage sont **Numo** (§9) — qui vient plus tard. **Le Triage
est donc de fait un concept v2.** On réserve sa place dans le modèle de données (proto-issue) mais on ne
construit **aucune** logique de capture ni d'onglet Triage en v1.

---

## 9. Collaboration

- **Rôles** : **owner** (créateur, = `projects.user_id`) + **member** (invité par email). Deux rôles
  seulement.
  - *member* : tout le travail quotidien (créer/éditer/supprimer issues, objectifs, catégories, Vues partagées).
  - *owner* uniquement : renommer/supprimer le Projet, gérer membres/invitations, changer la clé.
- **Invitations** : par email, calqué sur AutoKap (`project_invitations` : pending → accepted/rejected).
- **Inbox / notifications** — déclencheurs v1 :
  1. Une **issue m'est assignée**
  2. On me **@mentionne** dans un commentaire
  3. **Nouveau commentaire** sur une issue que je porte (assignée à moi ou créée par moi)

  (Les changements de statut ne notifient **pas** en v1.)

- **Home (hors Projet)** : calque la `HomeSidebar` d'AutoKap — liste/switcher de **Projets** + bouton
  « nouveau Projet » + **Inbox** + menu compte. Créer un Projet demande **nom** + **clé** (ex. `MIND`) ;
  le reste (catégories, membres) se configure après. Un utilisateur sans aucun Projet est invité à en
  créer un (il ne peut rien faire d'autre).

---

## 10. Numo (assistant IA) — roadmap

Numo est l'assistant IA de minddy : il pourra **créer, modifier, chercher** des issues et **créer des
Objectifs** en langage naturel. Coquille UI déjà disponible dans mangue-ui (`NumoChat`). Les issues
créées par Numo atterriront en **Triage** pour validation humaine avant d'entrer sur le board.
**Différé post-v1** (probablement via AI SDK + tool-calling sur les mêmes route handlers).

---

## 11. Modèle de données (proposition)

Tables Postgres (Supabase), toutes protégées par RLS via `can_access_project(project_id)` :

```
projects
  id, owner_id (auth.users), name, key (unique/owner), color, created_at, updated_at, deleted_at

project_members
  project_id, user_id, role ('member'), added_by, created_at        PK(project_id, user_id)

project_invitations
  id, project_id, invited_email, invited_user_id, invited_by, status, created_at, responded_at

categories                       -- les "labels", scopés au Projet
  id, project_id, name, color, created_at

objectives
  id, project_id, name, description, status, lead_user_id, target_date, color,
  created_at, updated_at

issues
  id, project_id, number (compteur/Projet), title, description,
  status, priority, effort, assignee_id, objective_id, parent_id (self-FK),
  due_date, position, created_by, created_at, updated_at, completed_at

issue_categories                 -- N–N issues ↔ categories
  issue_id, category_id                                             PK(issue_id, category_id)

comments
  id, issue_id, author_id, body, created_at, updated_at

issue_events                     -- journal d'activité (timeline)
  id, issue_id, actor_id, type, field, from_value, to_value, created_at

views                            -- Vues sauvegardées
  id, project_id, onglet ('my'|'all'), user_id (NULL si partagée),
  name, filters (jsonb), sort, position, created_at

notifications                    -- Inbox
  id, user_id, project_id, type, issue_id, comment_id, actor_id, read_at, created_at
```

Identifiant d'issue : `projects.key` + `issues.number` (compteur incrémenté par Projet, façon AutoKap).

---

## 12. Périmètre v1 vs différé

| Dans la v1 | Différé (v2+) |
|---|---|
| Projets (workspace) + membres + invitations | Rôle Viewer / droits fins |
| Issues complètes + sous-issues + **journal d'activité** | Versioning/diff complet de la description |
| Kanban DnD par statut + ordre manuel | Triage (capture) + Numo |
| onglets My/All + Vues (partagées/perso) | Vue « Mes issues » globale cross-projet |
| Objectifs + progression auto | Pièces jointes (issues/commentaires) |
| Commentaires + @mentions | Billing / Stripe |
| Inbox (assignation, mention, commentaire) | Gouvernance des Vues partagées |
| ⌘K recherche + raccourcis modérés | Clavier-first intégral |
| Temps réel (Realtime) | Intégrations externes |

---

## 13. Roadmap de build (proposition)

1. **Fondations** : scaffolding déjà en place → auth Supabase, shell (`AppShell`/`Sidebar`/`Header`),
   ThemeProvider, providers React Query/Realtime.
2. **Projets** : CRUD Projet + clé + Home/switcher + création + RLS de base + membres/invitations.
3. **Issues (cœur)** : table + CRUD + identifiants + SidePanel détail + dialog de création rapide.
4. **Kanban** : board par statut + dnd-kit + ordre manuel + temps réel.
5. **Vues & onglets** : My/All issues + Vues (partagées/perso) + filtres/tri/affichage.
6. **Catégories** : gestion dans les paramètres du Projet + multi-select sur l'issue.
7. **Objectifs** : CRUD + progression + liste + board filtré + bandeau.
8. **Sous-issues** : parent_id + affichage + progression parent.
9. **Commentaires, activité & Inbox** : fil par issue + **journal d'activité (timeline)** + @mentions + notifications.
10. **Finitions** : ⌘K, raccourcis, empty states, polish.
> Post-v1 : Triage + Numo, puis activity feed, pièces jointes, billing, vue globale.

---

## 14. Décisions de détail

- **Clé de Projet** : **unique par compte** (owner) — auto-suggérée depuis le nom, éditable, 2–5 lettres.
  Un autre compte peut réutiliser la même clé (pas d'unicité globale).
- **Gouvernance des Vues partagées** : **ouvert à tous les membres** en v1 (à restreindre plus tard si besoin).
- **Format des commentaires** : **rich-text markdown**, même éditeur que la description.
- **Scope de Numo** : **laissé ouvert** — la surface de tools + les garde-fous seront décidés à
  l'implémentation (post-v1). Intention : créer/modifier/chercher des issues, créer des objectifs ;
  ses issues atterrissent en Triage.
