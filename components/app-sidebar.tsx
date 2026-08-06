"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import packageJson from "@/package.json";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  useTheme,
  cn,
  type NavItem,
  type NavSection,
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import {
  IssueContextMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import {
  Sun,
  Moon,
  Monitor,
  Check,
  LogOut,
  MoreHorizontal,
  Megaphone,
  BarChart3,
  CreditCard,
  Settings,
  ArrowUpRight,
  Shield,
  Newspaper,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import { useIsAdmin } from "@/lib/use-is-admin";
import { useMyAvatarSeed } from "@/lib/use-my-avatar";
import { MinddyLogo } from "@/components/minddy-logo";
import { UserAvatar } from "@/components/user-avatar";
import { WhatsNewDialog } from "@/components/whats-new-dialog";
import { hasRecentChangelog } from "@/lib/changelog";
import { getAppEnv, ENV_LOGO_TINT } from "@/lib/env";
import { openFeedbackBoard } from "@/lib/open-feedback-board";
import { useChordPrefix, CHORD_PREFIX } from "@/lib/keyboard/keyboard-context";
import { transitions } from "@/lib/motion";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import { usePrefetchProject } from "@/lib/use-prefetch-project";

const EXPANDED_WIDTH = 256;
const COLLAPSED_WIDTH = 56;

/**
 * ─── La colonne des icônes ────────────────────────────────────────────
 *
 * Une icône ne doit PAS bouger d'un pixel entre la barre ouverte et la barre
 * repliée : c'est le seul repère qui survit à l'animation, et le voir glisser
 * de quelques pixels donne à toute la barre l'air de flotter.
 *
 * Le calage part du rail, où l'icône est au milieu :
 *
 *     rail 56 = 10 (gouttière) + 9 + 18 (icône) + 9 + 10
 *                                └── centre à 28, bord gauche à 19 ──┘
 *
 * D'où deux constantes tenues à la main dans les deux états — la gouttière de
 * la nav (`px-2.5`) et le retrait de la ligne (`pl-[9px]`). Les changer sans
 * refaire l'addition remet le décalage.
 *
 * Ce qui compte est le CENTRE à 28, pas le bord à 19 : le bord ne suffit que
 * pour les glyphes de 18 px. Deux exceptions, donc, l'une et l'autre calées sur
 * le centre — l'avatar du compte (22 px, retrait de 7) et le logo (26 px de
 * large, viewBox 104×96 à `h-6`), que l'on CENTRE dans la boîte de 36 px au lieu
 * de l'aligner par la gauche : posé à 19, il débordait de 4 px à droite.
 */
/** Gouttière de la nav, du pied et de la ligne de marque. Les deux états. */
const GUTTER = "px-2.5";
/** Retrait d'une ligne : icône 18 px → bord gauche à 19 px de la barre. */
const ROW_PL = "pl-[9px]";
/** Idem pour l'avatar du compte, plus large de 4 px. */
const AVATAR_PL = "pl-[7px]";
/** La boîte d'une ligne repliée : 9 + 18 + 9. Centre à 28 de la barre. */
const ROW_BOX = "w-9";
/**
 * Les infobulles de la barre attendent avant de paraître. Sans ce délai elles
 * jaillissent sous le pointeur qui ne fait que traverser la barre pour en
 * sortir, et se posent alors en travers de la sidebar secondaire.
 * `disableHoverableContent` finit le travail : l'infobulle ne se survole pas,
 * elle ne peut donc pas retenir le pointeur qu'on croyait avoir sorti.
 */
const TOOLTIP_DELAY_MS = 600;

/** A sidebar nav item that can advertise its `G`-chord second key (e.g. "M"). */
export type AppNavItem = NavItem & {
  shortcut?: string;
  /**
   * Rejoue le `badge` dans un coin de l'icône quand la sidebar est REPLIÉE (les
   * badges normaux n'y sont pas rendus, faute de place). À porter par TOUTE
   * entrée qui signale quelque chose — spinner « agent en cours », pastille
   * non-lu, compteur de file : le mode rail est celui des pages où l'on trie,
   * et c'est précisément là que la file ne doit pas disparaître.
   *
   * Le coin ne tient qu'une forme COMPACTE (≈ 14 px). Un badge plus large —
   * un compteur à trois caractères, deux marques côte à côte — passe par
   * `badgeCollapsed`, qui lui donne sa version repliée.
   */
  showBadgeCollapsed?: boolean;
  /**
   * Ce que la pastille de coin porte à la place du `badge`, quand celui-ci n'y
   * tiendrait pas : compteur plafonné à « 9+ » (`countBadgeCollapsed`), ou une
   * seule des marques d'un badge qui en cumule plusieurs. Cas réel : l'entrée
   * « Accueil » du mode projet cumule le triangle Smart Assign et un compteur ;
   * repliée, elle garde le triangle, et le compteur seulement à défaut.
   */
  badgeCollapsed?: ReactNode;
  /**
   * Actions au clic droit sur la ligne. Réservé aux entrées qui portent un
   * OBJET dont on peut faire quelque chose — un brouillon de projet, qu'on jette
   * de là plutôt qu'en le rouvrant. Une entrée de navigation n'en a pas.
   */
  contextActions?: ContextMenuAction[];
};
export type AppNavSection = Omit<NavSection, "items"> & { items: AppNavItem[] };

const MotionLink = motion.create(Link);

/* ─── Brand ────────────────────────────────────────────────────────── */

/**
 * La marque : le logo, et rien d'autre. Hors production il change de TEINTE
 * (`ENV_LOGO_TINT`) — c'est le seul signal, et il suffit. Le nom de
 * l'environnement écrit à côté était un mot de plus à lire à chaque coup d'œil,
 * pour une information qu'on connaît déjà quand on est dessus.
 *
 * CENTRÉ dans la boîte d'une ligne, et non aligné par la gauche comme les
 * icônes : il est plus large qu'elles (26 px contre 18), et c'est son centre qui
 * doit tomber sur le leur. La boîte étant la même dans les deux états, il ne
 * bouge pas d'un pixel quand la barre s'ouvre ou se referme.
 */
function SidebarBrand() {
  return (
    <Link
      href="/home"
      aria-label="minddy"
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-sidebar-foreground",
        ROW_BOX,
      )}
    >
      <MinddyLogo className={cn("h-6 w-auto", ENV_LOGO_TINT[getAppEnv()])} />
    </Link>
  );
}

/* ─── Nav ──────────────────────────────────────────────────────────── */

function SidebarRow({
  item,
  collapsed,
}: {
  item: AppNavItem;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const active = item.active;
  const tk = useTranslations("Keyboard");
  // While a G-chord is armed, surface this row's second key as a Kbd hint
  // (AutoKap-style) — takes the trailing slot over the badge for the moment.
  const chordPrefix = useChordPrefix();
  const hint =
    !collapsed && chordPrefix === CHORD_PREFIX && item.shortcut
      ? item.shortcut
      : null;

  const rowClass = cn(
    "group relative flex h-9 items-center gap-3 rounded-lg text-sm font-medium transition-colors",
    // Le retrait gauche est le MÊME dans les deux états (cf. la colonne des
    // icônes en tête de fichier) : l'icône ne bouge pas quand la barre s'anime.
    // Repliée, la ligne se referme à 36 px sur son icône — 9 + 18 + 9.
    ROW_PL,
    collapsed ? cn(ROW_BOX, "gap-0 pr-[9px]") : "pr-3",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
    item.disabled && "pointer-events-none opacity-50",
  );

  const collapsedBadge = item.badgeCollapsed ?? item.badge;

  const inner = (
    <>
      {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" /> : null}
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
      {hint ? (
        <Kbd size="sm" className="ml-auto shrink-0">
          {hint}
        </Kbd>
      ) : !collapsed && item.badge != null ? (
        <span className="ml-auto flex items-center">{item.badge}</span>
      ) : null}
      {/* Replié : le badge (spinner « agent en cours » / pastille non-lu) se replie
          en pastille de coin sur l'icône — sinon l'info disparaît en mode rail. */}
      {collapsed && item.showBadgeCollapsed && collapsedBadge != null ? (
        <span className="absolute right-1 top-1 flex items-center justify-center rounded-full bg-sidebar">
          {collapsedBadge}
        </span>
      ) : null}
    </>
  );

  // Préchauffage des caches du board au survol / focus clavier (MIN-89) : sur
  // une entrée de projet uniquement — les autres routes n'ont pas d'éventail de
  // requêtes à recouvrir. `projectIdFromPath` ne renvoie un id que pour
  // /projects/<uuid>, donc les liens de section (…/objectives) le préchauffent
  // aussi, ce qui est exactement voulu.
  const prefetchProject = usePrefetchProject();
  const warm = item.href
    ? () => {
        const projectId = projectIdFromPath(item.href as string);
        if (projectId) prefetchProject(projectId);
      }
    : undefined;

  // Clic droit : le même menu ancré au pointeur que les cartes du board, sur les
  // seules lignes qui portent des actions (aujourd'hui les brouillons de projet).
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const openContextMenu = item.contextActions?.length
    ? (e: MouseEvent) => {
        e.preventDefault();
        setMenuPosition({ x: e.clientX, y: e.clientY });
      }
    : undefined;

  let row: ReactNode;
  if (item.href) {
    row = (
      <MotionLink
        href={item.href}
        className={rowClass}
        aria-current={active ? "page" : undefined}
        onMouseEnter={warm}
        onFocus={warm}
        onContextMenu={openContextMenu}
        whileTap={{ scale: 0.97 }}
        transition={transitions.snappy}
      >
        {inner}
      </MotionLink>
    );
  } else {
    row = (
      <motion.button
        type="button"
        onClick={item.onClick}
        disabled={item.disabled}
        onContextMenu={openContextMenu}
        className={cn(rowClass, "text-left", !collapsed && "w-full")}
        whileTap={{ scale: 0.97 }}
        transition={transitions.snappy}
      >
        {inner}
      </motion.button>
    );
  }

  if (collapsed || item.shortcut) {
    row = (
      <Tooltip delayDuration={TOOLTIP_DELAY_MS} disableHoverableContent>
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        <TooltipContent
          side="right"
          className="flex items-center gap-2"
        >
          <span>{item.tooltip ?? item.label}</span>
          {item.shortcut && (
            <>
              <Kbd size="sm">{CHORD_PREFIX.toUpperCase()}</Kbd>
              <span>{tk("then")}</span>
              <Kbd size="sm">{item.shortcut}</Kbd>
            </>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!item.contextActions?.length) return row;
  return (
    <>
      {row}
      {/* Menu court : pas de champ de recherche, il ne ferait que du bruit. */}
      <IssueContextMenu
        position={menuPosition}
        onClose={() => setMenuPosition(null)}
        actions={item.contextActions}
        searchable={false}
      />
    </>
  );
}

function SidebarNav({
  sections,
  collapsed,
}: {
  sections: AppNavSection[];
  collapsed: boolean;
}) {
  return (
    <nav
      className={cn(
        "scrollbar-quiet flex-1 overflow-x-hidden overflow-y-auto pt-3 pb-2",
        GUTTER,
      )}
    >
      {sections.map((section, index) => (
        <div key={section.key ?? index} className={cn(index > 0 && "mt-4")}>
          {section.label && !collapsed ? (
            <div
              className={cn(
                "truncate pt-1 pr-3 pb-1 text-[11px] font-medium tracking-wide text-sidebar-foreground/45",
                ROW_PL,
              )}
            >
              {section.label}
            </div>
          ) : null}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => (
              <li key={item.key}>
                <SidebarRow item={item} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* ─── Footer ───────────────────────────────────────────────────────── */

const THEME_CHOICES = [
  { value: "light", icon: Sun, label: "themeLight" },
  { value: "dark", icon: Moon, label: "themeDark" },
  { value: "system", icon: Monitor, label: "themeSystem" },
] as const;

/** Le thème se change rarement : il tient dans un sous-menu plutôt que
    d'occuper trois lignes du menu de compte. L'icône du déclencheur montre le
    réglage courant, pour ne pas avoir à ouvrir le sous-menu pour le lire. */
function ThemeSubmenu() {
  const t = useTranslations("Nav");
  const { theme, setTheme } = useTheme();
  const CurrentIcon =
    THEME_CHOICES.find((c) => c.value === theme)?.icon ?? Monitor;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <CurrentIcon />
        {t("changeTheme")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {THEME_CHOICES.map(({ value, icon: Icon, label }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon />
            {t(label)}
            {theme === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function AccountButton({
  collapsed,
  onMenuOpenChange,
}: {
  collapsed: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("Nav");
  const { user, signOut } = useAuth();
  const isAdmin = useIsAdmin();
  const meta = user?.user_metadata as AuthNameMeta | undefined;
  const name = authDisplayName(meta, user?.email ?? null, t("accountFallback"));
  const seed = useMyAvatarSeed();
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  // Après le montage seulement : la fraîcheur se lit sur l'horloge du visiteur,
  // et un rendu serveur qui trancherait à sa place ferait diverger l'hydratation
  // à la frontière des cinq jours.
  const [recentChangelog, setRecentChangelog] = useState(false);
  useEffect(() => setRecentChangelog(hasRecentChangelog()), []);

  return (
    <>
      <DropdownMenu onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger
          className={cn(
            "flex h-10 items-center rounded-lg outline-none transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent",
            // L'avatar fait 22 px : son retrait propre le recentre sur la même
            // verticale que les icônes de 18 px (cf. la colonne des icônes).
            AVATAR_PL,
            collapsed ? cn(ROW_BOX, "pr-[7px]") : "w-full gap-3 pr-3 text-left",
          )}
        >
          <UserAvatar seed={seed} className="size-[22px]" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {name}
              </span>
              <MoreHorizontal className="size-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings />
              {t("accountSettings")}
            </Link>
          </DropdownMenuItem>
          {/* Les statistiques ont quitté le pied de la barre pour ce menu
              (MIN-133) : elles se consultent de temps en temps, alors que la
              corbeille se cherche dans l'urgence de ce qu'on vient d'effacer —
              c'est elle qui mérite d'être visible en permanence. */}
          <DropdownMenuItem asChild>
            <Link href="/statistics">
              <BarChart3 />
              {t("statistics")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/billing">
              <CreditCard />
              {t("billing")}
            </Link>
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Shield />
                {t("adminDashboard")}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <ThemeSubmenu />
          <DropdownMenuSeparator />
          {/* Le changelog public, dans un modal : on lit ce qui vient de sortir
              sans quitter l'app. Pastille bleue tant que la dernière livraison a
              moins de cinq jours. */}
          <DropdownMenuItem onSelect={() => setWhatsNewOpen(true)}>
            <Newspaper />
            {t("whatsNew")}
            {recentChangelog && (
              <span
                aria-hidden
                className="ml-auto size-2 shrink-0 rounded-full bg-blue-500"
              />
            )}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
            <LogOut />
            {t("signOut")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1 text-center text-xs text-muted-foreground">
            {packageJson.version}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <WhatsNewDialog open={whatsNewOpen} onOpenChange={setWhatsNewOpen} />
    </>
  );
}

function FooterRow({
  icon: Icon,
  label,
  onClick,
  collapsed,
  active = false,
  trailingIcon: TrailingIcon,
}: {
  icon: typeof Megaphone;
  label: string;
  onClick: () => void;
  collapsed: boolean;
  active?: boolean;
  trailingIcon?: typeof Megaphone;
}) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 items-center rounded-lg text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-foreground",
        active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground",
        ROW_PL,
        collapsed ? cn(ROW_BOX, "pr-[9px]") : "w-full gap-3 pr-3 text-left",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      {/* `truncate` (donc pas de retour à la ligne) : le libellé reste monté
          pendant que la barre s'anime de 56 à 256 px, et sans lui « Partager un
          retour » se replie sur trois lignes dans les premières images du
          dépliage avant de se remettre à plat. Coupé net, il est simplement
          rogné par l'`overflow-hidden` de la barre — on ne voit rien. */}
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && TrailingIcon && <TrailingIcon className="size-4 shrink-0" />}
    </button>
  );
  if (collapsed) {
    return (
      <Tooltip delayDuration={TOOLTIP_DELAY_MS} disableHoverableContent>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }
  return btn;
}

function SidebarFooter({
  collapsed,
  onMenuOpenChange,
}: {
  collapsed: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("Nav");
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-0.5">
      <FooterRow
        icon={Trash2}
        label={t("trash")}
        collapsed={collapsed}
        active={pathname.startsWith("/trash")}
        onClick={() => router.push("/trash")}
      />
      <FooterRow
        icon={Megaphone}
        label={t("shareFeedback")}
        collapsed={collapsed}
        onClick={openFeedbackBoard}
        trailingIcon={ArrowUpRight}
      />
      <AccountButton collapsed={collapsed} onMenuOpenChange={onMenuOpenChange} />
    </div>
  );
}

/* ─── Shell ────────────────────────────────────────────────────────── */

/** Délai avant repli quand le pointeur quitte la barre en mode rail. Assez court
 *  pour que le repli suive le geste, assez long pour tolérer un frôlement. */
const RAIL_CLOSE_DELAY_MS = 150;

/**
 * The desktop sidebar. Hand-rolled (rather than mangue-ui's <Sidebar>) so the
 * nav region can animate the home ↔ project swap like AutoKap: the logo and
 * footer stay put while only the nav fades/slides — project enters from the
 * right, home from the left. `modeKey` ("home" | `project-<id>`) drives the
 * swap; navigating between a project's sub-pages keeps the same key (no replay).
 *
 * `overlay` est le mode RAIL : la page porte une sidebar secondaire, et la
 * primaire lui cède la place. Elle ne garde que ses 56 px d'icônes dans le flux
 * et se déplie AU-DESSUS de la secondaire au survol (ou au passage du focus
 * clavier), sans jamais rien décaler — le layout d'une page à deux barres est le
 * même, barre primaire ouverte ou non.
 *
 * C'est le SEUL repli. Il n'y a plus de bouton pour replier la barre à la main,
 * ni de ⌘B : le rail existe là où une seconde barre a besoin de la place, et
 * partout ailleurs la barre est simplement ouverte. Un repli manuel en plus de
 * celui-ci, c'était deux barres repliées pour deux raisons différentes, dont une
 * qu'il fallait connaître un raccourci pour défaire.
 */
export function AppSidebar({
  sections,
  modeKey,
  overlay = false,
}: {
  sections: AppNavSection[];
  modeKey: string;
  overlay?: boolean;
}) {
  const reduce = useReducedMotion();
  const dx = modeKey === "home" ? -16 : 16;

  // Mode rail : ce qui déplie la barre. Le survol, le focus clavier (tabuler
  // dans la nav doit la lire), et le menu de compte — il se pose hors de la
  // barre (portail Radix), donc y aller compterait comme en sortir.
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // Ceinture et bretelles : la navigation démonte la ligne qui avait le focus,
  // et un `blur` n'a alors personne à qui arriver. Sans cette remise à zéro, la
  // barre pourrait rester dépliée sur la page suivante.
  const routeKey = usePathname();
  useEffect(() => setFocusWithin(false), [routeKey]);

  // Même histoire pour le survol et le menu de compte, mais à la SORTIE du mode
  // rail : leurs poseurs sont branchés sur `overlay`. Quitter une page à barre
  // secondaire EN PASSANT PAR LA BARRE (on la survole, elle est dépliée, on
  // clique « Accueil ») débranche donc `onPointerLeave` avec le pointeur encore
  // dessus : personne ne le verra jamais sortir, et `hovered` reste vrai pour
  // toujours. La page à barre secondaire suivante — atteinte par la palette,
  // donc sans repasser sur la barre — s'ouvrait alors primaire DÉPLIÉE
  // par-dessus la secondaire, pointeur à l'autre bout de l'écran, et plus rien
  // ne pouvait la refermer.
  //
  // Hors mode rail ces deux états ne sont pas lus : les remettre à zéro ne
  // change rien à ce qu'on voit, et garantit qu'on revient au rail propre.
  useEffect(() => {
    if (overlay) return;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setHovered(false);
    setMenuOpen(false);
  }, [overlay]);

  const openRail = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setHovered(true);
  };
  const closeRail = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovered(false), RAIL_CLOSE_DELAY_MS);
  };

  const collapsed = overlay && !(hovered || focusWithin || menuOpen);

  // Deux largeurs, et c'est tout le mécanisme : celle que la barre OCCUPE dans
  // le flux, et celle qu'elle MESURE. En mode rail la première reste au rail
  // quoi qu'il arrive — la barre se déplie par-dessus la secondaire, jamais à
  // côté. Hors mode rail les deux sont égales, et la barre est donc dans le flux
  // sans en avoir l'air.
  //
  // Ce fantôme est aussi ce qui rend le CHANGEMENT DE MODE animable : quitter
  // une page à sidebar secondaire ne change aucune structure, seulement des
  // largeurs — 56 → 256 ici, 320 → 0 pour la gouttière d'à côté, sur la même
  // courbe. Tout ce qui est à droite glisse d'un bloc au lieu de sauter.
  const flowWidth = overlay ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
  const asideWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
  const shellTransition = reduce ? { duration: 0 } : transitions.shell;

  return (
    <>
      {/* `initial` explicite, et non `initial={false}` : c'est lui que framer
          écrit dans le HTML du serveur. Sans largeur au premier affichage, la
          gouttière partirait à zéro et tout le châssis se remettrait en place à
          l'hydratation. Au montage il vaut déjà la cible : rien ne s'anime. */}
      <motion.div
        aria-hidden
        className="h-full shrink-0"
        initial={{ width: flowWidth }}
        animate={{ width: flowWidth }}
        transition={shellTransition}
      />
      <motion.aside
        data-collapsed={collapsed}
        initial={{ width: asideWidth }}
        animate={{ width: asideWidth }}
        transition={shellTransition}
        onPointerEnter={overlay ? openRail : undefined}
        // Arriver sur une page à sidebar secondaire REPLIE la barre sous un
        // pointeur qui ne bouge pas : c'est le clic sur l'entrée qui a navigué,
        // le pointeur était donc déjà dessus et aucun `pointerenter` ne viendra.
        // Le moindre mouvement rattrape cet état, au lieu d'attendre une sortie
        // et une rentrée.
        onPointerMove={overlay ? openRail : undefined}
        onPointerLeave={overlay ? closeRail : undefined}
        onFocusCapture={
          overlay
            ? (e) => {
                // `:focus-visible`, et pas « a le focus » : CLIQUER une entrée
                // lui donne le focus, et la barre restait alors dépliée une
                // fois le pointeur parti — on venait pourtant de naviguer,
                // c'est le moment précis où elle doit se replier. Seul le focus
                // VENU DU CLAVIER (tabulation) la retient, parce que là il n'y
                // a pas de pointeur pour la rouvrir.
                const el = e.target as HTMLElement;
                if (el.matches?.(":focus-visible")) setFocusWithin(true);
              }
            : undefined
        }
        onBlurCapture={
          overlay
            ? (e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setFocusWithin(false);
                }
              }
            : undefined
        }
        className={cn(
          // Toujours en surimpression sur son propre fantôme, mode rail ou non :
          // c'est ce qui fait que passer de l'un à l'autre n'est qu'une affaire
          // de largeurs. Hors mode rail le fantôme fait exactement sa largeur,
          // et rien ne se voit.
          "absolute inset-y-0 left-0 z-40 flex h-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          // Dépliée par-dessus la secondaire, les deux barres partagent le même
          // fond : sans ombre portée, seule la bordure les sépare, et elle
          // disparaît en thème sombre. Une ombre explicite plutôt que
          // `shadow-2xl`, qui ne se voit pas sur fond noir. Elle se fond au lieu
          // de disparaître d'un coup : quitter une page à sidebar secondaire en
          // survolant la barre l'éteint en même temps que tout se remet en place.
          "transition-shadow duration-300",
          overlay && !collapsed && "shadow-[8px_0_32px_-8px_rgba(0,0,0,0.45)]",
        )}
      >
        {/* La marque. Ancrée à GAUCHE, et le MÊME élément que la barre soit au
            rail ou dépliée : en changer au dépliage démonterait ce que la
            tabulation vient de viser, et la première tabulation dans le rail
            perdrait son focus. Le rail n'ayant que 56 px, `overflow-hidden` la
            coupe — elle ne se recentre pas et ne bouge donc jamais.
            Même hauteur et même bordure basse que le header et que la ligne de
            titre de la sidebar secondaire : une seule ligne horizontale
            traverse l'application, d'un bord à l'autre. */}
        <div
          className={cn(
            "flex h-[60px] shrink-0 items-center border-b border-border",
            GUTTER,
          )}
        >
          <SidebarBrand />
        </div>

        {/* Nav — animated swap between home and project modes */}
        {reduce ? (
          <SidebarNav sections={sections} collapsed={collapsed} />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={modeKey}
              className="flex min-h-0 flex-1 flex-col"
              initial={{ opacity: 0, x: dx }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dx }}
              transition={transitions.fade}
            >
              <SidebarNav sections={sections} collapsed={collapsed} />
            </motion.div>
          </AnimatePresence>
        )}

        {/* Footer */}
        <div className={cn("pt-2 pb-4", GUTTER)}>
          <SidebarFooter
            collapsed={collapsed}
            onMenuOpenChange={overlay ? setMenuOpen : undefined}
          />
        </div>
      </motion.aside>
    </>
  );
}
