# Livrer minddy : le site, l'app de bureau, et pourquoi ce n'est pas la même chose

> **Ticket** : MIN-292 · Voisins : [desktop-signing.md](desktop-signing.md) (le
> compte Apple et le certificat, une fois pour toutes),
> [desktop-electron.md](desktop-electron.md) (le cadrage),
> [desktop/README.md](../desktop/README.md) (le code de la coquille).

**La question à laquelle cette page répond** : je viens de livrer une feature,
est-ce que je dois republier l'app macOS ?

**La réponse courte** : presque jamais, et `npm run deploy` te le dit.

---

## Pourquoi il y a deux choses à livrer

L'app de bureau est **une fenêtre sur `www.minddy.app`**, sans aucun rendu local
(§2 du cadrage). C'est la décision qui gouverne tout ce document : livrer une
feature ne demande pas de re-signer un binaire, et l'app dit toujours la même
chose que le web.

| | Ce que c'est | Comment ça se livre | Qui le voit, et quand |
| --- | --- | --- | --- |
| **Le site** | tout ce qui s'affiche | `npm run deploy` | tout le monde, tout de suite — l'app comprise, au rechargement suivant |
| **La coquille** | fenêtre, menu, `minddy://`, garde de navigation, notifications natives, mise à jour | build signé + notarisé, puis publication du flux | les installations existantes, sous 6 h, à leur prochain ⌘Q |

Un déploiement du site **ne déclenche jamais** de mise à jour de l'app : tant
qu'aucun binaire n'est republié, le flux annonce la même version et rien ne
bouge chez personne.

---

## Ce qui oblige vraiment à republier

Pas « ai-je touché à `desktop/` ». Le bundle esbuild embarque aussi ce que ces
fichiers importent, et **la liste déborde du dossier** — relevée sur le vrai
bundle, pas devinée :

```
desktop/src/{main,menu,preload,updater}.ts
lib/desktop/{auth-link,config,nav-guard,window-routes}.ts
lib/public-routes.ts     ← la garde de navigation en dérive
lib/site.ts              ← l'origine que la fenêtre charge
lib/auth-redirect.ts
lib/changelog.ts
```

Plus ce qui n'entre pas par esbuild mais fabrique quand même le binaire :
`desktop/electron-builder.yml`, les entitlements, l'icône, les versions
d'Electron et d'electron-updater, et `scripts/build-desktop.mjs`.

**La ligne qui surprend est `lib/public-routes.ts`.** Ajouter une page publique
change le binaire : sans republication, les installations existantes ne sauront
pas que cette page est publique et **l'afficheront dans la fenêtre** au lieu de
l'ouvrir dans le navigateur. C'est la dérive normale d'une coquille qui vit chez
les gens face à un site qui bouge tous les jours — mais autant la connaître.

### Ce qui n'oblige à rien, et qu'il a fallu écarter explicitement

Trois contenus entrent dans le bundle sans rien dire de son comportement. Sans
ces coupes, **chaque déploiement du site republierait l'app** — dix minutes de
Mac immobilisé, et 120 Mo téléchargés par chaque utilisateur pour rien :

- **le numéro de version**, réécrit à chaque build depuis celui du dépôt ;
- **`lib/changelog.ts`**, qui n'apporte qu'une date (`CHANGELOG_LAST_MODIFIED`) ;
- **les `lastModified` de `lib/public-routes.ts`**, tenus à la main pour le
  sitemap. La coquille ne lit que les CHEMINS.

Elles vivent dans `NORMALIZE`, en tête de
[scripts/desktop-fingerprint.mjs](../scripts/desktop-fingerprint.mjs), chacune
avec sa raison.

---

## Le mécanisme : une empreinte, et un relevé

[`desktop-fingerprint.mjs`](../scripts/desktop-fingerprint.mjs) demande à esbuild
quels fichiers entrent réellement dans le bundle, les hache après normalisation,
et rend une empreinte. C'est une liste **dérivée**, pas tenue à la main : un
`import` ajouté demain sera pris en compte sans que personne y pense.

[`desktop/released.json`](../desktop/released.json) est le relevé de la dernière
publication — version, date, empreinte, et le hash de chaque fichier. Il est
**commité** : la réponse se lit dans un diff, et un déploiement hors ligne reste
possible. Il est écrit par `publish-desktop.mjs` **après** l'envoi, jamais avant
— un relevé qui annoncerait une publication ratée ferait sauter tous les
déploiements suivants.

```bash
npm run desktop:check      # ce qui a changé depuis la publication
```

```
Publiée : 0.9.2 (e5bb38213348)
Actuelle : c28ea4e2f76e

  modifié   desktop/src/main.ts
  modifié   lib/desktop/window-routes.ts
```

---

## Le flux normal : `npm run deploy`

L'étape **3b** s'insère juste après le bump de version — pas plus tôt, pour que
l'app porte la version du site dont elle est tirée.

1. Rien n'a bougé dans la coquille → `Desktop app: unchanged since 0.9.2 —
   nothing to republish.` et le déploiement continue. **C'est le cas courant.**
2. La coquille a changé → la liste des fichiers s'affiche, avec ce que ça coûte,
   et la question est posée :

   ```
   Rebuild and publish the desktop app now? [Y/n]:
   ```

   Oui → build signé + notarisé, publication du flux, et un commit
   `chore(desktop): publish <version>` qui enregistre le nouveau relevé.
   Non → le site part quand même, et les installations gardent la coquille
   précédente. Rien n'est cassé, juste décalé.

En **non interactif** (CI, `npm run deploy -- patch` piloté par un script), on ne
lance jamais dix minutes de build tout seul — mais on ne le tait pas non plus :
le message dit de lancer `npm run desktop:release`. `MINDDY_SKIP_DESKTOP=1` saute
la vérification entièrement.

### À la main, hors déploiement

```bash
set -a; source .env; set +a          # flux, jeton du blob, profil de notarisation
npm run desktop:release              # dist (signe + notarise) puis publie
git add desktop/package.json desktop/package-lock.json desktop/released.json
git commit -m "chore(desktop): publish $(node -p "require('./desktop/package.json').version")"
```

### Combien de temps, et faut-il rester devant

**C'est un flux LOCAL avec une attente distante.** Apple ne fait que l'analyse :
la signature, l'attente du verdict, **l'agrafage du ticket dans le bundle**, la
fabrication du `.dmg` et du `.zip`, puis l'envoi de 485 Mo se passent tous sur ta
machine. Le processus doit donc rester vivant du début à la fin — il n'y a aucun
moment où on peut le lâcher et récupérer le résultat plus tard.

Mesuré sur la première vraie publication (0.9.2) :

| | |
| --- | --- |
| soumission arm64 → soumission x64 | ~4 min (notarisation + `.dmg`/`.zip`) |
| soumission x64 → manifeste écrit | ~1 min 20 |
| **total, envoi compris** | **~10 min** |

La toute première soumission avait pris 25 minutes et fini sur un `HTTP 500` :
c'était Apple qui allait mal ce jour-là, pas la norme. Le binaire, lui, avait été
accepté.

**Donc oui, le Mac doit rester éveillé et connecté** pendant ces dix minutes.
`deploy.sh` enveloppe les deux commandes dans `caffeinate -i`, ce qui couvre la
veille d'inactivité — **mais pas le couvercle rabattu**, qui endort la machine
quoi qu'il arrive. S'il s'endort au milieu, l'attente casse et il faut
recommencer.

Ce n'est pas à chaque déploiement, et c'est tout l'objet de l'empreinte : la
plupart des livraisons ne touchent pas à la coquille et sautent l'étape. Si ça
devenait quand même gênant, la seule façon de ne plus immobiliser ton Mac est un
runner **macOS** en CI — les deux secrets nécessaires sont listés à la fin de
[desktop-signing.md](desktop-signing.md).

---

## Ce que reçoit quelqu'un qui a l'app installée

L'app lit `latest-mac.yml` **au lancement, puis toutes les 6 h**. Version plus
récente → téléchargement du `.zip` en arrière-plan, puis installation **au
prochain ⌘Q**. Jamais de redémarrage imposé sous les doigts de quelqu'un qui
écrit un ticket.

Le menu porte aussi « Check for Updates… » — la seule vérification qui a le droit
de répondre « vous êtes à jour », parce que quelqu'un a posé la question. Celle
qui tourne toute seule se tait : sinon la seule chose que l'app dirait à
quelqu'un hors ligne serait qu'elle n'a pas pu se mettre à jour.

**Le `.zip` n'est pas un doublon du `.dmg`** : Squirrel.Mac ne sait lire que lui.
Le `.dmg` sert au premier téléchargement, le `.zip` à toutes les mises à jour
suivantes. Publier l'un sans l'autre donne une app qui s'installe et ne se met
jamais à jour, sans rien dire.

---

## Les trois refus de la publication

[`publish-desktop.mjs`](../scripts/publish-desktop.mjs) vérifie avant d'envoyer
un octet, et il ne le fait pas par excès de prudence : **les trois pannes
correspondantes sont muettes**. Rien ne casse à la publication, tout est cassé
chez les gens.

1. **App non signée** → elle s'installe et ne se mettra jamais à jour
   (Squirrel.Mac exige une signature).
2. **Ticket de notarisation absent** → macOS refuse de l'ouvrir. Et le manque ne
   se voit pas au build : quand les identifiants manquent, electron-builder écrit
   `skipped macOS notarization` en `warn` au milieu de cent lignes et rend une app
   d'apparence normale.
3. **`app-update.yml` sans URL de flux** → l'app ne cherche nulle part. Ce
   fichier est écrit à l'empaquetage, donc un `MINDDY_DESKTOP_FEED_URL` absent CE
   jour-là ne se voit nulle part ailleurs.

Il ne publie par ailleurs **que ce que `latest-mac.yml` annonce** : le dossier
`desktop/release/` n'est pas nettoyé entre deux builds, et un balayage naïf
republierait les binaires d'une version précédente. Ce qu'il laisse au sol, il le
dit — un plafond silencieux est un mensonge.

---

## Où vivent les réglages

| Variable | Rôle | Qui la lit |
| --- | --- | --- |
| `MINDDY_DESKTOP_FEED_URL` | le dossier public du flux | electron-builder **au build** (elle entre dans le bundle) *et* `/api/desktop/download` |
| `BLOB_READ_WRITE_TOKEN` | écrire dans le store | `publish-desktop.mjs` seulement |
| `APPLE_KEYCHAIN_PROFILE` | le profil trousseau de notarisation | electron-builder au build |

Les trois sont dans `.env`, et les deux premières aussi sur le projet Vercel. La
troisième n'est pas un secret : c'est un nom de profil, le mot de passe ne quitte
jamais le trousseau.

**Le piège à connaître** : `MINDDY_DESKTOP_FEED_URL` doit être présente **au
moment du build**, pas seulement sur Vercel. C'est à l'empaquetage qu'elle entre
dans l'`app-update.yml` du bundle — d'où le `source .env` avant le `dist`, et le
troisième refus ci-dessus.
