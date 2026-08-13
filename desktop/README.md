# La coquille macOS de minddy

Une seule fenêtre, qui charge `https://www.minddy.app`. **Aucun écran à elle,
aucun rendu local** : livrer une feature de minddy ne demande pas de re-signer un
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
| `src/preload.ts` | **toute** la surface exposée à la page (5 membres) |
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
npm --prefix desktop run icon   # refaire build/icon.icns quand le logo change
```

**L'identité de l'app vit dans [electron-builder.yml](electron-builder.yml), et
nulle part dans le code.** Le nom sous l'icône, celui de la barre de menus,
l'icône, `CFBundleIdentifier` et le schéma `minddy://` sont lus dans
l'`Info.plist` du bundle : rien de tout ça ne se corrige à l'exécution. C'est
aussi ce qui rend le deep link d'authentification testable — hors bundle,
LaunchServices inscrit `Electron.app`, pas nous.

`app.setName("minddy")` (main.ts) ne fait pas double emploi : lui nomme le
dossier de DONNÉES (`~/Library/Application Support/minddy/`), et il devait être
posé avant qu'il existe des installations.

**Le `.zip` accompagne le `.dmg` et n'est pas décoratif** : le `.dmg` sert au
premier téléchargement, Squirrel.Mac ne sait lire que le `.zip`. Publier l'un
sans l'autre donne une app qui s'installe et ne se met jamais à jour, sans rien
dire. Et Squirrel **exige une app signée** — d'où le refus de
`scripts/publish-desktop.mjs` devant un bundle non signé.

La marche à marche du compte Apple, du certificat, de la notarisation et de la
première publication : **[docs/desktop-signing.md](../docs/desktop-signing.md)**.

## Ce qui n'est pas fait ici

L'agent qui tourne sur la machine : **MIN-293**.
