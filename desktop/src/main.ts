import path from "node:path";
import { BrowserWindow, app, ipcMain, session, shell } from "electron";

import { parseDesktopAuthLink, type DesktopAuthLink } from "@/lib/desktop/auth-link";
import {
  DESKTOP_APP_NAME,
  DESKTOP_ENTRY_PATH,
  DESKTOP_ORIGIN,
  DESKTOP_PROTOCOL,
  withDesktopUserAgent,
} from "@/lib/desktop/config";
import { navigationDecision } from "@/lib/desktop/nav-guard";
import { isMarketingPath } from "@/lib/desktop/window-routes";
import { buildAppMenu } from "./menu";

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

/** `target` n'est passé qu'au tout premier appel — `mainWindow` n'est affecté
 *  qu'au retour de `createWindow`, et les boutons s'allument avant. */
function applyWindowButtons(target?: BrowserWindow): void {
  const window = target ?? mainWindow;
  // macOS uniquement — ailleurs les boutons appartiennent au gestionnaire de
  // fenêtres, et l'API n'existe pas.
  if (process.platform !== "darwin" || !window) return;
  const fullScreen = window.isFullScreen();

  // ⚠ EN PLEIN ÉCRAN, ON NE LES CACHE JAMAIS. macOS les gère lui-même : ils
  // glissent hors de l'écran avec la barre de menus et reviennent quand le
  // pointeur monte en haut. Les masquer par-dessus, c'est retirer le SEUL moyen
  // de sortir du plein écran à la souris — une fenêtre dont on ne peut plus
  // sortir. Le mode rail n'a donc de prise sur eux qu'en fenêtré.
  window.setWindowButtonVisibility(fullScreen || wantsWindowButtons);
  if (!fullScreen && wantsWindowButtons) {
    // Reposer la position APRÈS les avoir remontrés : la remise en visibilité
    // recrée les boutons standard, et ils reviennent à leur coin d'origine si on
    // ne le redit pas — c'est-à-dire par-dessus la barre latérale au lieu de
    // dans sa ligne de marque.
    window.setWindowButtonPosition(TRAFFIC_LIGHTS);
  }

  // Ce qu'on annonce à la page est une autre question que ce qu'on montre : en
  // plein écran les boutons existent, mais PAS dans la ligne de marque — ils
  // sont passés sous la garde de macOS, en haut de l'écran. La barre latérale
  // ne doit donc pas leur garder leur place, sans quoi elle laisse un trou.
  publishWindowButtons(wantsWindowButtons && !fullScreen);
}

/** Dit à la page ce qu'il en est, et le retient pour les abonnés à venir. */
function publishWindowButtons(next = windowButtonsVisible): void {
  windowButtonsVisible = next;
  mainWindow?.webContents.send("minddy:window-buttons-state", next);
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

/**
 * La garde de navigation. Sans elle, un lien vers un site tiers ouvre ce site
 * DANS minddy, avec notre `preload` chargé — c'est-à-dire avec le pont.
 */
function guardNavigation(window: BrowserWindow): void {
  window.webContents.on("will-navigate", (event, url) => {
    const decision = navigationDecision(url, DESKTOP_ORIGIN);
    if (decision === "allow") {
      // Chez nous, mais sur le site public : l'app n'affiche pas l'argumentaire.
      // On ne bloque pas sèchement — on ramène à l'entrée, qui mène à l'app ou
      // à la connexion selon la session.
      if (isMarketingPath(url)) {
        event.preventDefault();
        void window.loadURL(`${DESKTOP_ORIGIN}${DESKTOP_ENTRY_PATH}`);
      }
      return;
    }
    event.preventDefault();
    if (decision === "external") void shell.openExternal(url);
  });

  // `will-navigate` ne voit PAS les navigations de la SPA (Next pousse dans
  // l'historique sans charger de document). Or c'est par là qu'on atterrit sur
  // l'argumentaire : un logo qui pointe vers `/`. La page a bien son propre
  // garde-fou, mais il vit dans un déploiement, et la coquille, elle, vit chez
  // les gens — elle doit tenir toute seule contre la version en ligne du jour.
  window.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (!isMainFrame || !isMarketingPath(url)) return;
    void window.loadURL(`${DESKTOP_ORIGIN}${DESKTOP_ENTRY_PATH}`);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    const decision = navigationDecision(url, DESKTOP_ORIGIN);
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
    minWidth: 720,
    minHeight: 480,
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
  window.webContents.on("did-start-loading", () => {
    wantsWindowButtons = true;
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
  window.on("close", (event) => {
    if (mainWindow !== window) return;
    event.preventDefault();
    window.hide();
  });

  void window.loadURL(`${DESKTOP_ORIGIN}${DESKTOP_ENTRY_PATH}`);
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
    if (navigationDecision(url, DESKTOP_ORIGIN) === "block") return;
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

  ipcMain.on("minddy:window-buttons-ready", () => publishWindowButtons());

  ipcMain.on("minddy:focus", () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
}

/**
 * Ce que la page a le droit de demander au système. Les notifications, oui —
 * c'est le §3. Le presse-papier aussi, l'app s'en sert des deux côtés. La
 * caméra, le micro, la géolocalisation : non, minddy ne les utilise pas, et une
 * permission qu'on n'utilise pas est une permission qu'on n'a pas à laisser
 * ouverte à du code distant.
 */
const ALLOWED_PERMISSIONS = new Set([
  "notifications",
  "clipboard-read",
  "clipboard-sanitized-write",
  "fullscreen",
]);

function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
}

// Le nom, AVANT tout le reste : `app.getPath("userData")` en dérive, et une
// seule ligne plus bas il serait déjà trop tard — la session, les caches et les
// worktrees de l'agent local se rangeraient sous « Electron ». Le changer une
// fois l'app installée chez des gens demanderait une migration de dossier pour
// un simple renommage.
app.setName(DESKTOP_APP_NAME);

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
    if (app.isPackaged) {
      app.setAsDefaultProtocolClient(DESKTOP_PROTOCOL);
    } else {
      app.setAsDefaultProtocolClient(DESKTOP_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1] ?? ""),
      ]);
    }

    hardenSession();
    registerIpc();
    mainWindow = createWindow();
    buildAppMenu(mainWindow);
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
