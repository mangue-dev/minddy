# captures/

Outil **interne** pour automatiser les captures d'écran de minddy.

Ce n'est pas un produit, ce ne sera pas packagé, ce ne sera pas publié. Tout ce
qui est ici est spécifique à minddy : les tables, les routes, les sélecteurs
sont écrits en dur, et c'est voulu. Si un jour ça doit servir ailleurs, ce sera
une réécriture et une décision séparée.

Périmètre : **captures d'écran uniquement.** Pas de clips, pas de vidéos.

## Ce que c'est

Un compte de démo dédié sur la base de production, dont les données sont
créées délibérément et versionnées ici. Des scripts Playwright qui
photographient les écrans en s'y connectant. Un registre qui permet à l'agent
de rafraîchir une capture existante en sachant ce qui avait été fait avant.

```
captures/
  world/            le monde de démo
    world.md        registre lisible : compte, projets, données, journal
    seed/           scripts d'ajout de données, idempotents et ordonnés
  shots/            une capture = un dossier
    <nom>/
      intent.md     ce que l'image DOIT montrer, et pourquoi
      shot.mjs      le script Playwright
      out/          les PNG produits
      history.jsonl un enregistrement par run : date, commit, verdict
  lib/              socle partagé
    config.mjs      périmètre autorisé — source de vérité
    guards.mjs      couche de sécurité entre les seeds et la base
    browser.mjs     contexte déterministe (reduced-motion, horloge figée…)
    session.mjs     connexion unique, réutilisée par toutes les captures
    frame.mjs       mise en scène (mockup navigateur)
  .auth/            session Playwright — jamais commité
```

## La base est celle de PRODUCTION

Il n'y a pas de Supabase locale sur ce projet. Les scripts écrivent donc dans
la vraie base, et tout le dossier est construit autour de cette contrainte.

L'invariant tient en une phrase : **aucune écriture ne peut atteindre une ligne
qui n'appartient pas au monde de démo.** Corriger un titre, changer un statut ou
retirer trois tickets de démo est normal et permis. C'est toucher au reste qui
est impossible.

Les garde-fous sont dans `lib/guards.mjs` et ne sont pas contournables :

1. **Liste blanche de tables** dans `lib/config.mjs`. L'élargir demande un
   changement de fichier, donc un diff visible.
2. **Rattachement vérifié à l'insertion.** Une ligne qui pointe vers un vrai
   utilisateur ou un vrai projet est rejetée avant d'atteindre le réseau.
3. **Relecture avant modification ou retrait.** Les lignes visées sont lues et
   vérifiées comme étant les nôtres avant qu'on y touche. On ne fait jamais
   confiance au filtre.
4. **Ni TRUNCATE, ni SQL arbitraire, ni réinitialisation.** Aucune exception,
   même sur demande.
5. **Mesure du rayon de souffle.** Si des lignes hors démo disparaissent, alerte
   et arrêt. Une hausse est juste de l'activité concurrente d'un vrai
   utilisateur, elle est signalée sans bloquer.
6. **Confirmation obligatoire.** Rien n'est écrit sans que l'utilisateur ait vu,
   en français, la liste de ce qui va changer et pourquoi.
7. **Jamais l'API HTTP de l'app.** On écrit en base directement, ce qui
   court-circuite les routes et donc le Smart Assign, les notifications, les
   events PostHog, les emails Resend et la facturation.

La seule opération destructive du dossier est `deleteDemoWorld()`, qui supprime
le compte de démo et laisse les clés étrangères nettoyer le reste en cascade.
Elle refuse tout compte dont l'email ne correspond pas au motif de démo.

## Mise en route

```bash
npm i -D playwright && npx playwright install chromium
```

Puis dans `.env`, ajouter le mot de passe du compte de démo :

```
CAPTURES_DEMO_PASSWORD=...
```

Ensuite, dans Claude Code :

- `capture-world` pour créer le compte de démo et lui donner des données ;
- `capture-shot` pour produire ou rafraîchir une capture.

## Lancer à la main

```bash
node captures/lib/session.mjs            # rafraîchit la session de démo
node captures/shots/<nom>/shot.mjs       # produit la capture
```

Par défaut les captures visent `http://localhost:3000`. Pour viser la prod :

```bash
CAPTURE_BASE_URL=https://minddy.app node captures/shots/<nom>/shot.mjs
```

## Ce qui est versionné, et pourquoi

Tout sauf `.auth/`. Les PNG, les scripts, les seeds et les registres sont dans
Git volontairement : c'est ce qui permet à l'agent de rafraîchir une capture en
sachant ce qui existait avant, ce qui avait été créé, et ce que l'image était
censée montrer. C'est le suivi d'obsolescence, en dix lignes et sans service.
