# Audit de performance — app de bureau minddy (Electron 43 / macOS)

## 1. Le diagnostic, en trois lignes

L'app de bureau paie un impôt que le navigateur ne paie pas : `app/globals.css:1711` pose `-webkit-app-region: no-drag` sur **tous** les éléments focusables du document (`a, button, input, …, [role="option"], [tabindex]`), ce qui transforme chaque bouton, chaque item de menu et chaque ligne de liste en **région annotée** que Blink recollecte et renvoie par IPC au process navigateur — celui-là même qui dépile les événements souris de macOS.
Deux aggravants s'y branchent : les deux prises `drag` posées sur des éléments dont framer-motion **anime la géométrie** (`.sidebar-brand-row` et `.app-shell > div > header`, globals.css:1739 et 1782), donc une carte de régions reconstruite à chaque frame du dépliage du rail — et 20 dropdowns Radix laissés en `modal` par défaut, qui écrivent `body.style.pointerEvents = "none"` (propriété **héritée**) à chaque ouverture et à chaque fermeture, soit un recalcul de style de tout le document sur la frame d'animation du menu.
Le reste (cartes non mémoïsées, contextes non mémoïsés, backdrop-filters) est réel mais c'est du **coût par rendu**, pas par frame : ce sont des amplificateurs, pas la source.

**Ce qui n'est pas tranché, et comment le trancher.** L'existence des règles est certaine (lues ci-dessus). Le *coût* du modèle de régions annotées de Blink est une inférence : rien dans ce dépôt ne l'a mesuré, et le commentaire de globals.css:1704 affirme au contraire « Le coût est nul » — c'est précisément l'hypothèse à casser. La manip est en §5 ; le test décisif tient en 30 secondes : **ouvrir le même board dans Chrome et dans l'app de bureau.** Si Chrome est fluide, tout ce qui n'est pas `data-desktop-app` est disculpé et l'ordre du §3 est le bon. Si Chrome saccade autant, la thèse tombe et il faut basculer sur le palier (b) — mémoïsation du board.

---

## 2. Les causes, par gain attendu

### CERTAIN — lu dans le code, mécanisme incontestable

#### C1. Les 20 dropdowns modaux écrivent `pointer-events` sur `<body>` à chaque ouverture *et* fermeture
`components/new-menu.tsx:80`, `components/app-sidebar.tsx:437`, `components/app-breadcrumb.tsx:69`, `components/board-toolbar.tsx:919` et `:962`, `components/objective-detail.tsx:450`, `components/resources.tsx:178`, `components/project-card.tsx:116`, `components/cycle/cycle-header.tsx:88`, `components/issue-plan.tsx:268`, `components/pages/block-menu.tsx:216`, `components/pages/page-breadcrumb.tsx:103`, `components/routines/routine-detail.tsx:427`, `components/agents/session-compose.tsx:71`, `components/mobile-nav-actions.tsx:41`, `components/git/provider-connect-buttons.tsx:157`, `components/feedback/feedback-team-page.tsx:1597`.

`DropdownMenu` de mangue-ui ne force rien (`node_modules/mangue-ui/src/components/ui/dropdown-menu.tsx:21-25` : passe-plat), donc Radix applique son défaut `modal={true}`. Dans ce mode, `DismissableLayer` exécute `ownerDocument.body.style.pointerEvents = "none"` (`@radix-ui/react-dismissable-layer/dist/index.mjs:111`, restauré l.121) et `RemoveScroll` injecte `body{overflow:hidden;padding-right:Npx}`. `pointer-events` est **héritée** : la poser sur `<body>` invalide le style calculé de chaque nœud du document, et le `padding-right` force un relayout complet — deux fois par ouverture de menu.

**Symptôme** : le sursaut de dropdown, à la lettre. Il tombe pendant les ~100 ms de `zoom-in-95`, donc on le *voit* sur le panneau qui apparaît.

Le dépôt sait déjà le faire : `components/issue-context-menu.tsx:294`, `components/plan-task-row.tsx:76`, `components/issue-timeline.tsx:571` et les trois de `pull-requests/pr-detail.tsx` passent `modal={false}`. Correctif : renverser le défaut **dans mangue-ui**, pas dans une copie locale.

```tsx
// node_modules/mangue-ui/src/components/ui/dropdown-menu.tsx:21
function DropdownMenu({
  modal = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" modal={modal} {...props} />
}
```

Seul effet de bord : le fond reste défilable menu ouvert — que Radix ferme de toute façon au premier scroll extérieur.

#### C2. Les deux prises `drag` sont posées sur des rectangles que framer-motion anime
`app/globals.css:1739-1741` (`.app-shell > div > header`) et `:1782-1787` (`.sidebar-brand-row`).

`.sidebar-brand-row` est enfant de la `motion.aside` dont framer anime la largeur 56 → 256 px (`components/app-sidebar.tsx:810-815`), déclenchée par `onPointerMove` (`:822`). Son rectangle change donc à chaque frame de l'animation, le vecteur de régions diffère à chaque frame, et Electron reconstruit la région déplaçable de la fenêtre côté process navigateur. Sur ProMotion : ~38 reconstructions pour un simple survol du rail.

**Symptôme** : la saccade du curseur, et le fait qu'elle se ressente *au survol* plutôt qu'au clic — le geste qui provoque le coût est le mouvement de la souris lui-même.

Ces deux prises sont **redondantes** avec `.desktop-drag-band` (`globals.css:1682-1694`), qui est `position: fixed; inset: 0 0 auto 0; height: 60px` et couvre déjà exactement la ligne de marque et les 60 premiers pixels de l'en-tête, avec un rectangle qui ne bouge jamais.

```diff
-/* app/globals.css:1739 */
-html[data-desktop-app] .app-shell > div > header {
-  -webkit-app-region: drag;
-}

 html[data-desktop-app] .sidebar-brand-row {
   container-type: inline-size;
-  -webkit-app-region: drag;
 }
```

Conserver `container-type: inline-size` : c'est lui qui porte le glissement de la marque (`100cqw`, globals.css:1789).

#### C3. `applyWindowButtons` repose inconditionnellement les boutons natifs, à chaque survol du rail
`desktop/src/main.ts:59-84`. Aucune comparaison : `setWindowButtonVisibility` puis `setWindowButtonPosition(TRAFFIC_LIGHTS)` à chaque appel, et Electron répond à chacun par un `RedrawTrafficLights()` — de l'AppKit synchrone sur le thread UI du process navigateur. Or `useHoldWindowButtons("rail", …)` (`components/app-sidebar.tsx:780`) bascule à chaque dépliage/repliage du rail, donc à chaque survol de la barre latérale, et `useHoldWindowButtons("modal", …)` à chaque ouverture *et* fermeture de dialogue, palette ou tiroir.

Le renderer refuse volontairement de dédupliquer (`lib/use-window-buttons.ts:50-55`) parce que `useWindowButtonsSlot` a besoin de la réponse du pont pour dégeler sa mise en page. La déduplication doit donc vivre dans le main, **sur les appels natifs seulement** :

```ts
/** Ce qui a réellement été posé sur la fenêtre, pour ne pas le reposer. */
let appliedButtons: string | null = null;

function applyWindowButtons(target?: BrowserWindow): void {
  const window = target ?? mainWindow;
  if (process.platform !== "darwin" || !window) return;
  const fullScreen = window.isFullScreen();
  const key = `${fullScreen}:${wantsWindowButtons}`;
  if (key !== appliedButtons) {
    appliedButtons = key;
    window.setWindowButtonVisibility(fullScreen || wantsWindowButtons);
    if (!fullScreen && wantsWindowButtons) window.setWindowButtonPosition(TRAFFIC_LIGHTS);
  }
  // TOUJOURS republier : c'est cette réponse qu'attend useWindowButtonsSlot.
  publishWindowButtons(wantsWindowButtons && !fullScreen);
}
```

Remettre `appliedButtons = null` dans le handler `did-start-navigation` (`main.ts:303`) : un document neuf repart de zéro.

#### C4. Un `MutationObserver` `childList + subtree` sur `<body>` tourne partout, y compris hors app de bureau
`lib/use-window-buttons.ts:180-185`. Il est bien **unique** (singleton de module l.158) et son callback est coalescé à une frame (l.173-179) — le constat qui parlait de « deux observateurs » et de « rafale » était faux. Ce qui reste vrai et non trivial : Chromium alloue un `MutationRecord` avec ses `StaticNodeList` pour **chaque** nœud inséré ou retiré n'importe où (recyclage react-window, frappe tiptap, streaming du fil d'agent, montages framer), et à chaque frame mutante le callback exécute `document.querySelector(MODAL_SELECTOR)` — 7 sélecteurs composés (l.136-144) qui, dans le cas dominant, ne matchent rien et traversent donc tout l'arbre.

Ce chemin n'est **pas** spécifique au bureau : `DesktopWindowButtons` est monté sans condition (`app/(app)/app-providers.tsx:99`) et retourne `null` hors coquille. C'est donc un candidat que le test Chrome/desktop disculpe ou charge tout seul.

Correctif : deux observateurs **distincts** (le piège documenté l.152-154 ne vaut que pour deux `observe()` du *même* observateur), et une garde de pont.

```ts
if (!getDesktopBridge()) return () => {};   // rien à observer dans un navigateur

// Attributs, partout : couverture INCHANGÉE. Une observation attributes-only
// n'alloue AUCUN enregistrement pour les insertions de nœuds — tout le coût était là.
attrObserver = new MutationObserver(schedule);
attrObserver.observe(document.body, {
  subtree: true, attributes: true,
  attributeFilter: ["data-slot", "data-state", "aria-modal"],
});

// Arrivée d'un portail : enfants DIRECTS de <body>, sans subtree.
childObserver = new MutationObserver(schedule);
childObserver.observe(document.body, { childList: true });
```

À contrôler ensuite sur les quatre surfaces que MIN-291 dit avoir relevées (palette ⌘K, carnet, drawer, wizard) : si l'une n'est pas portalisée en enfant direct de `<body>`, garder `childList` en `subtree` pour elle et se contenter d'alléger `readModalOpen`.

#### C5. Le scroll horizontal du board re-rend tout le board, pour des pastilles invisibles au-dessus de 640 px
`components/kanban-board.tsx:253-267` et `:365-369`. `updateActiveColumn` appelle `setActiveColumn(idx)` — un état de `KanbanBoard` — à chaque franchissement de seuil de colonne. Aucune carte n'est mémoïsée : chaque franchissement rejoue N cartes. Son seul consommateur est `<ColumnDots>`, marqué `sm:hidden` (`:467`). Sur desktop, ce travail est intégralement gaspillé. Le voisin immédiat (`scrollProps.onScroll`, `lib/use-scroll-fade.ts:81-87`) a déjà été corrigé pour exactement ce motif, avec le commentaire qui dit que ça « faisait sauter toute l'interface ».

À noter : `components/global-kanban-board.tsx:371` n'a pas ce défaut.

```tsx
const updateActiveColumn = useCallback((el: HTMLDivElement) => {
  // Les points sont `sm:hidden` : au-dessus de 640 px il n'y a rien à montrer,
  // et surtout rien à ÉTAT — setActiveColumn re-rend tout le board.
  if (window.innerWidth >= 640) {
    setActiveColumn((prev) => (prev === 0 ? prev : 0));
    return;
  }
  …
}, [columnCount]);
```

#### C6. Trois contextes rendent un littéral d'objet, dont le plus haut de l'arbre
`lib/auth-context.tsx:379-398`, `lib/projects-context.tsx:61-73` (avec une fléchée `openCreateProject` inline l.64-67), `lib/create-context.tsx:329-331`, plus `lib/use-projects-query.ts:72-80`.

`AuthProvider` est le provider le plus haut (`app/(app)/app-providers.tsx`), et son handler `onAuthStateChange` (l.127-133) fait `setSession(s)` + `setUser(…)` **sans comparaison** : supabase-js ré-émet `SIGNED_IN`/`TOKEN_REFRESHED` au retour au premier plan et à chaque rafraîchissement de jeton, toujours avec des objets neufs. La cascade est vérifiable de bout en bout : `use-projects-query.ts:33` consomme `useAuth` → `ProjectsProvider` se re-rend → `create-context.tsx:118-119` → `global-board.tsx:88-89` → toutes les cartes.

**Symptôme** : le sursaut au retour sur la fenêtre — le geste le plus fréquent dans une coquille de bureau.

```ts
// lib/auth-context.tsx:132
setSession((prev) => (prev?.access_token === s?.access_token ? prev : s));
```
et un `useMemo` sur les trois values. Sur `projects-context.tsx`, stabiliser d'abord `openCreateProject` en `useCallback` : son identité est dans les dépendances de `commandGroups` (`components/app-shell-chrome.tsx:956`) **et** de `sections` (`:1420`), donc de `paletteGroups` (`:1434`) — le piège que `components/mobile-account.tsx:54-56` documente mot pour mot. Ne pas toucher au bail-out de `user` : `refreshUser`/`updateUserMetadata` s'appuient dessus pour propager les métadonnées.

#### C7. Le filtre de persistance vise une clé qui n'existe pas
`lib/query-provider.tsx:89` liste `["agent-activity"]`, alors que la clé réellement posée est `["agent-active-issues", projectId ?? "__global__"]` (`components/agent/agent-activity-context.tsx:68`). Le poll de 15 s (`:72-73`) est donc **sérialisé sur le disque** à chaque tick, alors que l'en-tête du fichier (l.77-80) affirme que « les préfixes ci-dessous sont les VRAIES clés ». `lib/query-persist.test.ts:31` verrouille la clé inexistante : il passe et ne prouve rien.

```diff
-  ["agent-activity"],
+  ["agent-active-issues"], // components/agent/agent-activity-context.tsx:68
```

Corriger le test dans le même geste.

---

### PROBABLE — mécanisme inféré, à confirmer par le profil

#### P1. Le creusement `no-drag` global — le suspect n°1
`app/globals.css:1711-1732`. La règle est certaine et son périmètre aussi : elle marque littéralement tout ce qui se clique. Chaque ligne de la palette est à la fois `role="option"` **et** `tabIndex` (`lib/command-palette/components/ResultItem.tsx:98-101`), chaque item Radix de menu et de select l'est, chaque bouton de mangue-ui l'est. Sur un board non virtualisé (react-window n'est utilisé **que** par `lib/command-palette/components/ResultsList.tsx:14`), ce sont plusieurs centaines à plusieurs milliers de rectangles.

Ce qui est inféré, et donc à mesurer : que `LocalFrameView::UpdateDocumentAnnotatedRegions()` reparcourt l'arbre de mise en page en fin de chaque layout, appelle `AbsoluteBoundingBoxRect()` sur chaque élément marqué, compare le vecteur au précédent et l'envoie en IPC au process navigateur qui en reconstruit une `SkRegion` sur son thread UI. Si ce modèle est le bon, c'est le seul défaut de tout cet audit qui explique les **trois** symptômes ensemble *et* explique pourquoi ils ne se voient que dans la coquille.

Le correctif ne consiste pas à raccourcir la liste mais à changer de modèle : **les régions sont géométriques**, un `no-drag` posé sur un conteneur creuse tout ce que ce conteneur recouvre. Marquer les feuilles n'a jamais été nécessaire.

```css
/* Les meubles qui occupent réellement la bande des 60 px. */
html[data-desktop-app] :is(.app-shell > div > header, .sidebar-brand-row)
  :is(a, button, input, select, textarea, [role="button"], [tabindex]) {
  -webkit-app-region: no-drag;
}

/* Les surfaces flottantes : UN rectangle chacune, sur leur racine. Elles
   couvrent leurs propres contrôles, donc leurs descendants ne déclarent rien. */
html[data-desktop-app] :is(
    [data-radix-popper-content-wrapper],
    [data-slot="dialog-content"],
    [data-slot="alert-dialog-content"],
    [data-slot="sheet-content"],
    [data-slot="drawer-content"],
    [data-slot="side-panel-content"],
    [cmdk-root],
    [data-sonner-toaster]
  ) {
  -webkit-app-region: no-drag;
}
```

On passe de quelques milliers de rectangles à une dizaine. À vérifier ensuite écran par écran — c'est la seule chose que la règle globale garantissait vraiment : qu'aucun contrôle des 60 premiers pixels n'est avalé par la bande. Tout ce qui vit sous 60 px n'a jamais eu besoin d'être creusé.

#### P2. Le board rejoue tout, à chaque rendu — l'amplificateur
`components/issue-card.tsx` fait 1483 lignes, `memo` n'y est importé nulle part (l.3), ni pour `IssueCard` (l.876) ni pour `IssueCardBody` (l.640) ni pour les colonnes. Chaque carte exécute ~15 hooks (six `useTranslations`, `useAuth` l.946, `useSortable` l.948, trois contextes d'agent, `usePlanGates` l.954 = 2 observateurs react-query, `useProjectGitLinkQuery` l.958, `useAttachmentUploads`, `useFileDrop`…). Trois postes s'y ajoutent, tous du **contenu de menu fermé** :

- `components/agent/use-agent-menu-actions.tsx:216-231` : neuf callbacks en dépendances, tous fabriqués inline dans `issue-card.tsx:1202-1215` — le `useMemo` ne tombe donc **jamais** juste, et refabrique ~20 objets d'action, ~16 icônes JSX et une douzaine de `t(...)` par carte et par rendu.
- `components/issue-card.tsx:709` : `plainPreview(issue.description)` sans memo, 8 regex (dont `/```[\s\S]*?```/g` non ancré, `/^\s{0,3}#{1,6}\s+/gm`, `/^\s*[-*+]\s+/gm`, l.127-138) sur la description **entière**, alors que le rendu est `line-clamp-3`.
- Les cinq pickers (`:166`, `:206`, `:254`, `:360`, `:423`) reconstruisent leurs tableaux d'options avec un JSX `icon` par entrée, sur des sources elles-mêmes neuves (`:823` `members={[...memberMap.values()]}`, `:847` idem catégories).

Rien de tout cela n'est une source par-frame — c'est ce qui transforme **un** rendu de provider ou **un** franchissement de seuil de scroll en frame longue. À corriger **après** C5 et C6, sinon `memo` ne mordra pas : `IssueCard` reste abonnée à `useAuth` et aux trois contextes d'agent, qui traversent `memo` sans le voir.

```tsx
const description = useMemo(
  () => (issue.description ? plainPreview(issue.description.slice(0, 400)) : ""),
  [issue.description]
);
```

Et vérifier ce que publient `useAgentActive` / `useAgentHasSession` / `useIssuePr` : si l'un expose une value non mémoïsée, il annule `memo` sur toutes les cartes à chaque événement d'agent. Ces trois contextes n'ont pas été ouverts par cet audit.

#### P3. Le voile du panneau latéral floute le viewport pendant toute la lecture d'un ticket
`node_modules/mangue-ui/src/components/ui/side-panel.tsx:93` : `fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs`. Monté par `components/issue-side-panel.tsx:755` — le geste le plus fréquent du produit. Même motif en `dialog.tsx:89`, `sheet.tsx:40`, `alert-dialog.tsx:61`. mangue-ui 0.5.1 résout ses exports sur `./src`, donc ce sont bien ces classes qui partent en prod.

Deux nuances à garder en tête, qui empêchent de le classer haut : le voile bloque le survol derrière lui (la source de repaint la plus fréquente disparaît), et le contenu du panneau est peint **au-dessus** du voile (taper dans la description ne re-déclenche pas le filtre). Ce qui repeint vraiment derrière : les mises à jour temps réel et les animations framer du board.

Neutraliser d'un bloc, **hors de tout `@layer`** — en Tailwind v4 les utilitaires sont dans `@layer utilities`, une règle non layerisée les bat quelle que soit la spécificité :

```css
/* app/globals.css, hors @layer : un flou plein viewport pour 10 % de noir sur
   un fond déjà uni ne se voit pas, et coûte une surface intermédiaire à chaque
   repaint du board derrière. */
[data-slot$="-overlay"] { backdrop-filter: none !important; }
```

Vérifier ensuite à l'œil que `bg-black/10` sépare encore assez en thème clair ; monter à `bg-black/20` coûte zéro frame là où le flou en coûte à chaque repaint.

#### P4. Le popover d'actions de la palette entre en boucle de layout forcé à chaque flèche
`lib/command-palette/components/ActionsPopover.tsx:121-131` : `getBoundingClientRect()` puis `setPosition({ top, left })` — objet neuf, donc jamais de bail-out — abonné en `window.addEventListener("scroll", updatePosition, true)` (l.135). Le déclencheur n'est pas le scroll de page (l'ancre est `styles.searchView`, dans la modale fixe de la palette) mais **interne** : `:189-196` appelle `scrollIntoView({ behavior: "smooth" })` à chaque changement d'index, un défilement animé qui émet ~60 événements/s, tous captés en capture. Chaque flèche pressée dans le dropdown ouvre donc une boucle de layout forcé pendant ~300 ms.

Le correctif minimal et exact est de **supprimer** l'écouteur, pas de le throttler :

```tsx
// ActionsPopover.tsx:133-140 — l'ancre est dans la modale fixe de la palette :
// elle ne bouge pas au scroll de page. Le seul scroll qui atteignait cet
// écouteur était celui, animé, du scrollIntoView l.189-196.
updatePosition();
window.addEventListener("resize", updatePosition);
return () => window.removeEventListener("resize", updatePosition);
```

Et garder un bail-out d'identité pour le resize : `setPosition((prev) => prev && prev.top === top && prev.left === left ? prev : { top, left })`.

#### P5. La persistance du cache react-query, à mesurer avant de toucher
`lib/query-provider.tsx:144-149`. La chaîne est vérifiée dans les libs : `persist.js:53-58` réagit à `added`/`removed`/`updated`, appelle `persistQueryClientSave` qui exécute `dehydrate` **sans** throttle, puis `persistClient` — seul throttlé — dont le corps est `JSON.stringify` + `localStorage.setItem`, synchrones sur le thread principal. `gcTime` est à 24 h (l.45), donc rien ne sort du cache.

Trois rectifications au constat d'origine : le throttle est à front **traînant**, donc l'écriture ne tombe pas « pile pendant l'animation d'ouverture » d'un menu — c'est un à-coup périodique, décorrélé du geste ; le coût n'est pas dans `dehydrate` (qui ne clone rien) ; et les « 5-20 ms » sont une estimation, pas une lecture. **Rien ne justifie de toucher à ce fichier avant d'avoir mesuré** `localStorage.getItem("minddy.query-cache").length` sur un vrai board. Sous ~100 Ko, il n'y a rien à corriger ici — sauf C7, qui est un bug de filtre, pas un arbitrage de perf.

Si la mesure justifie le geste : enveloppe `requestIdleCallback` + throttle 10 s, **avec un vidage sur `pagehide` et sur `visibilitychange`** — sans quoi un rechargement jette jusqu'à 10 s d'écritures en attente, alors que la persistance n'existe que pour le rechargement (MIN-89).

#### P6. Le correcteur orthographique n'est jamais coupé, et ses suggestions sont inatteignables
`desktop/src/main.ts:264-276` : le bloc `webPreferences` énumère `contextIsolation`, `nodeIntegration`, `sandbox`, `webviewTag`, `backgroundThrottling` — pas `spellcheck`, qui vaut `true`. Sur macOS, chaque modification de texte déclenche un aller-retour vers `NSSpellChecker` sur le thread UI du process navigateur. Le service est intégralement perdu : `desktop/src/menu.ts` ne construit aucun menu contextuel et `main.ts` n'écoute jamais `context-menu` — il ne reste que les soulignements.

```ts
      webviewTag: false,
      // Le correcteur passe par NSSpellChecker sur macOS, à chaque modification
      // de texte, sur le thread UI du process navigateur — et aucune de ses
      // suggestions n'est atteignable (aucun menu contextuel n'est construit).
      spellcheck: false,
      backgroundThrottling: true,
```

#### P7. Le masque de fondu est posé sur les conteneurs qui défilent
`lib/use-scroll-fade.ts:112-118` rend `WebkitMaskImage`/`maskImage` dans `scrollProps.style`, appliqué au scroller lui-même : `components/kanban-column.tsx:111` (une instance par colonne), `components/global-kanban-column.tsx:125`, et `components/kanban-board.tsx:371` — un masque *à l'intérieur* d'un masque. Un scroller masqué ne peut plus être fait défiler par translation de calque : le masque est ancré à la boîte de bordure et le contenu doit être re-composité à chaque frame. S'y ajoute, par colonne, un `ResizeObserver` **et** un `MutationObserver` en `childList + subtree` (`:100-103`).

Sortir le fondu du scroller — `edges` est déjà rendu par le hook (`:123`), il n'y a rien à mesurer en plus :

```tsx
<div className="relative flex min-h-0 flex-1 flex-col">
  <div ref={setScrollRef} onScroll={scrollProps.onScroll} className="…overflow-y-auto…">…</div>
  {edges.start && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-background to-transparent" />}
  {edges.end && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent" />}
</div>
```

#### P8. La boucle du lasso alterne écritures et lectures de layout à chaque frame
`components/marquee-selection.tsx:319` appelle `autoScroll()` **inconditionnellement**, avant de tester `dirty`. `autoScroll` (l.288-315) enchaîne : lecture de rect → écriture de `scrollLeft` → relecture → `document.elementFromPoint` (qui force une mise à jour de style + layout après l'écriture qui précède) → remontée des ancêtres avec `getComputedStyle().overflowY` et lectures de `scrollHeight`/`clientHeight` par niveau → écriture de `scrollTop`. Deux à trois layouts forcés par frame, y compris pointeur immobile. Puis `apply()` écrit les styles de l'overlay **avant** de faire N `getBoundingClientRect()`.

Résoudre le scroller dans le handler `pointermove` plutôt qu'à chaque frame, ne mesurer que si `dx !== 0 || dy !== 0`, et dans `apply()` **lire avant d'écrire** — un seul layout par frame.

---

### Bas de tableau — à faire en passant, sans en attendre d'image

| Défaut | Fichier:ligne | Geste |
| --- | --- | --- |
| Chaque `<Tooltip>` monte son propre `TooltipProvider` (8-10 par carte) | `node_modules/mangue-ui/src/components/ui/tooltip.tsx:21-28` | Retirer le provider du wrapper, en monter **un** à la racine. Corrige aussi un bug : le « skip delay » de Radix ne marche qu'entre infobulles d'un même provider. |
| Flou invisible sous un fond à 95 % | `components/assistant-fab.tsx:102`, `components/pages/page-toc.tsx:215`, `components/bulk-issue-actions.tsx:81` | Retirer `backdrop-blur-*`. C'est du travail GPU gratuit, pas une correction de perf — ne pas l'inscrire au budget. |
| `backdrop-filter: blur(0.5px)` plein écran sur le voile de la palette | `lib/command-palette/styles/CommandPalette.module.css:20` | Supprimer la ligne, **et rien d'autre** : `.overlay` n'a aucun `background` (l.12-22) ; ajouter un scrim serait un changement de design. |
| Le visage de Numo anime des attributs SVG en boucle, y compris masqué sous 1200 px (`max-desktop:hidden` masque sans démonter) | `components/assistant-fab.tsx:112`, `components/mobile-nav-actions.tsx:34` | `animated={false}` — le signal d'activité passe déjà par `AgentBeam` (`assistant-fab.tsx:85-90`). |
| Le FAB se re-rend à chaque token SSE pour lire un booléen | `components/assistant-fab.tsx:39`, `lib/assistant-chat-context.tsx:195-216` | Scinder le contexte : un `AssistantBusyContext` séparé. Ne mord que panneau fermé (le FAB rend `null` panneau ouvert, l.62). |
| `usePaletteStore()` appelé nu, sans sélecteur | `lib/command-palette/hooks/useMobileGestures.ts:77` | Quatre sélecteurs. Le fichier consommateur documente lui-même la règle (`SearchView.tsx:113-122`). |
| Le preload bloque le renderer sur un IPC synchrone pour lire une version | `desktop/src/preload.ts:24` | `additionalArguments: ["--minddy-version=…"]`. Coût de **premier rendu** seulement. |
| `Analytics` + `SpeedInsights` dans le layout racine | `app/layout.tsx:185-186` | Les descendre dans `(marketing)` et `(legal)`. |
| `onPointerMove={openRail}` sur toute la barre latérale | `components/app-sidebar.tsx:822` | `onPointerMove={overlay && !hovered ? openRail : undefined}`. |

---

## 3. Le plan d'action

### (a) Moins d'une heure, meilleur rapport gain/risque

Dans cet ordre — chacun est indépendant des autres, aucun ne demande de mesure préalable :

1. **`modal={false}` par défaut sur `DropdownMenu`** dans mangue-ui (C1). Une ligne, 20 dropdowns corrigés d'un coup. Le dépôt a déjà 6 sites qui le passent à la main, avec la justification.
2. **Retirer les deux prises `drag` animées** de globals.css (C2). Deux suppressions ; la bande fixe fait déjà le travail.
3. **Dédupliquer `applyWindowButtons`** (C3), en gardant le `publishWindowButtons` inconditionnel.
4. **Garder `updateActiveColumn` sous 640 px** (C5).
5. **Corriger `["agent-activity"]` → `["agent-active-issues"]`** et le test qui verrouille la mauvaise clé (C7).
6. **Mémoïser les trois values de contexte** + bail-out sur `access_token` (C6).
7. **Supprimer l'écouteur `scroll` de `ActionsPopover`** (P4).
8. **`spellcheck: false`** (P6).

### (b) Un vrai chantier

- **Refondre le creusement `no-drag` par surface** (P1). C'est le poste au plus fort gain attendu, mais son correctif change un invariant de sécurité du produit : « rien d'interactif dans les 60 px ne devient une poignée de fenêtre ». Il faut repasser sur les six écrans listés dans le commentaire MIN-292, un par un, en fenêtré **et** en plein écran, rail replié **et** déplié.
- **Mémoïser le board** (P2) : `React.memo` sur `IssueCard`/`IssueCardBody`/les colonnes, callbacks stables dans `kanban-column.tsx` (prendre l'`issue` en argument, comme `onUpdateIssue` le fait déjà), `extraActions` calculé à l'ouverture du menu et non à chaque rendu, les listes de pickers remontées au board à côté de `memberMap`/`categoryMap`/`objectiveMap` (`kanban-board.tsx:108-121`), `agentsEnabled` résolu une fois par board. **Après (a).6**, sinon la mémoïsation ne mord pas. Et ouvrir au passage les trois contextes d'agent, que cet audit n'a pas lus.
- **Sortir le masque des scrollers** (P7) et **corriger la boucle du lasso** (P8).
- **Un `TooltipProvider` unique** dans mangue-ui, avec la vérif qu'aucune infobulle ne se retrouve orpheline (Radix lève, la suite le dira).

### (c) À mesurer avant de toucher

- **Le modèle de coût des régions annotées** (P1). Tant qu'un profil n'a pas montré le poste, l'ordre entre (a) et (b) reste une hypothèse. C'est la mesure la plus rentable de tout ce document.
- **La taille du snapshot localStorage** (P5). `localStorage.getItem("minddy.query-cache").length` sur un board réel. Sous ~100 Ko, on ne touche à rien.
- **`issues.length` sur un vrai projet** avant de borner `components/relation-target-picker.tsx:38`, qui monte tous les tickets ouverts sans virtualisation. En dessous de ~80 candidats, le défaut ne coûte rien.
- **Le temps GPU des voiles** (P3) avant d'aller au-delà de la règle `[data-slot$="-overlay"]`.

---

## 4. Ce qui a été écarté, et pourquoi

**Le `backdrop-blur` du FAB comme cause des drops diffus.** Le code est bien celui qu'on décrit (`assistant-fab.tsx:102`, bouton `fixed z-40` monté sur toute l'app), mais l'élément fait `h-10 w-10 md:h-11 md:w-11` (l.101) : la lecture du fond et la convolution sont bornées à ~2 000 px², côté GPU. Il n'y a pas de « surface de la taille du viewport re-rasterisée à chaque frame ». Le flou est invisible sous `bg-card/95` — c'est du rangement, pas une piste.

**Le voile de la palette comme cause de saccade continue.** `blur(0.5px)` est une convolution triviale et ne dure que le temps d'ouverture. On retire la ligne parce qu'elle ne sert à personne, pas parce qu'elle rendra une image. Et surtout : **ne pas ajouter de `background`** en compensation, le voile est volontairement transparent (`CommandPalette.module.css:12-22`).

**Le `backdrop-filter` en transition du panneau Numo** (`components/assistant/panel-geometry.ts:62`). Le lien annoncé — « à chaque ouverture » — est faux : à l'ouverture le panneau arrive en mode compact, où l.63-64 pose `!bg-transparent supports-backdrop-filter:!backdrop-blur-none` ; il n'y a rien à interpoler, et la valeur initiale d'une transition ne s'anime pas au montage. Seule la bascule compact⇄étendu paie, geste rare. **Et ne pas toucher à `.assistant-panel-morph`** (`app/globals.css`, bloc `@layer utilities`) : le commentaire juste au-dessus explique que l'ancrage `right`/`bottom` dans les deux modes *est* ce qui fait le mouvement voulu.

**Le `getBoundingClientRect` du bloc zen** (`components/zen-nav-overlay.tsx:101`). Tant que le pointeur reste du même côté de la frontière, `setOpen` baille, aucun rendu n'a lieu, la mise en page reste **propre** — et un rect sur un layout propre est servi depuis le cache. Il n'y a de reflow forcé qu'à l'instant de la bascule, une fois par entrée et une fois par sortie. Portée : mode zen, bloc déplié. Le correctif proposé (rect en cache relu au `resize`) **introduirait une régression** : la zone testée deviendrait fausse dès qu'un changement de mise en page la déplace sans redimensionner la fenêtre (repli du rail, barre secondaire téléportée) — exactement le bug que ce code a été écrit pour supprimer. **Ne rien changer est la bonne réponse.**

**Couper le poll d'activité agent** (`agent-activity-context.tsx:72`). Le pont temps réel n'invalide **jamais** `["agent-active-issues", …]` (`lib/realtime-provider.tsx:409-427` et `:451-462` invalident `ALL_AGENT_SESSIONS_KEY`, `["agent-runs","issue",id]`, `["pull-request",id]`). Passer `refetchInterval` à `false` gèlerait le halo « Numo travaille » et les pastilles de PR jusqu'au prochain montage. Si on veut y toucher un jour : d'abord ajouter l'invalidation manquante, ensuite allonger le backstop à 60 s — jamais le supprimer.

**Couper l'invalidation temps réel de `["billing","usage"]`** (`realtime-provider.tsx:201`). C'est la fonction que la migration `20260818090000_billing_realtime.sql` a été écrite pour servir : la jauge du header qui descend pendant qu'un agent travaille (MIN-72). Une fois `agentsEnabled` hissé au board, la question ne se pose plus — il ne reste qu'un observateur, et le rafraîchir ne re-rend plus aucune carte.

**Déplacer les trois requêtes de `CreateProvider` sous `{target && …}`.** Elles sont déjà inertes : `useMembersQuery(target, !!target)` (`create-context.tsx:143`), et `useCategoriesQuery`/`useObjectivesQuery` gardent `enabled = !!projectId`. `target` n'est posé qu'à la première ouverture d'un dialogue (l.125). Leurs clés valent `["members",""]` etc., qu'aucune invalidation n'atteint. Du travail pour zéro gain, qui déplacerait en prime l'état d'un dialogue délibérément laissé monté (l.124).

**Les 100 observateurs `useProjectGitLinkQuery` par board** (`issue-card.tsx:958`). Ils partagent **une** Query : react-query dédoublonne, il n'y a pas 100 requêtes. Et la clé n'est écrite qu'en liant ou déliant un dépôt — pas une source continue. Le geste reste bon (hisser au board) mais pour l'hygiène, pas pour une image.

**`useMobileGestures` comme cause de sursaut.** Le re-render de `SearchView` qu'il provoque est superficiel : `filteredItems`, `itemsWithCalculator`, `groupStartIndices` (`SearchView.tsx:455-460`) sont des `useMemo` dont aucune dépendance ne bouge quand seuls `actionsPopoverQuery`/`actionActiveIndex` changent — le scoring n'est pas rejoué, et `ResultsList` est virtualisée. Quelques dixièmes de milliseconde. On corrige parce que c'est gratuit et que le fichier se contredit lui-même, pas pour le gain.

**Le premier correctif proposé pour l'observateur des boutons de fenêtre** (une observation `attributes`-only avec un `known` set d'enfants de `<body>`). Il rouvre le bug que MIN-291 a fermé : sans `childList`, un portail déjà connu qui reçoit son contenu plus tard n'émet plus rien, et un dialogue déjà ouvert au moment du premier abonnement devient invisible pour toujours — feux macOS en travers du coin du dialogue. La forme retenue en C4 est celle à deux observateurs distincts.

---

## 5. La manip de mesure

### Ouvrir les DevTools de la fenêtre Electron

Il n'y a **aucun** élément de menu pour ça : `desktop/src/menu.ts` ne construit ni `toggleDevTools` ni menu contextuel, et `main.ts` n'appelle jamais `openDevTools()`. Passer par le protocole de débogage.

```bash
cd /Users/clementguerin/Projets/minddy-ticketing/minddy/desktop
npm run build && npx electron . --remote-debugging-port=9222
```

Puis, dans Chrome : `chrome://inspect` → **Configure…** → ajouter `localhost:9222` → **inspect** sur la cible `www.minddy.app`. On obtient les DevTools complets, panneau Performance inclus, sur le renderer de la fenêtre.

Sur un binaire déjà installé, le même drapeau marche :
`/Applications/minddy.app/Contents/MacOS/minddy --remote-debugging-port=9222`

⚠️ Un seul process lourd à la fois sur ce Mac : fermer Playwright, les serveurs de dev et les autres fenêtres Electron avant d'enregistrer, sinon le profil mesure la contention et pas l'app.

### Le test qui tranche, avant tout profil (30 secondes)

Ouvrir **le même board**, sur le même compte, dans Chrome (`https://www.minddy.app`) et dans l'app de bureau, côte à côte. Survoler la barre latérale, ouvrir un dropdown de statut sur une carte, promener le curseur.

- Chrome fluide, bureau saccadé → la thèse du §1 tient. `data-desktop-app` n'existe pas dans un navigateur, aucune des règles de `globals.css:1682-1800` ne s'y applique, et `getDesktopBridge()` est nul : P1, C2, C3 et le coût de C4 sont les seuls suspects restants.
- Les deux saccadent pareil → la thèse tombe. Le poste est alors dans le web (C1, C5, C6, P2), et l'ordre du plan bascule sur le palier (b).

### Lire un profil Performance sur ProMotion

L'écran est à 120 Hz : **le budget par frame est de 8,3 ms, pas 16,7.** Une tâche de 12 ms qui passe inaperçue sur un écran 60 Hz saute visiblement ici. C'est aussi pour ça que le symptôme est ressenti sur le Mac et pas ailleurs.

1. Panneau **Performance**, cocher **Screenshots**, régler **CPU: 4× slowdown** — le défaut cherché est un coût *proportionnel au nombre d'éléments*, le ralentissement le rend lisible sans le déformer.
2. **Enregistrer 5 secondes** pendant ce geste précis, dans cet ordre : survoler la barre latérale d'un bord à l'autre (déclenche l'animation de largeur), ouvrir un dropdown de statut sur une carte, le fermer, promener le curseur sur la liste.
3. Dans la piste **Main**, chercher, par ordre de valeur diagnostique :
   - des tâches longues juste **après** chaque `Layout`, sans `Paint` derrière — signature du parcours de régions annotées (P1/C2). Elles apparaissent en « Update Layer Tree » ou en portion non attribuée de la tâche, pas sous un nom explicite : ce sont les blocs orphelins qu'il faut repérer.
   - un `Recalculate Style` couvrant un **nombre d'éléments égal à tout le document** au moment de l'ouverture du menu — signature de `body{pointer-events:none}` (C1). La ligne « Elements affected » du détail est la preuve directe.
   - des `Function Call` répétés portant `updateActiveColumn` / `setActiveColumn` pendant un scroll horizontal (C5).
   - des `Recalculate Style` + `Layout` en rafale au moment où la fenêtre reprend le premier plan (C6).
4. **L'A/B qui vaut mieux qu'une lecture d'internals** : dans l'onglet Elements, sélectionner `<html>`, retirer l'attribut `data-desktop-app`, refaire exactement le même geste et réenregistrer. Toutes les règles de la section « app de bureau » de globals.css tombent d'un coup — la fenêtre n'est plus déplaçable pendant le test, c'est le prix. Si le profil s'aplatit, P1 et C2 sont démontrés et le palier (b) devient prioritaire. Si rien ne change, on a économisé un chantier.

### L'écran à reproduire

Un **board de projet avec 60 cartes ou plus** (`/p/<clé>`), fenêtre large (rail déplié, ≥1200 px pour que la barre latérale soit rendue), thème indifférent. C'est l'écran où les trois mécanismes se croisent : le plus grand nombre d'éléments `[tabindex]`/`[role]` montés (P1), la barre latérale animée au survol (C2), les dropdowns modaux des pickers de carte (C1), et le scroller horizontal (C5). Pour la variante « curseur », ajouter un survol lent le long de la frontière du rail — c'est le geste qui déclenche à la fois l'animation de largeur, la reconstruction de région et le `RedrawTrafficLights` de C3.