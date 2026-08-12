# captures/timeline/

Outil **local**, pour regarder l'interface de minddy bouger. Pas un produit, pas
déployé, personne d'autre ne le lance.

```bash
npm run captures:timeline     # → http://localhost:4321
```

## Pourquoi ça existe

Les captures s'écrasent : `out/en-light.png` est réécrit à chaque run, et c'est
le commit qui garde l'ancienne version. Git stocke chaque version **en entier**
(les PNG ne se « diffent » pas, chaque commit porte un blob complet), donc tout
l'historique visuel est déjà là — il manquait juste de quoi le regarder.

## Les deux historiques

L'outil en croise deux, qui **ne se superposent pas** :

| Source | Ce qu'elle dit | Granularité |
| --- | --- | --- |
| git | à quoi l'image ressemblait | une version par commit qui la touche |
| `history.jsonl` | pourquoi elle a été refaite | une ligne par run, verdict compris |

hero-board a 7 runs pour 4 versions d'image : plusieurs tentatives avant un `ok`
tombent dans le même commit. Le journal des runs est donc affiché **à côté** des
versions, pas apparié ligne à ligne — les rapprocher automatiquement serait une
correspondance inventée.

## Ce qui est mesuré

- **Retard en commits** — commits touchant `app/`, `components/` ou `lib/` entre
  le commit de la capture et HEAD. C'est le chiffre qui dit quelle image ment
  sur l'état de l'interface. Tu le notais déjà à la main dans les notes
  (« rafraîchissement après 210 commits ») ; il est calculé maintenant.
- **Écart en pixels** entre deux versions successives, via `sharp`. Les images
  sont ramenées à 480 px de large avant comparaison : en pleine résolution le
  chiffre est le même à 0,1 % près pour des secondes de calcul en plus. Un delta
  de canal sous 12 est ignoré — c'est du ré-encodage, pas de l'interface.
- **Blobs identiques repliés** : une capture relancée qui rend exactement la
  même image n'ajoute pas une version.
- **Travail en cours** : un PNG modifié non commité apparaît en tête de frise,
  en violet. C'est la version qu'on veut comparer pendant une passe.

Quand le cadrage change (hero-board est passé de 1440×900 à 1736×1085), le
rideau étire l'image pour superposer : l'outil le dit en clair sous la
comparaison plutôt que de laisser croire au pourcentage.

## Le rideau

Deux versions superposées, une poignée qu'on glisse. Clic sur une version du
rail pour la mettre en **A**, maj+clic pour **B**. `←` `→` déplacent la poignée
(maj pour aller plus vite), maj+survol la fait suivre le curseur.

## Cache

`.cache/` (ignoré) contient les blobs extraits et les mesures. Tout est dérivé
de git : le supprimer ne perd rien, le premier lancement suivant le rebâtit
(~8 s pour 128 blobs). **Actualiser** relit le dépôt sans redémarrer, et ne
mesure que les blobs nouveaux.
