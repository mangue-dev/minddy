# La coquille macOS de minddy

Une seule fenêtre, qui charge `https://www.minddy.app` — ou
`https://preview.minddy.app`, au choix de la personne (voir « Le canal »).
**Aucun écran à elle, aucun rendu local** : livrer une feature de minddy ne demande pas de re-signer un
binaire, et l'app de bureau dit toujours la même chose que le web.

Cadrage complet : [docs/desktop-electron.md](../docs/desktop-electron.md) §2 et
§3. Ticket : MIN-291.

## Ce qui vit ici, et ce qui n'y vit pas

Ce dossier ne contient que du **câblage Electron**. Toute décision — où la
fenêtre a le droit de naviguer, ce que transporte un deep link
d'authentification, ce que le pont expose — vit dans `lib/desktop/`, du côté du
dépôt, et y est testée par `npx vitest run lib/desktop`.

Ce n'est pas un rangement : c'est ce qui permet à la garde de navigation d'avoir
un test, et au contrat entre le serveur (`app/auth/callback`) et le main process
d'être vérifié en aller-retour plutôt que relu deux fois séparément.

| | |
| --- | --- |
| `src/main.ts` | fenêtre, garde de navigation, `minddy://`, badge du dock, IPC |
| `src/channel-store.ts` | le canal retenu sur disque (`userData/channel.json`) |
| `src/preload.ts` | **toute** la surface exposée à la page (8 membres) |
| `src/menu.ts` | le menu applicatif — il sert surtout à RETIRER ⌘W et ⌘R |
| `src/updater.ts` | les mises à jour, et le renoncement franc hors app empaquetée |
| `electron-builder.yml` | **l'identité de l'app** : nom, icône, `minddy://`, signature |
| `build/` | l'icône `.icns` et les entitlements — des sources, pas des artefacts |
| `lib/desktop/*` (hors d'ici) | les décisions, pures et testées |

## Développer

```bash
npm --prefix desktop install   # une fois — electron n'est pas une dépendance du web
npm --prefix desktop start     # build esbuild + lancement de la fenêtre
```

**Depuis le terminal intégré de VS Code, ça échoue** sur un
`MODULE_NOT_FOUND: electron` qui n'a rien à voir avec l'installation : VS Code
exporte `ELECTRON_RUN_AS_NODE=1` (il est lui-même une app Electron), et notre
binaire démarre alors comme un simple Node, sans le module `electron`. Un
terminal ordinaire n'a pas le problème ; dans celui de VS Code :

```bash
env -u ELECTRON_RUN_AS_NODE npm --prefix desktop start
```

`npm run typecheck` d'ici type-vérifie `src/` contre `electron` ; le typecheck du
dépôt, lui, **exclut ce dossier** (tsconfig racine) — sans quoi il faudrait
installer Electron pour compiler le site.

Pour travailler contre un serveur local plutôt que la production :

```bash
MINDDY_DESKTOP_ORIGIN=http://localhost:3000 npm start
```

La variable n'existe que pour ça. En production l'origine est en dur : une app de
bureau dont on détourne l'origine par une variable d'environnement est une app
dont on détourne l'écran de connexion.

## Le canal (MIN-352)

La coquille charge l'une de DEUX origines, et rien d'autre :

| Canal | Origine | Ce que c'est |
| --- | --- | --- |
| `stable` | `www.minddy.app` | la production — le défaut |
| `preview` | `preview.minddy.app` | le dernier commit de `main`, avant promotion |

**Les deux servent le même projet Supabase** : mêmes comptes, mêmes projets,
mêmes tickets. Basculer ne duplique rien. La seule chose qui ne suit pas est la
session — les cookies sont par origine, donc le premier passage sur la preview
demande de se reconnecter une fois ; revenir au stable retrouve la session de
production, restée intacte.

Le choix se fait à **deux endroits, et c'est délibéré** : dans Compte →
Préférences (là où on le cherche) et dans le menu `minddy` (la case « Preview
Latest Features »). Le second n'est pas un doublon de confort : l'écran de
réglages est SERVI par l'origine qu'il commande — si la preview ne charge pas, il
n'y a plus d'écran de réglages du tout, et le menu est la seule chose qui reste
pour revenir en production.

Il est retenu dans `userData/channel.json`, donc **par machine et par profil**,
jamais dans le compte : un réglage qui décide quelle page servir doit se lire
avant d'avoir servi la moindre page. `MINDDY_DESKTOP_ORIGIN` gagne sur lui — sur
`localhost` il n'y a pas deux canaux.

Décisions dans [lib/desktop/channel.ts](../lib/desktop/channel.ts), testées.

**Un prérequis côté Supabase**, le même qu'au paragraphe suivant : l'allowlist
« Redirect URLs » doit aussi accepter `https://preview.minddy.app/auth/callback?**`,
sans quoi Google, GitHub et les liens magiques échouent sur ce canal.

## L'authentification, en une phrase

Google refuse OAuth depuis un navigateur embarqué, et un lien magique s'ouvre de
toute façon dans le navigateur par défaut. Donc : l'app demande l'URL sans
naviguer, l'ouvre avec `shell.openExternal`, `/auth/callback` **transmet** le code
(ou le `token_hash`) à `minddy://auth?…` au lieu de poser un cookie, et c'est
l'app qui ouvre la session. Un seul chemin, trois entrées.

**Un prérequis côté Supabase** : l'allowlist « Redirect URLs » du projet doit
accepter le callback **avec sa query** — `https://www.minddy.app/auth/callback?**`
(ou un motif équivalent). Sans ça GoTrue refuse le `redirectTo` marqué
`desktop=1`, retombe sur le Site URL, et le tour se termine dans le navigateur au
lieu de revenir dans l'app. C'est un réglage de tableau de bord, il n'est pas
dans le dépôt.

## Empaqueter (MIN-292)

```bash
npm --prefix desktop run pack   # un .app NON signé, dans desktop/release/mac-*/
npm --prefix desktop run dist   # les .dmg et .zip, signés et notarisés
```

**L'icône n'a plus d'étape à elle.** Sa source est `build/icon.icon`, le dossier
rendu par Icon Composer : on l'ouvre, on l'enregistre, et le build suivant la
reprend. electron-builder appelle `actool` dessus et pose les DEUX icônes que
macOS attend depuis Tahoe — `Assets.car` + `CFBundleIconName` pour macOS 26 et
au-delà (verre, sombre, teintée), et un `icon.icns` dérivé de la même sortie pour
les versions antérieures. **Ça exige Xcode 26 ou plus** sur la machine de build :
en deçà, `actool` fait échouer la fabrication, en le disant.

**L'identité de l'app vit dans [electron-builder.yml](electron-builder.yml), et
nulle part dans le code.** Le nom sous l'icône, celui de la barre de menus,
l'icône, `CFBundleIdentifier` et le schéma `minddy://` sont lus dans
l'`Info.plist` du bundle : rien de tout ça ne se corrige à l'exécution. C'est
aussi ce qui rend le deep link d'authentification testable — hors bundle,
LaunchServices inscrit `Electron.app`, pas nous.

`app.setName("minddy")` (main.ts) ne fait pas double emploi : lui nomme le
dossier de DONNÉES (`~/Library/Application Support/minddy/`), et il devait être
posé avant qu'il existe des installations.

### Push APNs (MIN-356)

Le bundle `app.minddy.desktop` porte la capability Push Notifications et
`com.apple.developer.aps-environment=production`. Le profil/certificat utilisé
pour signer doit donc autoriser cette capability ; un build de développement
non empaqueté ne tente volontairement pas de s'inscrire.

Le provider serveur utilise une clé APNs token-based `.p8`. Poser
`APNS_TEAM_ID`, `APNS_KEY_ID` et `APNS_PRIVATE_KEY` dans l'environnement du site
(`APNS_BUNDLE_ID` reste optionnel tant que l'identifiant du bundle ne change
pas). La clé privée ne va jamais dans l'app. Une livraison complète de MIN-356
demande donc les trois pièces ensemble : migration Supabase, variables serveur,
puis binaire signé/notarisé republié. Sans configuration serveur, l'inbox reste
fonctionnelle mais APNs est un no-op ; une ancienne coquille garde le relais
temps réel tant qu'elle tourne.

**Le `.zip` accompagne le `.dmg` et n'est pas décoratif** : le `.dmg` sert au
premier téléchargement, Squirrel.Mac ne sait lire que le `.zip`. Publier l'un
sans l'autre donne une app qui s'installe et ne se met jamais à jour, sans rien
dire. Et Squirrel **exige une app signée** — d'où le refus de
`scripts/publish-desktop.mjs` devant un bundle non signé.

**Quand faut-il republier ?** Presque jamais — l'app est une fenêtre sur le site,
donc `npm run deploy` suffit à changer ce qu'elle affiche. Le déploiement le dit
tout seul : il compare une empreinte de ce qui entre RÉELLEMENT dans le binaire
(la liste déborde de ce dossier : `lib/public-routes.ts` en fait partie) à la
dernière publication enregistrée dans `released.json`. `npm run desktop:check`
donne la même réponse à la demande.

Les deux marches à marche :
**[docs/desktop-release.md](../docs/desktop-release.md)** pour livrer,
**[docs/desktop-signing.md](../docs/desktop-signing.md)** pour le compte Apple et
le certificat.

## Ce qui n'est pas fait ici

L'agent qui tourne sur la machine : **MIN-293**.
