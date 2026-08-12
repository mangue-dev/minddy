"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronsUpDown, ListPlus } from "lucide-react";
import {
  Button,
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  commandFilter,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "mangue-ui";
import { ModelLogo, ProviderLogo } from "@/components/model-logo";
import { formatModelName } from "@/lib/model-display";
import { formatMultiplier, isMultiplierWithinPlan } from "@/lib/model-multiplier";
import {
  useAgentModelsQuery,
  type AgentModel,
  type AgentModelsScope,
} from "@/lib/use-agent-models-query";

/**
 * Picker de modèle recherchable de l'agent (MIN-46). Recherche dans le catalogue
 * du provider ACTIF (BYOK ou clé plateforme), chaque entrée avec son logo et son
 * nom reformaté (`formatModelName`). `value` vaut "" pour « mon défaut », sinon
 * l'id du modèle. Saisie libre autorisée (`freeTextLabel`) : indispensable pour
 * un provider générique dont `/models` peut être vide/indisponible. On
 * filtre/score nous-mêmes (`shouldFilter={false}`) et on tronque à MAX_RESULTS.
 *
 * À L'OUVERTURE, la liste n'est pas le catalogue : c'est la courte sélection des
 * modèles CONSEILLÉS (`recommended`, réglée dans /admin, cf.
 * lib/recommended-models.ts). Trois cents modèles rangés par ordre alphabétique
 * ouvrent sur `agentica-org/…` — un rang qui ne dit rien de ce qui marche, et
 * qui laisse le choix entier à charge de quelqu'un qui voulait juste lancer un
 * agent. Rien n'est CACHÉ pour autant : taper cherche dans tout le catalogue, et
 * une dernière ligne l'ouvre en entier sans rien taper. Quand le serveur ne
 * renvoie aucun conseil applicable (BYOK aux ids natifs, catalogue admin, liste
 * vidée), on retombe sur le catalogue entier — le comportement d'avant.
 *
 * Chaque modèle porte son COÛT relatif au modèle par défaut de minddy (« ×2,4 »,
 * cf. lib/model-multiplier.ts), et ceux qui dépassent le plafond du plan sont
 * GRISÉS, pas cachés : savoir qu'un modèle existe et ce qu'il coûte est
 * précisément ce qui donne une raison de changer de plan. Le serveur les refuse
 * de son côté (`ensureModelInPlan`) — le grisé est une politesse, pas la serrure.
 *
 * Les deux vont ensemble mais ne dépendent pas l'un de l'autre : le « ×N »
 * s'affiche dès que le catalogue situe le modèle, le grisé n'apparaît que s'il
 * envoie AUSSI un plafond. C'est ce qui donne son échelle de coût au dashboard
 * admin, où l'on choisit ce que minddy paye sans qu'aucun plan s'applique. En
 * BYOK, en revanche, le catalogue ne situe rien du tout et il n'y a donc rien à
 * montrer : l'utilisateur paye ses propres tokens, et une échelle indexée sur le
 * défaut de minddy ne parlerait pas de sa facture.
 */

const MAX_RESULTS = 50;

/** Nom affichable d'un plan : son id capitalisé (« go » → « Go »). */
function planLabel(id: string | null): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : "";
}

export function ModelCombobox({
  value,
  onChange,
  defaultLabel,
  defaultModelId,
  placeholder,
  emptyLabel,
  loadingLabel,
  freeTextLabel,
  disabled,
  disabledTooltip,
  variant = "field",
  scope = "user",
}: {
  /** "" = suit mon modèle par défaut ; sinon un id de modèle. */
  value: string;
  onChange: (value: string) => void;
  defaultLabel: string;
  /** Modèle vers lequel « le défaut » résout (affiché en aparté sur l'option défaut). */
  defaultModelId?: string | null;
  placeholder: string;
  emptyLabel: string;
  loadingLabel: string;
  /** Libellé de l'option « utiliser tel quel » (saisie libre). */
  freeTextLabel: (query: string) => string;
  disabled?: boolean;
  /**
   * Tooltip affiché quand le picker est verrouillé (variante `compact`) : le modèle
   * est figé pour la session, ex. « pour en changer, lancez un nouvel agent ».
   */
  disabledTooltip?: string;
  /**
   * `field` (défaut) : trigger pleine largeur façon champ de formulaire.
   * `compact` : petit pill (logo + nom) pour la barre d'un composer de chat.
   */
  variant?: "field" | "compact";
  /**
   * Catalogue interrogé. `user` (défaut) = le provider actif du compte ;
   * `platform` = la clé plateforme OpenRouter, pour la config admin.
   */
  scope?: AgentModelsScope;
}) {
  const { provider, models, maxMultiplier, planId, recommended, loading } =
    useAgentModelsQuery(scope);
  const locale = useLocale();
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // « Voir tous les modèles » : dépliage explicite, remis à plat à la fermeture
  // comme la recherche — rouvrir le picker doit toujours rouvrir sur les conseils.
  const [showAll, setShowAll] = useState(false);

  /**
   * Les conseils tels qu'on peut les AFFICHER : l'ordre de l'admin, résolu sur
   * le catalogue. Le modèle actuellement choisi y est joint s'il n'en fait pas
   * partie — sans lui, le picker s'ouvrirait sur une liste où rien n'est coché,
   * alors qu'un modèle est bel et bien sélectionné.
   */
  const shortlist = useMemo(() => {
    if (recommended.length === 0) return [];
    const byId = new Map(models.map((m) => [m.id, m]));
    const list = recommended.map((id) => byId.get(id)).filter((m): m is AgentModel => !!m);
    const current = value ? byId.get(value) : undefined;
    return current && !recommended.includes(value) ? [...list, current] : list;
  }, [models, recommended, value]);

  // Liste courte tant qu'il y a des conseils, qu'on ne cherche pas et qu'on n'a
  // pas déplié.
  const collapsed = shortlist.length > 0 && !query.trim() && !showAll;

  const results = useMemo(() => {
    const q = query.trim();
    if (collapsed) return shortlist;
    if (!q) return models.slice(0, MAX_RESULTS);
    return models
      .map((m) => ({ m, score: commandFilter(`${formatModelName(m.id)} ${m.id}`, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.m);
  }, [collapsed, models, query, shortlist]);

  // Logo : OpenRouter → par id (`vendor/model`) ; sinon logo du provider actif.
  const logoFor = (modelId: string) =>
    provider === "openrouter" ? (
      <ModelLogo model={modelId} />
    ) : (
      <ProviderLogo provider={provider} />
    );

  const trimmed = query.trim();
  const showFreeText = trimmed.length > 0 && !models.some((m) => m.id === trimmed);

  // Le plafond ne s'affiche que si le catalogue en renvoie un ET qu'au moins un
  // modèle est situé dessus : sur une liste sans prix (index illisible), une
  // note « au-delà de ×4… » n'expliquerait rien qui se voie.
  const allowed = (m: AgentModel) =>
    maxMultiplier == null || isMultiplierWithinPlan(m.multiplier, maxMultiplier);
  const showCapHint =
    maxMultiplier != null && results.some((m) => m.multiplier != null && !allowed(m));

  /**
   * Le « ×N » d'une ligne — muet tant que le catalogue ne situe pas ce modèle.
   * `alwaysAllowed` pour l'option « défaut », qui échappe au plafond : sans lui,
   * un défaut d'instance cher porterait la couleur des lignes refusées tout en
   * restant cliquable.
   */
  const multiplierBadge = (m: AgentModel, alwaysAllowed = false) =>
    m.multiplier != null ? (
      <span
        className={cn(
          "shrink-0 text-xs tabular-nums",
          alwaysAllowed || allowed(m) ? "text-muted-foreground/70" : "text-muted-foreground"
        )}
      >
        {formatMultiplier(m.multiplier, locale)}
      </span>
    ) : null;

  const select = (next: string) => {
    onChange(next);
    setQuery("");
    setShowAll(false);
    setOpen(false);
  };

  /** Une ligne de modèle — rendue telle quelle, ou dans le groupe des conseils. */
  const modelRow = (m: AgentModel) => (
    <CommandItem
      key={m.id}
      value={m.id}
      // Hors plafond : la ligne reste LISIBLE (opacité de cmdk) mais n'est ni
      // cliquable ni navigable au clavier.
      disabled={!allowed(m)}
      onSelect={() => select(m.id)}
    >
      {logoFor(m.id)}
      <span className="flex-1 truncate">{formatModelName(m.id)}</span>
      {multiplierBadge(m)}
      <Check className={cn("size-4 shrink-0", value === m.id ? "opacity-100" : "opacity-0")} />
    </CommandItem>
  );

  // Rendu de l'option « défaut » : libellé + modèle résolu (logo + nom) en aparté.
  // Son multiplicateur s'affiche comme celui des autres, mais elle n'est JAMAIS
  // grisée : c'est un défaut de minddy, et minddy ne se refuse pas les siens
  // (`pr_review_model` vaut délibérément un modèle cher).
  const defaultEntry = defaultModelId ? models.find((m) => m.id === defaultModelId) : undefined;
  const defaultRow = (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {defaultModelId ? logoFor(defaultModelId) : null}
      <span className="truncate text-muted-foreground">{defaultLabel}</span>
      {defaultModelId ? (
        <span className="truncate text-xs text-muted-foreground/70">
          {formatModelName(defaultModelId)}
        </span>
      ) : null}
      {defaultEntry ? <span className="ml-auto">{multiplierBadge(defaultEntry, true)}</span> : null}
    </span>
  );

  // Verrouillé (agent lancé) : chip statique + tooltip, SANS popover. Le <span>
  // extérieur porte le hover (un bouton `disabled` n'émet pas d'événement pointer,
  // donc le tooltip ne s'ouvrirait pas si on le mettait sur le bouton).
  if (variant === "compact" && disabled && disabledTooltip) {
    const shown = value || defaultModelId || "";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <span className="pointer-events-none flex h-8 shrink items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-foreground/45">
              {shown ? logoFor(shown) : null}
              <span className="max-w-[9rem] truncate">
                {shown ? formatModelName(shown) : defaultLabel}
              </span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{disabledTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setShowAll(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        {variant === "compact" ? (
          <Button
            type="button"
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-8 shrink gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 text-xs font-medium text-foreground/80 hover:bg-muted"
          >
            {value
              ? logoFor(value)
              : defaultModelId
                ? logoFor(defaultModelId)
                : null}
            <span className="max-w-[9rem] truncate">
              {/* Toujours le nom réel du modèle : même quand on suit « le défaut »,
                  on affiche le modèle résolu (fallback sur le libellé si inconnu). */}
              {value
                ? formatModelName(value)
                : defaultModelId
                  ? formatModelName(defaultModelId)
                  : defaultLabel}
            </span>
            <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {value ? (
              <span className="flex min-w-0 items-center gap-2">
                {logoFor(value)}
                <span className="truncate">{formatModelName(value)}</span>
              </span>
            ) : (
              defaultRow
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      {/* La liste se dimensionne sur SON contenu, pas sur le déclencheur : les
          noms de modèles sont longs, et le picker vit désormais dans une rangée
          de réglages où le bouton fait la largeur qu'il veut. `PopoverContent`
          est déjà `w-max min-w-(--radix-popover-trigger-width)` — on ne lui
          impose donc qu'un plafond, pour qu'un id à rallonge ne sorte pas de
          l'écran. Épingler la largeur au déclencheur (ce que faisait
          `w-[var(--radix-popover-trigger-width)]`) écrasait tout. */}
      {/* `rounded-xl` (20px) et non le `rounded-lg` par défaut du popover :
          c'est `Command` qui peint cette surface et il s'impose déjà 20px.
          Avec le retrait de 8px de la liste, les options (12px) sont alors
          concentriques — 20 − 8 = 12. */}
      <PopoverContent
        className={cn(
          "rounded-xl p-0",
          variant === "compact" ? "w-80" : "max-w-[min(30rem,calc(100vw-2rem))]"
        )}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
          {/* `p-1` et non `px-1` : par-dessus le `p-1` de `Command`, ça fait le
              MÊME retrait de 8px des quatre côtés — celui du champ de recherche.
              Un padding horizontal seul laissait la dernière option à 4px du bas
              et à 8px des côtés, et aucun rayon ne peut être juste là-dessous. */}
          <CommandList className="p-1">
            <CommandItem value="__default__" onSelect={() => select("")}>
              {defaultRow}
              <Check className={cn("size-4 shrink-0", value ? "opacity-0" : "opacity-100")} />
            </CommandItem>
            {/* Groupé sous son titre quand c'est la sélection conseillée : la
                liste est courte, et le titre est ce qui dit POURQUOI. `p-0` : le
                padding du groupe décalerait ses options de celle du défaut,
                juste au-dessus (la liste porte déjà son `px-1`). */}
            {collapsed ? (
              <CommandGroup className="p-0" heading={t("modelRecommended")}>
                {results.map(modelRow)}
              </CommandGroup>
            ) : (
              results.map(modelRow)
            )}
            {/* Le catalogue entier, sans avoir à deviner quoi taper. Une option
                de la liste plutôt qu'un bouton en pied : elle se navigue au
                clavier, dans la continuité des modèles au-dessus. */}
            {collapsed ? (
              <CommandItem value="__all__" onSelect={() => setShowAll(true)}>
                <ListPlus className="size-4 shrink-0 text-muted-foreground" />
                {/* Pas de compte annoncé : le dépliage tronque à MAX_RESULTS,
                    et promettre « les 321 modèles » pour en montrer 50 serait
                    faux. Ce qui les atteint tous, c'est la recherche. */}
                <span className="flex-1 truncate text-muted-foreground">{t("modelShowAll")}</span>
              </CommandItem>
            ) : null}
            {showFreeText ? (
              <CommandItem value={`__free__${trimmed}`} onSelect={() => select(trimmed)}>
                {logoFor(trimmed)}
                <span className="flex-1 truncate">{freeTextLabel(trimmed)}</span>
                <Check
                  className={cn("size-4 shrink-0", value === trimmed ? "opacity-100" : "opacity-0")}
                />
              </CommandItem>
            ) : null}
            {results.length === 0 && !showFreeText ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                {loading ? (
                  <>
                    <Spinner />
                    {loadingLabel}
                  </>
                ) : (
                  emptyLabel
                )}
              </div>
            ) : null}
          </CommandList>
          {/* Ce qui explique le grisé. En pied de liste et hors du scroll : un
              tooltip par ligne était impossible (une option désactivée n'émet
              aucun événement pointer), et la raison doit rester lisible pendant
              qu'on parcourt le catalogue. */}
          {showCapHint && maxMultiplier != null ? (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              {t("modelPlanCap", { plan: planLabel(planId), limit: maxMultiplier })}
            </p>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
