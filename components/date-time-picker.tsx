"use client";

// One reusable date + time picker for every échéance in the app (issue cards,
// the ticket side panel, and the issue / objective creation dialogs). Wraps the
// themed <Calendar> in a popover, adds a clean time field and quick actions,
// and renders one of three triggers via `variant`. Values are ISO strings
// (local wall-clock time preserved); `null` means unset.

import * as React from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { enUS, fr } from "react-day-picker/locale";
import {
  Kbd,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "mangue-ui";
import { CalendarDays, Repeat } from "lucide-react";
import { Calendar } from "@/components/calendar";
import { dueDateFormat, dueDateHasTime, parseDueDate } from "@/lib/due-date";
import {
  RECURRENCE_CADENCES,
  occurrencesBetween,
  startDueDate,
  startDueDateISO,
  type RecurrenceCadence,
} from "@/lib/recurrence";
import { recurrenceLabel } from "@/lib/recurrence-label";

/** Default time applied when the time toggle is switched on. */
const DEFAULT_HOUR = 9;

// "anchored" has no visible trigger: it opens (controlled) at `anchor`, the
// mouse position — used by the keyboard field shortcuts (issue-field-shortcuts).
type Variant = "field" | "value" | "chip" | "anchored";

const pad = (n: number) => String(n).padStart(2, "0");

const VALUE_TRIGGER =
  "-mr-1.5 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm whitespace-nowrap text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted";

export function DateTimePicker({
  value,
  onChange,
  variant = "field",
  placeholder,
  className,
  ariaLabel,
  /** Stop pointer/click from bubbling to a draggable/clickable ancestor (cards). */
  stopPropagation = false,
  open: controlledOpen,
  onOpenChange,
  anchor,
  tooltip,
  shortcutHint,
  recurrence = null,
  onRecurrenceChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  variant?: Variant;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  stopPropagation?: boolean;
  /** Controlled open state (required for the "anchored" variant). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Viewport coordinates the "anchored" variant opens at (the mouse pointer). */
  anchor?: { x: number; y: number } | null;
  /** Optional tooltip on the trigger (triggered variants only). */
  tooltip?: string;
  /** Key badge (e.g. "D") shown next to the tooltip — surfaces the shortcut. */
  shortcutHint?: string;
  /** Cadence de répétition du ticket (MIN-136). */
  recurrence?: RecurrenceCadence | null;
  /**
   * Rendre le champ récurrençable : sans ce rappel, le popover reste le pur
   * sélecteur d'échéance qu'il a toujours été (c'est le cas de la date cible
   * d'un objectif). Avec lui, un sélecteur « Une fois | Récurrent » s'ajoute
   * en tête, et une ligne de cadence sous le calendrier.
   *
   * Le rappel porte les DEUX champs parce que les deux bougent d'un même
   * geste : rendre récurrent un ticket sans date lui en pose une, et effacer
   * l'échéance coupe la récurrence. Deux rappels séparés, ce seraient deux
   * écritures concurrentes sur la même ligne.
   */
  onRecurrenceChange?: (next: {
    due_date: string | null;
    recurrence: RecurrenceCadence | null;
  }) => void;
}) {
  const t = useTranslations("DatePicker");
  const tRec = useTranslations("Recurrence");
  const format = useFormatter();
  const locale = useLocale();
  const dfLocale = locale === "fr" ? fr : enUS;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };
  const timeId = React.useId();
  const switchId = React.useId();
  const cadenceId = React.useId();
  const selected = parseDueDate(value);

  /**
   * Rendre la molette au calendrier.
   *
   * Radix porte le popover à `<body>`. Ouvert depuis un panneau latéral ou un
   * dialog — donc depuis un modal — il atterrit HORS du sous-arbre que
   * react-remove-scroll autorise, et celui-ci annule la molette sur tout le
   * reste : le calendrier s'affichait, mais ne défilait qu'en attrapant la
   * barre. Ici on arrête l'événement au niveau du popover, AVANT qu'il ne
   * remonte jusqu'au `document` où react-remove-scroll écoute ; le navigateur
   * fait alors défiler normalement.
   *
   * L'autre voie — porter le popover DANS le modal (`container`) — marche pour
   * le panneau latéral mais pas pour le dialog de création, dont le
   * `overflow-y: auto` rogne le calendrier. Une seule mécanique pour les deux,
   * donc, et le popover reste porté à `<body>` où rien ne le coupe.
   *
   * L'écoute est en phase de CAPTURE sur `document` : react-remove-scroll,
   * lui, écoute la même cible en phase de bulle, et la capture passe avant.
   * Un écouteur posé sur le nœud du popover ne suffirait pas (vérifié :
   * l'événement arrivait quand même `defaultPrevented` au document), et
   * `onWheel` de React encore moins — React délègue ses écouteurs, sans
   * garantie d'ordre face à un écouteur natif.
   *
   * `overscroll-contain` complète le tableau : sans lui, la molette
   * continuerait sur ce qu'il y a derrière une fois le calendrier en bout de
   * course.
   */
  React.useEffect(() => {
    if (!open) return;
    const keepWheel = (e: WheelEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest("[data-datetime-picker]")) {
        e.stopPropagation();
      }
    };
    document.addEventListener("wheel", keepWheel, { capture: true });
    return () =>
      document.removeEventListener("wheel", keepWheel, { capture: true });
  }, [open]);

  // Le mois affiché suit la valeur. C'est le pendant du recalage : sur un ticket
  // récurrent, cliquer un jour passé pose l'occurrence SUIVANTE, parfois le mois
  // d'après — sans ça, plus aucun jour ne serait surligné dans le mois affiché
  // et le clic aurait l'air de n'avoir rien fait. La navigation manuelle passe
  // par le même état, elle n'entre donc pas en conflit ; `open` dans les
  // dépendances la remet sur l'échéance à chaque ouverture, comme le faisait
  // `defaultMonth` quand le calendrier se remontait.
  const [month, setMonth] = React.useState<Date>(() => selected ?? new Date());
  React.useEffect(() => {
    const next = parseDueDate(value);
    if (next) setMonth(next);
  }, [value, open]);

  // Time is opt-in: a date is stored at midnight (date-only) until the user
  // switches the toggle on. Sync the toggle when the value gains/loses a time.
  const valueHasTime = selected ? dueDateHasTime(selected) : false;
  const [timeEnabled, setTimeEnabled] = React.useState(valueHasTime);
  React.useEffect(() => {
    setTimeEnabled(valueHasTime);
  }, [valueHasTime]);

  const label = selected
    ? format.dateTime(
        selected,
        dueDateFormat(selected, { compact: variant === "chip" }),
      )
    : null;
  const placeholderText = placeholder ?? t("placeholder");

  /* ── Récurrence (MIN-136) ─────────────────────────────────────────────── */

  // Le mode récurrent n'existe que si l'appelant l'a ouvert. Ailleurs (date
  // cible d'un objectif), tout ce bloc est inerte.
  const recurrable = !!onRecurrenceChange;
  const isRecurring = recurrable && !!recurrence;
  /** Cadence proposée quand on bascule en « Récurrent » : la maintenance, ça
      se fait par semaine plus souvent qu'autrement. */
  const DEFAULT_CADENCE: RecurrenceCadence = "weekly";

  const setMode = (mode: "once" | "recurring") => {
    if (!onRecurrenceChange) return;
    if (mode === "once") {
      onRecurrenceChange({ due_date: value, recurrence: null });
      return;
    }
    // Une cadence sans échéance n'existe pas : à défaut de date choisie, la
    // série démarre aujourd'hui (le calendrier reste là pour la déplacer).
    const start = new Date();
    if (!selected) start.setHours(0, 0, 0, 0);
    setCadence(DEFAULT_CADENCE, value ?? start.toISOString());
  };

  /** Poser (ou changer) la cadence recale l'échéance de départ : c'est le geste
      qui définit l'horaire, donc celui où « lundi dernier » devient « lundi
      prochain ». */
  const setCadence = (cadence: RecurrenceCadence, from: string | null) => {
    onRecurrenceChange?.({
      due_date: startDueDateISO(from, cadence) ?? from,
      recurrence: cadence,
    });
  };

  /** Ce que CHAQUE cadence donnerait pour l'échéance courante — « tous les
      lundis », « tous les 3 du mois » : le choix se lit sans avoir à le faire. */
  const cadenceLabel = (c: RecurrenceCadence) =>
    recurrenceLabel(c, selected, tRec, format, locale);

  // Les prochaines échéances, surlignées dans le mois affiché : voir où le
  // ticket va retomber vaut mieux que de le déduire de la cadence. La grille
  // déborde du mois (jours voisins), d'où la semaine de marge de chaque côté.
  const occurrences = React.useMemo(() => {
    const base = parseDueDate(value);
    if (!isRecurring || !recurrence || !base) return [];
    const from = new Date(month.getFullYear(), month.getMonth(), 1 - 7);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 7, 23, 59, 59, 999);
    return occurrencesBetween(base, recurrence, from, to);
  }, [isRecurring, recurrence, value, month]);

  // Preserve the picked wall-clock time; store as ISO.
  //
  // Sur un ticket récurrent, la date choisie est un DÉBUT et non une date
  // figée : choisir lundi dernier en hebdomadaire veut dire « tous les lundis »,
  // donc lundi prochain. Le serveur applique la même règle — la faire ici aussi
  // évite que la carte affiche une seconde l'échéance passée avant de se recaler.
  const commit = (d: Date) => {
    const resolved = isRecurring && recurrence ? startDueDate(d, recurrence) : d;
    onChange(resolved.toISOString());
  };

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const next = new Date(day);
    if (timeEnabled) {
      next.setHours(
        selected ? selected.getHours() : DEFAULT_HOUR,
        selected ? selected.getMinutes() : 0,
        0,
        0,
      );
    } else {
      next.setHours(0, 0, 0, 0); // date-only
    }
    commit(next);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [h, m] = e.target.value.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const next = new Date(selected ?? new Date());
    next.setHours(h, m, 0, 0);
    commit(next);
  };

  const toggleTime = (enabled: boolean) => {
    setTimeEnabled(enabled);
    if (!selected) return;
    const next = new Date(selected);
    next.setHours(enabled ? DEFAULT_HOUR : 0, 0, 0, 0);
    commit(next);
  };

  const clear = () => {
    // Effacer l'échéance d'un ticket récurrent coupe la récurrence : c'est la
    // date qui se décale, sans elle la série n'a plus de point de départ.
    if (isRecurring && onRecurrenceChange) {
      onRecurrenceChange({ due_date: null, recurrence: null });
    } else {
      onChange(null);
    }
    setOpen(false);
  };

  const stop = stopPropagation
    ? (e: React.SyntheticEvent) => e.stopPropagation()
    : undefined;

  // Un ticket récurrent porte l'icône de répétition partout où son échéance
  // s'affiche : c'est ce qui distingue « le 12 août » de « tous les mois, le
  // 12 août » sans allonger la puce. La cadence, elle, se lit au survol.
  const TriggerIcon = isRecurring ? Repeat : CalendarDays;

  let trigger: React.ReactNode;
  if (variant === "value") {
    trigger = (
      <button type="button" aria-label={ariaLabel} className={cn(VALUE_TRIGGER, className)}>
        {isRecurring && <Repeat className="size-3.5 shrink-0 text-muted-foreground" />}
        {label ?? <span className="text-muted-foreground">{placeholderText}</span>}
      </button>
    );
  } else if (variant === "chip") {
    trigger = (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={stop}
        onPointerDown={stop}
        className={cn(
          "-m-1 flex items-center gap-1 rounded-md p-1 text-[11px] text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted",
          className,
        )}
      >
        <TriggerIcon className="size-3 shrink-0" />
        <span>{label ?? placeholderText}</span>
      </button>
    );
  } else if (variant === "field") {
    trigger = (
      <button
        type="button"
        aria-label={ariaLabel}
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-ring",
          className,
        )}
      >
        <TriggerIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !label && "text-muted-foreground")}>
          {label ?? placeholderText}
        </span>
      </button>
    );
  }
  // variant === "anchored": no trigger — opens (controlled) at `anchor`.

  // A tooltip (with an optional shortcut badge) wraps triggered variants only —
  // the "anchored" variant has no visible trigger to hang a tooltip on.
  const showTooltip = tooltip && variant !== "anchored";
  // Sur un ticket récurrent, le survol dit la cadence — la seule chose que ni
  // la puce ni l'icône ne montrent.
  // La date de l'info-bulle est SANS heure quand le ticket est récurrent : la
  // cadence la porte déjà (« tous les lundis à 09:00 »), la répéter deux fois
  // dans la même phrase ne dit rien de plus.
  const tooltipText =
    isRecurring && recurrence && selected
      ? tRec("chip", {
          cadence: cadenceLabel(recurrence),
          date: format.dateTime(selected, {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
        })
      : tooltip;

  const popover = (
    <Popover open={open} onOpenChange={setOpen}>
      {variant === "anchored" ? (
        <PopoverAnchor asChild>
          <span
            aria-hidden
            style={{ position: "fixed", left: anchor?.x ?? 0, top: anchor?.y ?? 0 }}
          />
        </PopoverAnchor>
      ) : showTooltip ? (
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        </PopoverTrigger>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent
        align={variant === "field" || variant === "anchored" ? "start" : "end"}
        // Le contenu est haut (calendrier + heure, et la cadence en plus sur un
        // ticket récurrent) : sans plafond, ouvert depuis le bas d'un panneau il
        // débordait par le haut de la fenêtre, mois et onglets coupés. Radix
        // publie la hauteur disponible ; on s'y tient et on fait défiler.
        collisionPadding={8}
        // Repère de l'écouteur de molette ci-dessus — il reconnaît le popover
        // à cet attribut plutôt qu'à une ref, qui ne traverse pas la façade.
        data-datetime-picker=""
        className="max-h-(--radix-popover-content-available-height) w-auto overflow-y-auto overscroll-contain p-3"
        onClick={stop}
        onPointerDown={stop}
        // Variante ancrée : elle s'ouvre sur une action (raccourci D, entrée du
        // menu clic droit), pas sur un trigger. Ouverte depuis le menu, celui-ci
        // se démonte juste après et le focus retombe sur le document : Radix y
        // lit un « focus parti dehors » et referme le calendrier avant même
        // qu'on ait vu s'afficher. Le clic dehors et Échap le ferment toujours —
        // c'est bien le seul chemin qu'on neutralise ici.
        onFocusOutside={
          variant === "anchored" ? (e) => e.preventDefault() : undefined
        }
      >
        {/* La récurrence se décide AVANT la date : « récurrent, tous les mois »
            puis « à partir de quel jour ». C'est aussi ce qui reste visible en
            haut quand la fenêtre est trop courte et que le popover défile. */}
        {recurrable && (
          <div className="flex flex-col gap-2.5 pb-3">
            <SegmentedControl
              options={[
                { value: "once", label: tRec("once") },
                { value: "recurring", label: tRec("recurring") },
              ]}
              value={isRecurring ? "recurring" : "once"}
              onChange={setMode}
              ariaLabel={tRec("cadence")}
            />
            {isRecurring && (
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={cadenceId} className="text-sm text-muted-foreground">
                  {tRec("cadence")}
                </label>
                <Select
                  value={recurrence ?? undefined}
                  onValueChange={(v) => setCadence(v as RecurrenceCadence, value)}
                >
                  <SelectTrigger id={cadenceId} size="sm" className="w-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_CADENCES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {cadenceLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
        <Calendar
          mode="single"
          selected={selected ?? undefined}
          onSelect={handleDaySelect}
          month={month}
          onMonthChange={setMonth}
          modifiers={{ highlighted: occurrences }}
          locale={dfLocale}
        />
        <div className="flex flex-col gap-2.5 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={switchId} className="text-sm text-muted-foreground">
              {t("addTime")}
            </label>
            <Switch
              id={switchId}
              checked={timeEnabled}
              onCheckedChange={toggleTime}
              disabled={!selected}
            />
          </div>
          {timeEnabled && selected && (
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={timeId} className="text-sm text-muted-foreground">
                {t("time")}
              </label>
              <input
                id={timeId}
                type="time"
                value={`${pad(selected.getHours())}:${pad(selected.getMinutes())}`}
                onChange={handleTimeChange}
                className="rounded-md border border-input bg-transparent px-2 py-1 text-sm tabular-nums outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-calendar-picker-indicator]:opacity-60"
              />
            </div>
          )}
          {isRecurring && (
            <p className="max-w-[15rem] text-xs leading-snug text-muted-foreground">
              {tRec("hint")}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => handleDaySelect(new Date())}
            className="rounded-md px-1.5 py-1 text-xs font-medium text-primary outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
          >
            {t("today")}
          </button>
          {selected && (
            <button
              type="button"
              onClick={clear}
              className="rounded-md px-1.5 py-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:bg-muted"
            >
              {t("clear")}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );

  if (!showTooltip) return popover;
  return (
    <Tooltip>
      {popover}
      <TooltipContent className="flex items-center gap-1.5">
        {tooltipText}
        {shortcutHint && <Kbd size="sm">{shortcutHint}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}
