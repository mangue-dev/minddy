---
name: verify
description: Recette de vérification end-to-end de minddy — lancer l'app, s'authentifier avec un utilisateur jetable, piloter l'UI avec Playwright.
---

# Vérifier minddy en conditions réelles

## Lancer

```bash
npm run dev   # prêt en <1s sur http://localhost:3000, env dans .env
```

Toute l'app est derrière un login Supabase (`/` redirige vers `/login`).

## S'authentifier : utilisateur jetable

Créer un utilisateur de test via la clé service (dans `.env`) avec
`@supabase/supabase-js` (entry: `node_modules/@supabase/supabase-js/dist/index.mjs`) :

```js
admin.auth.admin.createUser({ email, password, email_confirm: true,
  user_metadata: { display_name: "Verify Bot" } })
```

**Le nom « Verify Bot » n'est pas décoratif** : c'est lui qui coupe l'alerte
push d'exploitation « nouvel utilisateur »
([app/api/webhooks/supabase/new-user/route.ts](<../../../app/api/webhooks/supabase/new-user/route.ts>),
constante `VERIFY_BOT`). `email_confirm: true` fait naître le compte déjà
confirmé, donc il déclenche le webhook du premier coup. Un user jetable créé
sans ce nom fait vibrer le téléphone. Plusieurs users dans la même vérification :
« Verify Bot 2 », « Verify Bot 3 » — le préfixe suffit. À défaut de metadata, une
adresse en `verify-bot…@…` fait le même office.

Puis login via l'UI (`input[type=email]`, `input[type=password]`, submit).
**Nettoyage obligatoire à la fin** : supprimer les issues puis les projets du
user (`projects.owner_id`), puis `admin.auth.admin.deleteUser(id)`.
L'instance Supabase est la vraie instance liée au repo — ne jamais toucher aux
données des autres utilisateurs.

## Piloter (Playwright dans le scratchpad, pas dans le repo)

- `npm i playwright` + `npx playwright install chromium` (cache browsers parfois désaligné).
- Un user frais n'a aucun projet : menu bouton « New » → menuitem « New Project » →
  bouton « Create Project ». Les projets neufs sont seedés avec 6 catégories par défaut.
- Locale par défaut : EN (cookie `NEXT_LOCALE=fr` pour tester le FR).
- Board projet : raccourci `c` ouvre le dialog de création d'issue.
- Les pickers s'ouvrent par aria-label (namespace i18n `IssueUI.change*Aria`,
  ex. EN "Change status") et les options sont des `role=option` (cmdk).
- Attention au focus : cliquer un Switch/bouton vole le focus — re-cliquer le
  champ avant `keyboard.type`.
- Toast de succès : `text=Issue created.` / `Ticket créé.`

## Dictée vocale (micro → Whisper → Numo)

- Le faux micro Chromium (`--use-file-for-fake-audio-capture` + wav `say`) ne
  fonctionne PAS avec le headless shell de Playwright : Whisper reçoit du
  silence et renvoie `"..."`. **Stubber `/api/transcribe`** avec `page.route`
  (réponse `{ text: "<transcript>" }`) et laisser tout l'aval réel — la couche
  micro→Whisper est éprouvée par la dictée des commentaires.
- Boutons : aria-labels `Dictate.start` (« Dictée vocale ») / `Dictate.stop`
  (« Arrêter »). Pendant le traitement Numo, un `span[role=status]` sr-only est
  présent dans le dialog de création.
- L'endpoint `/api/projects/[id]/dictate-issue` se teste directement via
  `page.evaluate(fetch)` une fois logué (cookies inclus).

## Flux qui valent la vérification

- Création d'issue complète (toutes les options) → vérifier la persistance en
  ouvrant la carte (side panel) — les cartes du board affichent aussi catégorie/priorité.
- Mode « En créer plusieurs » : le dialog reste ouvert, titre/description vidés,
  options conservées, focus re-mis sur le titre.
- Escape + réouverture → formulaire réinitialisé.
