import path from "node:path";
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  powerMonitor,
  session,
  shell,
  systemPreferences,
  type WebContents,
} from "electron";

import { parseDesktopAuthLink, type DesktopAuthLink } from "@/lib/desktop/auth-link";
import {
  desktopOriginForChannel,
  parseDesktopChannel,
  type DesktopChannel,
} from "@/lib/desktop/channel";
import {
  DESKTOP_APP_NAME,
  DESKTOP_ENTRY_PATH,
  DESKTOP_ORIGIN,
  DESKTOP_PROTOCOL,
  withDesktopUserAgent,
} from "@/lib/desktop/config";
import { microphoneRequestAllowed } from "@/lib/desktop/media-guard";
import { navigationDecision } from "@/lib/desktop/nav-guard";
import { parseDesktopOpenLink } from "@/lib/desktop/open-link";
import {
  carrySessionCookies,
  staleSessionCookies,
} from "@/lib/desktop/session-carry";
import { routeDisposition } from "@/lib/desktop/window-routes";
import { readDesktopChannel, writeDesktopChannel } from "./channel-store";
import { hideWindow } from "./hide-window";
import {
  attachLocalRepo,
  describeLocalRepo,
  detachLocalRepo,
} from "./local-repo";
import { buildAppMenu } from "./menu";
import { replayUpdateStatus, requestInstall, startAutoUpdates } from "./updater";
import { trace } from "./trace";

/**
 * La coquille de minddy (MIN-291) — §2 de docs/desktop-electron.md.
 *
 * Une seule `BrowserWindow`, qui charge l'origine distante. **Aucun écran à
 * elle, aucun `file://`, aucun bundle de l'UI** : c'est ce qui garantit que
 * l'app de bureau et le web disent toujours la même chose, et que livrer une
 * feature ne demande pas de re-signer un binaire.
 *
 * Tout ce qui se décide ici se décide sur des fonctions PURES de `lib/desktop/`,
 * testées par la suite du dépôt : ce fichier n'est que du câblage, et c'est
 * délibéré — il vit chez les utilisateurs et se met à jour deux fois par an.
 */

/** Le lien d'auth reçu avant que la page ne soit prête à l'entendre. */
let pendingAuthLink: DesktopAuthLink | null = null;
let mainWindow: BrowserWindow | null = null;

/**
 * LE CANAL, et l'origine qui en découle (MIN-352).
 *
 * `DESKTOP_ORIGIN` n'est plus une constante pour cette fenêtre : elle en est le
 * point de départ, remplacé au démarrage par ce que dit `channel.json`. Tout ce
 * qui parle d'origine dans ce fichier — la garde de navigation, les
 * chargements, la permission micro — lit `origin`, jamais la constante, sans
 * quoi la moitié de l'app resterait branchée sur la production pendant que la
 * fenêtre affiche la preview. Une garde de navigation qui compare à la mauvaise
 * origine renvoie l'app entière au navigateur système : c'est le genre de faute
 * qui ne se voit qu'au premier clic.
 */
let channel: DesktopChannel = "stable";
let origin: string = DESKTOP_ORIGIN;

/**
 * Bascule le canal : on emporte la session, on retient, puis on recharge.
 *
 * Un rechargement PLEIN, et pas une navigation cliente : on change d'origine,
 * donc de document, de session et de bundle. Rien de ce qui était rendu ne vaut
 * plus rien.
 *
 * **La session SUIT, depuis MIN-353.** Les cookies restent par origine — c'est
 * la coquille qui les recopie d'une jarre à l'autre, parce qu'elle a les deux
 * sous la main et qu'elle sait quand la bascule a lieu (lib/desktop/session-carry.ts).
 * Sans ça, chaque aller-retour retombait sur l'écran de connexion.
 *
 * ⚠ **Le report vient AVANT le chargement, et il faut l'attendre.** Poser les
 * cookies pendant que la nouvelle origine charge, c'est courir contre elle : la
 * requête de `/home` peut partir sans eux, le proxy la renvoie vers `/login`, et
 * on se retrouve avec une session parfaitement valide sur un écran de connexion.
 * D'où la fonction asynchrone, et le seul endroit du fichier qui attend quelque
 * chose avant d'agir.
 */
async function setChannel(next: DesktopChannel): Promise<void> {
  if (next === channel) return;
  const from = origin;
  const to = desktopOriginForChannel(next);
  await carrySession(from, to);

  writeDesktopChannel(next);
  channel = next;
  origin = to;
  trace("setChannel", { channel: next, origin });
  // Les deux surfaces natives qui NOMMENT le canal se refont : sans ça, la coche
  // du menu resterait sur celui qu'on vient de quitter et « À propos »
  // annoncerait l'ancienne origine jusqu'au prochain lancement.
  applyAboutPanel();
  if (mainWindow) {
    buildAppMenu(mainWindow, channel, onChannelChange);
    goHome(mainWindow);
    mainWindow.show();
    mainWindow.focus();
  }
}

/**
 * Ce que le menu et le pont appellent : la bascule, sans sa promesse.
 *
 * Aucun des deux n'a de quoi attendre — un `click` de `MenuItem` et un
 * `ipcMain.on` rendent `void` — et aucun des deux n'a rien à faire du résultat.
 * Le `catch` est là pour que l'échec du report ne devienne jamais un rejet non
 * attrapé : `carrySession` avale déjà les siens, celui-ci couvre le reste.
 */
function onChannelChange(next: DesktopChannel): void {
  void setChannel(next).catch((error) => {
    console.error("[channel] bascule impossible", error);
  });
}

/**
 * Recopie les cookies de session de l'origine qu'on quitte vers celle qu'on
 * rejoint. Voir lib/desktop/session-carry.ts pour ce qui voyage et pourquoi.
 *
 * **Un échec ne doit pas retenir la bascule.** Le pire cas est celui d'avant :
 * on arrive sur l'écran de connexion. Empêcher de changer de canal parce que la
 * jarre a refusé une écriture, en revanche, laisserait quelqu'un coincé sur une
 * preview cassée — le seul cas où il faut absolument pouvoir revenir.
 */
async function carrySession(from: string, to: string): Promise<void> {
  if (from === to) return;
  try {
    const jar = session.defaultSession.cookies;
    const carried = carrySessionCookies(await jar.get({ url: from }), to);
    if (carried.length === 0) {
      // Personne n'est connecté sur l'origine qu'on quitte : il n'y a rien à
      // emporter, et surtout rien à effacer à l'arrivée — la session qui s'y
      // trouve peut-être est la seule qui reste.
      trace("carrySession", { from, to, carried: 0 });
      return;
    }
    for (const name of staleSessionCookies(await jar.get({ url: to }), carried)) {
      await jar.remove(to, name);
    }
    for (const cookie of carried) await jar.set(cookie);
    trace("carrySession", { from, to, carried: carried.length });
  } catch (error) {
    console.error("[channel] session non reportée", error);
  }
}

/**
 * La fenêtre « À propos ». Le panneau natif existe de toute façon (rôle `about`
 * du menu) : sans ces options il annonce le nom et la version d'Electron, ce qui
 * est vrai et ne renseigne personne. Le nom vient de `app.getName()`, donc de
 * `setName` plus bas — pas d'une chaîne de plus.
 */
function applyAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: app.getName(),
    applicationVersion: app.getVersion(),
    copyright: "© 2026 mangue",
    // `credits` est la seule ligne libre que macOS affiche ; `website` n'y
    // existe pas (c'est une option Linux). On y met l'origine ACTIVE et non la
    // constante : sur le canal preview, c'est le seul endroit qui le dise sans
    // qu'on ait à ouvrir un menu.
    credits: origin,
  });
}

/**
 * Les boutons macOS : ce que la PAGE demande, et ce qu'ils font VRAIMENT.
 *
 * Deux entrées, dont une seule est connue de la page. La barre latérale demande
 * (elle les héberge, et le mode rail n'a pas la place de les tenir) ; le plein
 * écran, lui, les retire sans prévenir personne — c'est macOS qui décide. La
 * mise en page ne peut donc pas suivre la demande : elle suit le résultat, et
 * c'est ce fichier qui le lui dit. Sans ça, passer en plein écran laissait un
 * trou de 78 px à la place des boutons.
 */
let wantsWindowButtons = true;
let windowButtonsVisible = true;

/**
 * Ce qui a réellement été POSÉ sur la fenêtre, pour ne pas le reposer (MIN-311).
 *
 * `setWindowButtonVisibility` et `setWindowButtonPosition` ne sont pas des
 * écritures d'état : Electron répond à chacune par un `RedrawTrafficLights()` —
 * les trois `NSButton` replacés dans leur vue et la barre de titre re-mise en
 * page, de l'AppKit synchrone sur le thread UI du process navigateur. Or la page
 * appelle souvent : `useHoldWindowButtons("rail", …)` bascule à chaque survol de
 * la barre latérale, et `"modal"` à chaque ouverture ET fermeture de dialogue,
 * de palette ou de tiroir.
 *
 * ⚠ La déduplication ne peut PAS vivre côté page : le renderer refuse
 * volontairement de dédupliquer parce que `useWindowButtonsSlot` a besoin de la
 * réponse du pont. Elle porte donc sur les appels NATIFS seulement — la
 * republication, elle, reste inconditionnelle.
 *
 * Remis à `null` sur `did-start-loading` : un document neuf repart de zéro.
 */
let appliedButtons: string | null = null;

/** `target` n'est passé qu'au tout premier appel — `mainWindow` n'est affecté
 *  qu'au retour de `createWindow`, et les boutons s'allument avant. */
function applyWindowButtons(target?: BrowserWindow): void {
  const window = target ?? mainWindow;
  // macOS uniquement — ailleurs les boutons appartiennent au gestionnaire de
  // fenêtres, et l'API n'existe pas.
  if (process.platform !== "darwin" || !window) return;
  const fullScreen = window.isFullScreen();

  const applied = `${fullScreen}:${wantsWindowButtons}`;
  trace("applyWindowButtons", {
    fullScreen,
    wants: wantsWindowButtons,
    reposed: applied !== appliedButtons,
  });
  if (applied !== appliedButtons) {
    appliedButtons = applied;
    // ⚠ EN PLEIN ÉCRAN, ON NE LES CACHE JAMAIS. macOS les gère lui-même : ils
    // glissent hors de l'écran avec la barre de menus et reviennent quand le
    // pointeur monte en haut. Les masquer par-dessus, c'est retirer le SEUL
    // moyen de sortir du plein écran à la souris — une fenêtre dont on ne peut
    // plus sortir. Le mode rail n'a donc de prise sur eux qu'en fenêtré.
    window.setWindowButtonVisibility(fullScreen || wantsWindowButtons);
    if (!fullScreen && wantsWindowButtons) {
      // Reposer la position APRÈS les avoir remontrés : la remise en visibilité
      // recrée les boutons standard, et ils reviennent à leur coin d'origine si
      // on ne le redit pas — c'est-à-dire par-dessus la barre latérale au lieu
      // de dans sa ligne de marque.
      window.setWindowButtonPosition(TRAFFIC_LIGHTS);
    }
  }

  // TOUJOURS republier, même quand rien n'a bougé côté natif : c'est cette
  // réponse-là qu'attend `useWindowButtonsSlot` pour dégeler sa mise en page.
  //
  // Ce qu'on annonce à la page est une autre question que ce qu'on montre : en
  // plein écran les boutons existent, mais PAS dans la ligne de marque — ils
  // sont passés sous la garde de macOS, en haut de l'écran. La barre latérale
  // ne doit donc pas leur garder leur place, sans quoi elle laisse un trou.
  publishWindowButtons(wantsWindowButtons && !fullScreen);
}

/**
 * Dit à la page ce qu'il en est, et le retient pour les abonnés à venir.
 *
 * `to` cible UN abonné, pour le rejeu d'état demandé par `…-ready` : sans lui,
 * l'arrivée d'un abonné tardif arrose tous les `ipcRenderer.on` du document —
 * ses voisins compris, qui n'ont rien demandé (MIN-310).
 */
function publishWindowButtons(
  next = windowButtonsVisible,
  to?: WebContents
): void {
  windowButtonsVisible = next;
  trace("publishWindowButtons", { next, targeted: to != null });
  (to ?? mainWindow?.webContents)?.send("minddy:window-buttons-state", next);
}

/**
 * Les boutons se posent DANS la ligne de marque de la barre latérale, à la place
 * de la marque : `x` reprend la gouttière de la barre (`px-2.5`) plus le retrait
 * d'une ligne, `y` les centre dans les 60 px de cette ligne — la même hauteur
 * que l'en-tête et que le titre de la barre secondaire, la ligne horizontale qui
 * traverse l'app. Ces deux chiffres et le `padding-left` de `.sidebar-brand-row`
 * (app/globals.css) se lisent ensemble, ou pas du tout.
 */
const TRAFFIC_LIGHTS = { x: 19, y: 22 };

/**
 * macOS livre le deep link par `open-url`, et il le fait souvent AVANT que la
 * fenêtre existe : cliquer sur le lien du mail LANCE l'app. On le garde donc, et
 * le renderer vient le chercher quand il s'abonne (`minddy:auth-link-ready`).
 */
function receiveDeepLink(raw: string): void {
  // `minddy://open?next=…` — le retour d'un détour par le navigateur (Stripe,
  // MIN-293). Il ne demande RIEN au renderer : il change la page, ce que seul
  // le main process peut faire de toute façon quand la fenêtre est en train de
  // s'ouvrir. Chargement plein plutôt que navigation cliente, pour la même
  // raison que le retour d'authentification : on revient d'un achat, l'abonnement
  // a changé côté serveur, et un rendu neuf coûte moins qu'un raisonnement sur ce
  // qui avait déjà été rendu avec l'ancien plan.
  const next = parseDesktopOpenLink(raw);
  if (next) {
    const window = mainWindow;
    if (!window) return;
    window.show();
    window.focus();
    void window.loadURL(`${origin}${next}`);
    return;
  }

  const link = parseDesktopAuthLink(raw);
  if (!link) return;
  pendingAuthLink = link;
  const window = mainWindow;
  if (!window) return;
  window.show();
  window.focus();
  flushAuthLink();
}

function flushAuthLink(): void {
  if (!pendingAuthLink || !mainWindow) return;
  mainWindow.webContents.send("minddy:auth-link", pendingAuthLink);
  pendingAuthLink = null;
}

function goHome(window: BrowserWindow): void {
  void window.loadURL(`${origin}${DESKTOP_ENTRY_PATH}`);
}

/**
 * La garde de navigation. Sans elle, un lien vers un site tiers ouvre ce site
 * DANS minddy, avec notre `preload` chargé — c'est-à-dire avec le pont.
 *
 * Elle répond à deux questions distinctes, dans cet ordre : **est-ce chez
 * nous ?** (`navigationDecision`, lib/desktop/nav-guard.ts), puis **est-ce une
 * page que la fenêtre a le droit de montrer ?** (`routeDisposition`,
 * lib/desktop/window-routes.ts). La seconde est ce qui garde l'app à ses deux
 * seuls écrans : l'authentification et l'app.
 *
 * **Il faut brancher QUATRE événements, et chacun rattrape ce que les autres ne
 * voient pas.** C'est le genre de liste qu'on croit finie à deux :
 *
 * - `will-navigate` — le clic ordinaire sur un lien ;
 * - `will-redirect` — les redirections SERVEUR. C'est par là qu'on atteint le
 *   board de feedback : `/feedback` pose un JWT et renvoie vers `/f/<jeton>`,
 *   sans qu'aucun lien n'ait jamais pointé sur le board. Sans cet événement,
 *   toute la surface publique à jeton rentrait dans la fenêtre par la porte de
 *   derrière ;
 * - `did-navigate-in-page` — les navigations de la SPA, que Next pousse dans
 *   l'historique sans charger de document. C'est par là que passent les liens
 *   CGU et confidentialité de l'écran d'inscription ;
 * - `setWindowOpenHandler` — les `target="_blank"`.
 */
function guardNavigation(window: BrowserWindow): void {
  const guard = (event: { preventDefault: () => void }, url: string) => {
    const decision = navigationDecision(url, origin);
    if (decision !== "allow") {
      event.preventDefault();
      // Un site tiers part au navigateur ; un schéma inconnu ne va nulle part.
      if (decision === "external") void shell.openExternal(url);
      return;
    }
    const disposition = routeDisposition(url);
    if (disposition === "allow") return;
    event.preventDefault();
    // La landing n'est pas une destination qu'on demande : on y tombe. On ramène
    // donc à l'entrée plutôt que de lancer un navigateur sous les doigts de
    // quelqu'un qui a juste cliqué le logo.
    if (disposition === "home") goHome(window);
    else void shell.openExternal(url);
  };

  window.webContents.on("will-navigate", (event, url) => guard(event, url));
  window.webContents.on("will-redirect", (details) => {
    if (details.isMainFrame) guard(details, details.url);
  });

  // ⚠ **Celui-ci n'est pas annulable** : la navigation a déjà eu lieu quand on
  // l'apprend. Il ne peut donc que RÉPARER, et la seule réparation qui marche à
  // tous les coups est de recharger l'entrée.
  //
  // Défaire proprement a été essayé deux fois, et les deux échouent :
  // `navigationHistory.goBack()` ne fait rien (`canGoBack()` rend `false` juste
  // après un `pushState`), et `executeJavaScript("history.back()")` voit sa
  // promesse REJETER — la navigation qu'elle déclenche détruit le contexte
  // d'exécution qui l'attendait. Mesuré dans la fenêtre, pas déduit.
  //
  // D'où le partage des rôles : ce filet garantit qu'aucune page publique ne
  // s'affiche jamais ici, et **c'est la PAGE qui évite d'y arriver** — les
  // mentions légales de l'écran d'inscription ouvrent le navigateur elles-mêmes
  // (`LegalLink`, components/auth/login-form.tsx) plutôt que de naviguer.
  window.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (!isMainFrame) return;
    const disposition = routeDisposition(url);
    if (disposition === "allow") return;
    if (disposition === "external") void shell.openExternal(url);
    goHome(window);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    const decision = navigationDecision(url, origin);
    // Même une URL de chez nous : on ne fabrique pas de seconde fenêtre. Un
    // `target="_blank"` interne part au navigateur comme le reste — l'app a une
    // fenêtre, et une seule.
    if (decision !== "block") void shell.openExternal(url);
    return { action: "deny" };
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    // **Le plancher n'est pas celui d'un site, c'est celui d'une FENÊTRE.** Un
    // navigateur descend à 720×480 parce que quelqu'un peut vouloir y coller
    // n'importe quoi ; une app installée, elle, n'a qu'un seul contenu, et le
    // laisser se réduire à une colonne de board étirée sur toute la largeur
    // n'aide personne — c'est une taille qu'on atteint en redimensionnant, pas
    // une qu'on choisit.
    //
    // 960 : la barre latérale est repliée (elle revient à 1200), mais le board y
    // tient DEUX colonnes (`BOARD_COLUMN_CLASS`, 640 px le seuil) et l'en-tête
    // garde son fil d'Ariane à côté des boutons macOS. 640 : la conversation de
    // Numo garde son fil au-dessus de son composer.
    minWidth: 960,
    minHeight: 640,
    // Pas de barre de titre : l'app a déjà la sienne, et une bande grise au
    // dessus n'apporterait rien. **Deux contreparties, à savoir plutôt qu'à
    // découvrir.** macOS ne sait plus par où saisir la fenêtre, et c'est la PAGE
    // qui doit le dire (`-webkit-app-region`, app/globals.css, section « app de
    // bureau ») ; et les boutons n'existent pas d'eux-mêmes, ils s'allument à la
    // main (`applyWindowButtons`).
    //
    // `titleBarStyle: "hidden"` et NON `frame: false`. Essayé, et écarté : sans
    // cadre, `trafficLightPosition` ne compte plus depuis la même origine — il
    // n'y a plus de barre de titre sous laquelle se caler — et les boutons
    // remontent se coller dans le coin, au lieu d'être centrés sur la ligne de
    // marque.
    //
    // Le détour valait d'être fait une fois : on a cru un moment que la ligne
    // claire d'un pixel en haut de la fenêtre venait de la barre de titre
    // masquée. **Elle n'est pas à nous** — macOS la dessine sur toutes les
    // fenêtres, c'est son liseré, et il n'y a rien à corriger. Ne pas rouvrir.
    titleBarStyle: "hidden",
    trafficLightPosition: TRAFFIC_LIGHTS,
    backgroundColor: "#000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // Les trois réglages qui ne se discutent pas (§2) : le renderer charge du
      // code distant, il ne doit atteindre que ce que le preload expose.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      // La version, par la ligne de commande plutôt que par un IPC SYNCHRONE
      // (MIN-322) : `sendSync` arrête le renderer le temps de l'aller-retour, au
      // démarrage — c'est-à-dire pile pendant le premier rendu. Le preload lit
      // `process.argv`, qui est déjà là quand il s'exécute.
      additionalArguments: [`--minddy-version=${app.getVersion()}`],
      // Le correcteur orthographique passe par `NSSpellChecker` sur macOS, à
      // chaque modification de texte, sur le thread UI du process navigateur —
      // et aucune de ses suggestions n'est atteignable : `menu.ts` ne construit
      // aucun menu contextuel et `main.ts` n'écoute jamais `context-menu`. Il ne
      // restait que les soulignements rouges. Le rallumer un jour demande
      // d'abord d'écrire ce menu ; c'est l'autre moitié du travail (MIN-322).
      spellcheck: false,
      // La sonde de MIN-290 l'a mesuré : la WebSocket Supabase survit très bien
      // à sept minutes en arrière-plan avec l'étranglement ACTIF. On ne le coupe
      // donc pas — ce serait payer de la batterie pour un problème qu'on n'a pas.
      backgroundThrottling: true,
    },
  });

  guardNavigation(window);
  window.once("ready-to-show", () => window.show());
  // Une fenêtre sans cadre n'a pas de boutons : ils s'allument ici, à leur
  // place dans la ligne de marque, avant le premier affichage.
  applyWindowButtons(window);

  // **La demande appartient à la PAGE, elle meurt avec elle.** Un rechargement,
  // une reconnexion, une navigation pleine : le nouveau document n'a jamais rien
  // demandé, mais l'ancien avait pu laisser une demande en cours — une boîte de
  // dialogue ouverte au moment du rechargement, par exemple. Sans cette remise à
  // zéro, les boutons restaient cachés POUR TOUJOURS, sans plus personne pour
  // les rendre. Le renderer réaffirme ses raisons dès qu'il est monté.
  //
  // ⚠ **`did-start-navigation`, et NON `did-start-loading`** (MIN-293). Celui-ci
  // a l'air de dire « un document arrive » ; il dit en réalité « le rouet de
  // l'onglet tourne », ce qui inclut les navigations MÊME-DOCUMENT — un
  // `pushState`, un `replaceState`, c'est-à-dire toute navigation de la SPA.
  // Chaque changement d'onglet de la page Agents (`router.replace`) remettait
  // donc la demande à zéro et rendait les boutons, alors que la barre latérale
  // était au rail et n'avait rien relâché. Ils restaient là, définitivement :
  // personne, côté page, n'avait de raison de redemander quoi que ce soit.
  //
  // `isSameDocument` est exactement la distinction qui manquait, et
  // `isMainFrame` écarte les sous-cadres, qui ne remplacent pas la page.
  window.webContents.on("did-start-navigation", (details) => {
    if (details.isSameDocument || !details.isMainFrame) return;
    trace("did-start-navigation", { url: details.url });
    wantsWindowButtons = true;
    // Le cache d'application natif porte sur la FENÊTRE, mais sa raison d'être
    // est la demande de la page : un document neuf repart de zéro (MIN-311).
    appliedButtons = null;
    applyWindowButtons(window);
  });

  // Le plein écran retire les boutons sans passer par nous : la mise en page
  // doit l'apprendre, sinon elle garde les 78 px qu'elle leur réservait. En
  // sortir les remet — d'où l'application dans les deux sens, et la position
  // reposée par `applyWindowButtons`.
  window.on("enter-full-screen", () => applyWindowButtons());
  window.on("leave-full-screen", () => applyWindowButtons());
  // Le plein écran demandé par la PAGE (un média, un éditeur) passe la fenêtre
  // en plein écran elle aussi, mais par un autre couple d'événements. Les deux
  // aboutissent au même calcul, qui relit `isFullScreen()` : les brancher tous
  // les quatre coûte deux lignes et évite de découvrir la moitié manquante.
  window.on("enter-html-full-screen", () => applyWindowButtons());
  window.on("leave-html-full-screen", () => applyWindowButtons());
  // La fenêtre se cache au lieu de mourir (cf. ⌘W dans menu.ts) : l'app reste
  // vivante, donc les notifications continuent d'arriver.
  //
  // ⚠ `hideWindow` et non `window.hide()` : en plein écran, cacher sans être
  // sorti du Space laisse un bureau noir et vide au premier plan (MIN-353).
  window.on("close", (event) => {
    if (mainWindow !== window) return;
    event.preventDefault();
    hideWindow(window);
  });

  // Ce que la page ne peut pas connaître (MIN-307) : ⌘W et le feu rouge CACHENT
  // la fenêtre, le même document vit donc des dizaines de cycles par jour, et
  // c'est ce qui déclenche les reprises. `powerMonitor` porte la cause la plus
  // fréquente des coupures de socket, dont la page ne voit que la conséquence.
  window.on("show", () => trace("window:show"));
  window.on("hide", () => trace("window:hide"));
  window.on("blur", () => trace("window:blur"));
  for (const event of ["suspend", "resume", "lock-screen", "unlock-screen"] as const) {
    powerMonitor.on(event, () => trace(`power:${event}`));
  }

  void window.loadURL(`${origin}${DESKTOP_ENTRY_PATH}`);
  return window;
}

function registerIpc(): void {
  ipcMain.on("minddy:version", (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.on("minddy:open-external", (_event, url: unknown) => {
    if (typeof url !== "string") return;
    // Le renderer ne décide PAS de ce qu'on donne au système : `open` sur un
    // `file://` ou sur un schéma inscrit par une autre app, c'est de
    // l'exécution. Seul ce que la garde accepte de laisser sortir sort.
    if (navigationDecision(url, origin) === "block") return;
    void shell.openExternal(url);
  });

  ipcMain.on("minddy:auth-link-ready", () => flushAuthLink());

  ipcMain.on("minddy:set-badge", (_event, count: unknown) => {
    const n = typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    app.dock?.setBadge(n > 0 ? String(n) : "");
  });

  ipcMain.on("minddy:window-buttons", (_event, visible: unknown) => {
    wantsWindowButtons = visible !== false;
    applyWindowButtons();
  });

  // Rejeu d'état, CIBLÉ sur l'abonné qui le demande (MIN-310).
  ipcMain.on("minddy:window-buttons-ready", (event) =>
    publishWindowButtons(undefined, event.sender)
  );

  // Le canal, demandé par l'écran de réglages (MIN-352). Le renderer ne fait
  // que PROPOSER une valeur : `parseDesktopChannel` la ramène à l'un des deux
  // canaux, et tout ce qui n'est pas `"preview"` renvoie en production.
  ipcMain.on("minddy:set-channel", (_event, next: unknown) => {
    onChannelChange(parseDesktopChannel(next));
  });

  // La mise à jour, telle que la barre latérale la montre (MIN-353). Rejeu
  // CIBLÉ sur l'abonné qui le demande, comme pour les boutons macOS : la page a
  // pu se monter longtemps après la fin du téléchargement.
  ipcMain.on("minddy:update-status-ready", (event) =>
    replayUpdateStatus(event.sender)
  );

  // Un clic sur la ligne ne relance PAS l'app : il rouvre la boîte native, qui
  // demande le dernier oui (updater.ts).
  ipcMain.on("minddy:install-update", () => requestInstall());

  ipcMain.on("minddy:focus", () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });

  // LE DOSSIER LOCAL D'UN PROJET (MIN-359) — les trois premiers `handle` du
  // fichier, et c'est la nature de ces gestes qui l'impose : ils RENDENT quelque
  // chose (l'état du dossier, relu sur le disque), là où tout le reste du pont
  // est un ordre sans réponse. `send` obligerait à réinventer une corrélation
  // pour appareiller la réponse à sa demande.
  //
  // Le renderer ne nomme jamais un dossier : il donne un id de projet et le
  // `owner/repo` contre lequel valider, et le chemin ne peut entrer que par le
  // panneau système ouvert ici (`attachLocalRepo`).
  ipcMain.handle("minddy:local-repo:read", (_event, input: unknown) => {
    const parsed = localRepoRequest(input);
    if (!parsed) return { status: "none" };
    return describeLocalRepo(parsed.projectId, { fullName: parsed.fullName });
  });

  ipcMain.handle("minddy:local-repo:choose", async (_event, input: unknown) => {
    const parsed = localRepoRequest(input);
    if (!parsed) return { status: "none" };
    return attachLocalRepo(parsed.projectId, { fullName: parsed.fullName }, mainWindow);
  });

  ipcMain.handle("minddy:local-repo:forget", (_event, input: unknown) => {
    const projectId = readString((input as { projectId?: unknown } | null)?.projectId);
    if (!projectId) return { status: "none" };
    return detachLocalRepo(projectId);
  });
}

function readString(value: unknown): string | null {
  // Les deux champs sont courts par nature (un uuid, un `owner/repo`) : au-delà
  // de la marge, le corps est forgé et ne mérite pas d'aller plus loin.
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 256 ? trimmed : null;
}

/** Ce que le renderer a le droit d'envoyer, ramené à ça ou à rien. */
function localRepoRequest(input: unknown): { projectId: string; fullName: string } | null {
  if (typeof input !== "object" || input === null) return null;
  const { projectId, fullName } = input as { projectId?: unknown; fullName?: unknown };
  const id = readString(projectId);
  const name = readString(fullName);
  return id && name ? { projectId: id, fullName: name } : null;
}

/**
 * Ce que la page a le droit de demander au système. Les notifications, oui —
 * c'est le §3. Le presse-papier aussi, l'app s'en sert des deux côtés. La
 * géolocalisation, la caméra : non, minddy ne les utilise pas, et une permission
 * qu'on n'utilise pas est une permission qu'on n'a pas à laisser ouverte à du
 * code distant.
 *
 * Le MICRO, lui, n'est pas dans cette liste et n'y sera pas : il arrive sous la
 * permission `media`, qui couvre aussi la caméra, et il se décide donc à part —
 * voir `microphoneRequestAllowed` et le gestionnaire juste en dessous.
 */
const ALLOWED_PERMISSIONS = new Set([
  "notifications",
  "clipboard-read",
  "clipboard-sanitized-write",
  "fullscreen",
]);

/** Le volet des réglages macOS où le micro se rend, quand il a été refusé. */
const MICROPHONE_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";

/**
 * L'accès au micro, côté SYSTÈME — la moitié qu'Electron ne fait pas.
 *
 * Dire oui à la page ne suffit pas : sur macOS, c'est TCC qui tient le micro, et
 * il ne tranche qu'une fois. Trois états, trois conduites :
 *
 * - `not-determined` — personne n'a encore demandé. `askForMediaAccess` ouvre la
 *   fenêtre du système ; elle ne s'ouvrira qu'ICI, et une seule fois dans la vie
 *   de l'installation. On rend sa réponse.
 * - `granted` — c'est déjà oui, rien à demander.
 * - `denied` / `restricted` — c'est non, et **le système ne le redemandera
 *   jamais**. Redemander ne fait rien du tout : le seul chemin restant passe par
 *   les Réglages, donc on l'ouvre plutôt que de laisser un refus muet.
 *
 * Hors macOS, il n'y a pas de couche de plus : la réponse de la page fait foi.
 */
async function grantMicrophoneAccess(): Promise<boolean> {
  if (process.platform !== "darwin") return true;
  const status = systemPreferences.getMediaAccessStatus("microphone");
  if (status === "granted") return true;
  if (status === "not-determined") {
    return systemPreferences.askForMediaAccess("microphone");
  }
  // La fenêtre n'est PAS attendue : le rappel de permission doit repartir tout
  // de suite, sinon le bouton de dictée reste en « démarrage » derrière elle.
  void offerMicrophoneSettings();
  return false;
}

/** Une seule à la fois : le bouton de dictée se reclique. */
let microphoneDialogOpen = false;

/**
 * Le refus dit, et le geste qui le répare — en natif, parce que le refus vient
 * du système et que la page n'a aucun moyen de le lever elle-même.
 */
async function offerMicrophoneSettings(): Promise<void> {
  if (microphoneDialogOpen) return;
  microphoneDialogOpen = true;
  try {
    const options: Electron.MessageBoxOptions = {
      type: "info",
      message: "minddy can’t reach your microphone",
      detail:
        "macOS is blocking it. Open Privacy & Security › Microphone, turn minddy on, then start dictating again.",
      buttons: ["Open System Settings", "Cancel"],
      defaultId: 0,
      cancelId: 1,
    };
    const { response } = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options);
    if (response === 0) await shell.openExternal(MICROPHONE_SETTINGS_URL);
  } finally {
    microphoneDialogOpen = false;
  }
}

function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_wc, permission, callback, details) => {
      if (permission === "media") {
        const request = details as Electron.MediaAccessPermissionRequest;
        const allowed = microphoneRequestAllowed(
          {
            securityOrigin: request.securityOrigin,
            requestingUrl: request.requestingUrl,
            mediaTypes: request.mediaTypes,
          },
          origin
        );
        if (!allowed) {
          callback(false);
          return;
        }
        void grantMicrophoneAccess().then(callback);
        return;
      }
      callback(ALLOWED_PERMISSIONS.has(permission));
    }
  );
}

// Le nom, AVANT tout le reste : `app.getPath("userData")` en dérive, et une
// seule ligne plus bas il serait déjà trop tard — la session, les caches et les
// worktrees de l'agent local se rangeraient sous « Electron ». Le changer une
// fois l'app installée chez des gens demanderait une migration de dossier pour
// un simple renommage.
//
// ⚠ **En développement, le nom CHANGE, et ce n'est pas cosmétique.** Le verrou
// d'instance unique juste en dessous vit DANS `userData`, qui dérive de ce nom :
// à nom égal, la coquille lancée par `npm run desktop:dev` demandait le même
// verrou que l'app installée. Quand celle-ci tourne — c'est-à-dire toujours, sur
// le poste où on développe — la coquille de dév quittait aussitôt, en silence et
// avec un code 0, et l'app installée se contentait de passer au premier plan.
// On croit alors avoir lancé la coquille : on regarde en fait la prod.
//
// Le profil séparé ne coûte rien : les cookies sont par ORIGINE, et une fenêtre
// de dév pointée sur `localhost` n'aurait de toute façon pas la session de
// `www.minddy.app`. Il faut s'y connecter une fois, et c'est tout.
app.setName(app.isPackaged ? DESKTOP_APP_NAME : `${DESKTOP_APP_NAME}-dev`);

// Instance unique : le deep link doit atteindre l'app DÉJÀ ouverte, pas en
// lancer une seconde qui n'aurait ni sa session ni sa fenêtre.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    for (const arg of argv) {
      if (arg.startsWith(`${DESKTOP_PROTOCOL}:`)) receiveDeepLink(arg);
    }
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // macOS : le lien arrive par ici, et peut arriver avant `ready`.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    receiveDeepLink(url);
  });

  void app.whenReady().then(() => {
    // Le suffixe s'AJOUTE, il ne remplace pas : falsifier l'user agent pour
    // faire passer un écran de connexion est fragile et contraire à la politique
    // qu'on prétendrait contourner (§2). Il est là pour que le serveur et l'UI
    // sachent qu'on est dans l'app, rien de plus.
    app.userAgentFallback = withDesktopUserAgent(
      app.userAgentFallback,
      app.getVersion()
    );

    // `minddy://`. Hors app empaquetée (dev), macOS a besoin du binaire et du
    // chemin du projet pour savoir quoi relancer.
    //
    // ⚠ Le schéma est GLOBAL au système, lui, et le dernier inscrit gagne : une
    // session de dév prend la main sur les `minddy://` de l'app installée, y
    // compris son retour de paiement. C'est le prix à payer pour pouvoir tester
    // un deep link en dév — mais si un lien ouvre la mauvaise fenêtre après
    // coup, c'est ici qu'il faut regarder, pas dans le lien.
    if (app.isPackaged) {
      app.setAsDefaultProtocolClient(DESKTOP_PROTOCOL);
    } else {
      app.setAsDefaultProtocolClient(DESKTOP_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1] ?? ""),
      ]);
    }

    // Le canal AVANT la fenêtre : c'est lui qui dit quelle origine charger, et
    // il n'y a pas de second chargement à espérer pour se rattraper.
    channel = readDesktopChannel();
    origin = desktopOriginForChannel(channel);
    trace("channel", { channel, origin });

    applyAboutPanel();
    hardenSession();
    registerIpc();
    mainWindow = createWindow();
    buildAppMenu(mainWindow, channel, onChannelChange);
    // La fenêtre est passée à l'updater pour que sa proposition d'installer
    // s'attache à elle, plutôt que de flotter seule au milieu de l'écran.
    startAutoUpdates(() => mainWindow);
    flushAuthLink();

    // macOS : cliquer l'icône du dock d'une app sans fenêtre visible la ramène.
    app.on("activate", () => {
      if (!mainWindow) return;
      mainWindow.show();
      mainWindow.focus();
    });
  });

  // Sur macOS une app sans fenêtre reste vivante, et c'est ce qu'on veut : elle
  // ne se ferme QUE par ⌘Q. C'est aussi ce qui fait tenir les notifications —
  // et ce qui explique qu'elles s'arrêtent quand on quitte (§3).
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  // ⌘Q : là, on ferme pour de bon. Sans ça le handler `close` de la fenêtre
  // cacherait la fenêtre au lieu de laisser l'app quitter.
  app.on("before-quit", () => {
    const window = mainWindow;
    mainWindow = null;
    window?.destroy();
  });
}
