---
name: capture-shot
description: Produit ou rafraîchit une capture d'écran de minddy avec Playwright, en se connectant au compte de démo. Utiliser quand l'utilisateur demande de capturer un écran, de refaire une capture existante, de la décliner en thème clair/sombre ou en français/anglais, ou de la mettre en scène dans un mockup. Ne pas utiliser pour créer les données à photographier — c'est capture-world.
---

# capture-shot

Une capture, c'est un dossier dans `captures/shots/` : ce que l'image doit
montrer, le script qui la produit, les PNG, et l'historique des runs.

```
captures/shots/<nom>/
  intent.md        ce que l'image DOIT montrer, et pourquoi
  shot.mjs         le script Playwright
  out/             les PNG
  history.jsonl    un enregistrement par run
```

## Le principe qui rend ça fiable

Tu **regardes** les images que tu produis. C'est le seul contrôle qui compte.

Un script qui se termine sans erreur ne prouve rien : il peut avoir photographié
un board vide, un « Aucun résultat », une colonne à zéro, un écran de
chargement. Tu ouvres le PNG avec l'outil de lecture d'image, tu le compares à
`intent.md`, et tu tranches. Une capture qui ne porte pas ce que l'intention
décrit est un échec, même verte.

## Produire une nouvelle capture

### 1. Écrire l'intention d'abord

Avant toute ligne de code, `intent.md` :

```markdown
# Board projet — plein

## Ce que l'image doit montrer
Un board à 4 colonnes toutes remplies, une douzaine de tickets, des priorités
variées dont au moins 2 urgents, 3 tickets assignés avec avatar visible.

## Où
/projects/<id> — vue board, barre latérale ouverte.

## Déclinaisons
fr/light, fr/dark, en/light, en/dark

## Pièges connus
(à remplir au fil des runs)
```

C'est ce fichier qui te dira, à chaque rafraîchissement, si la nouvelle image
est bonne. Sans lui, tu n'as aucun critère.

### 2. Vérifier que les données existent

Vérifier dans l'environnement de démonstration que les données nécessaires
existent. Si elles sont absentes, tu ne les crées pas ici : tu passes la main à
`capture-world`, qui demandera l'accord de l'utilisateur avant d'écrire quoi
que ce soit dans la base de production.

Même chose si l'image révèle que les données existantes rendent mal — une
colonne trop vide, un titre qui déborde, trois tickets urgents d'un coup.
`capture-world` sait ajuster ponctuellement, il n'y a pas à tout reconstruire.

### 3. Inspecter avant d'écrire le script

C'est l'étape que rien ne remplace, et elle coûte quelques secondes. Ouvre la
page pour de vrai et regarde ce qui est ciblable, au lieu de déduire des
sélecteurs en lisant les composants :

```js
const { browser, page } = await openPage({ theme: "light", locale: "fr" });
await page.goto(`${CAPTURE.baseUrl}/projects/...`);
console.log(await page.locator("main").ariaSnapshot());
await browser.close();
```

Préfère toujours les locators sémantiques de Playwright — `getByRole`,
`getByLabel`, `getByText` — aux classes utilitaires. `div.relative.cursor-pointer.rounded-xl`
casse au premier restyle, en silence.

### 4. Écrire le script

```js
import { openPage, settle, shoot, CAPTURE } from "../../lib/browser.mjs";

for (const locale of ["fr", "en"]) {
  for (const theme of ["light", "dark"]) {
    const { browser, page } = await openPage({ theme, locale });
    await page.goto(`${CAPTURE.baseUrl}/projects/...`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: '[data-testid="board"]' });
    await shoot(page, `captures/shots/<nom>/out/${locale}-${theme}.png`);
    await browser.close();
  }
}
```

`openPage` pose déjà `reducedMotion`, l'horloge figée, le thème avant le premier
paint, le cookie de langue et la session de démo. N'ajoute pas de `waitForTimeout`
arbitraire : si l'écran n'est pas prêt, l'ancre de `settle` est le bon levier.

Si la session a expiré : `node captures/lib/session.mjs`.

### 5. Regarder, puis enregistrer

Ouvre chaque PNG. Confronte-le à `intent.md`. Si l'image ne porte pas ce qu'elle
doit porter, corrige et recommence — c'est une boucle de quelques secondes,
autant s'en servir.

Puis une ligne dans `history.jsonl` :

```json
{"date":"2026-07-25","commit":"a1b2c3d","variants":["fr-light","fr-dark"],"verdict":"ok","note":"board à 12 tickets, 4 colonnes pleines"}
```

Le `commit` est `git rev-parse --short HEAD`. C'est lui qui rend les
rafraîchissements intelligents.

### 6. Publier sur la landing

Un PNG dans `out/` ne s'affiche nulle part. Pour qu'il atteigne la landing :

```js
import { publishShot, writeManifest } from "../../lib/publish.mjs";

for (const locale of ["fr", "en"]) {
  for (const theme of ["light", "dark"]) {
    await publishShot({
      slot: "heroBoard",                                   // id de screenshot-slots.ts
      lang: locale,
      theme,
      input: `captures/shots/<nom>/out/${locale}-${theme}.png`,
    });
  }
}
await writeManifest();
```

Ce que ça fait : conversion en WebP redimensionné (le composant rend
`<Image unoptimized>`, donc Next ne recompresse rien — un PNG 2× brut ferait
plusieurs mégaoctets), écriture dans `public/captures/` sous le nom
`<emplacement>-<langue>-<thème>.webp`, puis régénération de
`components/marketing/screenshot-manifest.ts`.

**La règle de définition : 2× la largeur d'affichage, au minimum.** `unoptimized`
veut dire aucun `srcset` — un seul fichier sert tous les écrans, il doit donc
porter le cas Retina. `publishShot` renvoie `servedWidth` : divisé par la
largeur affichée sur la landing, ça donne la densité réelle. En dessous de 2, le
texte d'interface est interpolé et ça se voit. Les emplacements pleine largeur
(`heroBoard`, `featureCycle`) ont leur cible dans `SLOT_WIDTHS` ; les autres
s'affichent autour de 530 px et tiennent largement dans la valeur commune.

**Le manifeste est la sécurité du dispositif.** La landing ne pointe une image
que si elle existe vraiment sur le disque ; sinon l'emplacement rend son cadre
de réservation. On peut donc publier écran par écran sans jamais afficher une
image cassée, et supprimer un fichier suffit à le retirer de la page — il n'y a
aucune liste à tenir à la main.

La correspondance est exacte : une variante manquante ne se rabat pas sur une
autre. Une capture française sur la page anglaise se remarquerait plus qu'un
cadre vide, et masquerait le travail restant.

Pour voir l'état publié : `node captures/lib/publish.mjs --list`.

**Livrer sans recapturer.** Après avoir regardé les images, relancer le script
avec `--publish` rejoue toutes les prises pour ne livrer que des fichiers déjà
sur le disque. Quand la seule chose qui reste à faire est la livraison :

```bash
node captures/lib/publish.mjs --shots              # tous les dossiers
node captures/lib/publish.mjs --shots numo agent   # … ou seulement ceux-là
```

L'emplacement visé est lu dans le `const SLOT` de chaque `shot.mjs`. Un dossier
qui porte `const RETIRED = true` est sauté : c'est ainsi qu'une capture
débranchée garde son script et son intention sans repartir en production.

## Rafraîchir une capture existante

C'est ici que le dossier versionné paie.

1. Lire `intent.md` : ce que l'image doit montrer n'a pas changé.
2. Lire la dernière ligne de `history.jsonl` : le commit du dernier run.
3. `git diff --stat <ce-commit>..HEAD -- app components` pour voir ce qui a
   bougé sur cet écran depuis. C'est le suivi d'obsolescence : pas de devinette,
   un diff.
4. Relancer le script tel quel. S'il casse, le diff dit déjà pourquoi.
5. Regarder les nouvelles images, les comparer aux anciennes dans `out/`.
6. Nouvelle ligne dans `history.jsonl`.

Si le diff ne touche rien de l'écran concerné, dis-le et ne relance pas : une
capture identique ne mérite pas un run.

## Mettre en scène

```js
import { frame } from "../../lib/frame.mjs";
await frame("out/fr-light.png", "out/fr-light@browser.png", {
  preset: "browser",           // "browser" | "plain" | "bare"
  url: "minddy.app/projects/mdy",
});
```

Le cadre est rendu par le navigateur, il n'y a aucune dépendance de traitement
d'image à installer.

## Pièges connus

- **`networkidle` ne converge jamais** sur minddy : le Realtime garde une
  connexion ouverte en permanence. `settle()` ne l'utilise pas, ne le
  réintroduis pas.
- **Le thème se pose avant le chargement.** `ThemeInitScript` lit
  `localStorage["mangue-ui-theme"]` avant le premier paint ; le poser après
  donne un flash ou un thème faux.
- **Première capture d'une session** : sans `document.fonts.ready`, l'image sort
  avec la police de repli et un métrage différent. `settle()` s'en charge.
- **Le bandeau cookies traîne en bas de l'écran.** C'est un
  `div[role="dialog"]` fixé en bas de page ; il faut l'accepter ou le retirer
  avant la prise, sinon il se retrouve sur toutes les captures.
- **Une capture verte peut être vide.** C'est le mode d'échec le plus courant et
  le plus coûteux. Regarde les images.
- **Le cycle ne suit pas l'horloge figée.** Elle ne vaut que pour le navigateur ;
  la quinzaine affichée est calculée côté serveur, à l'heure réelle. Si l'écran
  du cycle sort vide, c'est que la fenêtre a basculé — voir `world.md`.
- **Ne jamais assigner un ticket de démo à un vrai utilisateur** : les garde-fous
  refusent, mais l'intention n'a pas lieu d'être.

## Ce que ce skill ne fait pas

- Il ne crée aucune donnée en base. C'est `capture-world`.
- Il ne modifie aucun code de l'application, à une exception près et elle est
  générée : `components/marketing/screenshot-manifest.ts`, réécrit par
  `publish.mjs` à partir du contenu de `public/captures/`. Le catalogue
  `screenshot-slots.ts`, lui, ne se touche pas ici.
- Il ne produit ni clips ni vidéos : hors périmètre, définitivement.
