"use client";

// Le composer de commentaire d'une pull request (MIN-162) — celui du FIL, et
// celui d'une remarque de LIGNE.
//
// Il était resté le plus pauvre de l'app — un textarea nu et un bouton — sur une
// prémisse fausse : « un commentaire part sur GitHub, où mentions et pièces
// jointes n'ont pas de sens ». Les deux en ont un, et ce sont deux gestes qu'on
// fait tout le temps. Ce qui CHANGE par rapport au composer de ticket
// (`CommentComposer`, components/issue-timeline) n'est ni la barre d'outils ni
// le glisser-déposer : c'est la SOURCE des mentions et la DESTINATION des
// fichiers.
//
//  · Les mentions viennent de la FORGE — les collaborateurs du dépôt, pas les
//    membres minddy : un `@` finit chez GitHub, où citer quelqu'un qui n'y a pas
//    de compte ne notifie personne. `@Numo` fait la seule exception, et elle est
//    dite visuellement (son visage, en tête de liste) : c'est minddy qui la
//    traite, avant l'envoi.
//  · Les fichiers vont dans le stockage minddy et s'écrivent DANS le corps du
//    message — la forge n'a aucune idée de ce qu'est une pièce jointe minddy, et
//    n'affichera que ce que le texte dit (cf. `useForgeUploads`).
//
// L'aperçu, lui, est du markdown rendu par le `Markdown` de l'app : c'est ce qui
// manquait le plus à l'œil, et le composant existait déjà.
//
// Une `PrEndpoint` et non un id de PR : la vue diff ne connaît qu'elle, et c'est
// ce qui permet au champ de la ligne d'être LE MÊME dans le panneau PR et dans
// la vue diff d'une session d'agent (les façades `agent-runs/[runId]/pr/*`).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, cn, Spinner, Tabs, TabsList, TabsTrigger } from "mangue-ui";
import {
  AttachButton,
  DropOverlay,
  pasteFileHandler,
  useFileDrop,
} from "@/components/resources";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { Markdown } from "@/components/markdown";
import { TAB_TRIGGER_DENSE } from "@/components/tab-bar";
import { MentionTextarea } from "@/components/mention-textarea";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { usePrMembersQuery } from "@/lib/use-pr-members-query";
import { useForgeUploads } from "@/lib/use-forge-uploads";
import type { PrEndpoint } from "@/lib/agent-api";

export function PrCommentComposer({
  endpoint,
  value,
  onChange,
  onSubmit,
  onCancel,
  posting,
  placeholder,
  submitLabel,
  focusSignal,
  autoFocus,
  variant = "thread",
}: {
  endpoint: PrEndpoint;
  value: string;
  /** Le brouillon vit chez l'appelant : « Citer » y écrit aussi (quoteReply). */
  onChange: (transform: (draft: string) => string) => void;
  onSubmit: () => void;
  /** Présent sur une remarque de ligne : elle s'ouvre et se referme, là où le
      composer du fil est toujours là. Échap l'appelle. */
  onCancel?: () => void;
  posting: boolean;
  placeholder: string;
  submitLabel: string;
  /** Incrémenté par « Citer » : le message vient d'être écrit dans le brouillon,
      le curseur doit suivre. */
  focusSignal?: number;
  autoFocus?: boolean;
  /**
   * `thread` : épinglé en pied de panneau — les suggestions s'ouvrent VERS LE
   * HAUT, sinon elles sortiraient de l'écran.
   * `line` : ancré sous une ligne du diff, au milieu d'une zone qui défile —
   * plus compact, et il porte un bouton Annuler.
   */
  variant?: "thread" | "line";
}) {
  const t = useTranslations("PullRequests");
  const [tab, setTab] = useState<"write" | "preview">("write");
  // Les comptes de la forge ne se chargent qu'au premier « @ » tapé : ouvrir une
  // PR ne doit coûter aucune requête de plus, et la plupart se lisent sans qu'on
  // y écrive. Le drapeau ne redescend jamais — une fois la liste demandée, elle
  // reste en cache pour tout le temps du panneau.
  const [wantsMentions, setWantsMentions] = useState(false);
  const { members } = usePrMembersQuery(endpoint, wantsMentions);
  const uploads = useForgeUploads(endpoint, onChange);
  const drop = useFileDrop(uploads.addFiles);

  const line = variant === "line";
  const body = value.trim();
  // Un fichier encore en vol laisserait sa ligne d'attente DANS le message
  // publié : on attend qu'il ait atterri, comme le composer de ticket attend
  // ses uploads.
  const canPost = !!body && !posting && !uploads.uploading;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "relative w-full border border-border transition-colors focus-within:border-ring",
          // Le composer du fil porte le rayon du champ de Numo sur la page
          // Agents (`chat-input`, rounded-2xl) : c'est le même geste, la même
          // place à l'écran, il n'y avait pas de raison qu'il ait une autre
          // silhouette. Celui d'une remarque de LIGNE garde un rayon plus
          // serré — il est ancré dans le diff, à la taille d'une ligne de code,
          // et 24px de coins y pèseraient plus que la boîte elle-même.
          line ? "rounded-lg bg-background" : "rounded-2xl bg-card",
          drop.dragging && "border-brand",
        )}
        onPaste={pasteFileHandler(uploads.addFiles)}
        {...drop.handlers}
      >
        <DropOverlay show={drop.dragging} />

        {/* « Écrire » / « Aperçu », comme chez GitHub : le corps d'un commentaire
            de PR est du markdown, souvent avec une image ou un extrait de code,
            et on n'a aujourd'hui aucun moyen de le voir avant de l'envoyer. */}
        <Tabs
          value={tab}
          onValueChange={(next) => setTab(next as "write" | "preview")}
          className="gap-0"
        >
          <TabsList className={cn("mb-0 h-auto", line ? "m-2 mb-0" : "m-2.5 mb-0")}>
            <TabsTrigger value="write" className={cn(TAB_TRIGGER_DENSE, "text-xs")}>
              {t("composerWrite")}
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className={cn(TAB_TRIGGER_DENSE, "text-xs")}
              disabled={!body}
            >
              {t("composerPreview")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Le champ reste MONTÉ sous l'aperçu (`hidden`) : le démonter emporterait
            le caret, la pile d'annulation et les enveloppes de mentions —
            revenir à « Écrire » rendrait un champ amnésique. */}
        <div className={cn(tab === "preview" && "hidden")}>
          <MentionTextarea
            value={value}
            onChange={(next) => onChange(() => next)}
            forgeMembers={members}
            onMentionQuery={() => setWantsMentions(true)}
            focusSignal={focusSignal}
            autoFocus={autoFocus}
            onSubmit={onSubmit}
            onEscape={onCancel}
            placeholder={placeholder}
            // Ancré dans le diff, le champ est HAUT dans une zone qui défile :
            // une liste qui s'ouvrirait vers le haut se replierait hors de vue.
            dropUp={!line}
            includeNumo
            className={cn(
              "rounded-none border-0 bg-transparent focus-visible:border-0 focus-visible:ring-0",
              line ? "max-h-40 px-3 py-2" : "px-3.5 py-2.5",
            )}
          />
        </div>
        {tab === "preview" ? (
          <div className={cn(line ? "px-3 py-2" : "px-3.5 py-2.5")}>
            <Markdown className="text-foreground">{value}</Markdown>
          </div>
        ) : null}

        <div
          className={cn(
            "flex items-center justify-end gap-1.5",
            line ? "px-2 pb-2" : "px-2.5 pb-2.5",
          )}
        >
          <AttachButton onFiles={uploads.addFiles} disabled={posting} />
          <DictateButton
            onTranscription={(text) =>
              onChange((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))
            }
            disabled={posting}
          />
          {/* Le fil ne montre son bouton d'envoi qu'une fois qu'il y a quelque
              chose à envoyer ; une remarque de ligne le garde, parce qu'elle a
              été OUVERTE exprès et qu'elle porte son Annuler à côté. */}
          {line || body || posting ? (
            <>
              {onCancel ? (
                <Button variant="ghost" size="sm" onClick={onCancel} disabled={posting}>
                  {t("cancel")}
                </Button>
              ) : null}
              <SendShortcutTooltip label={submitLabel}>
                <Button
                  size="sm"
                  className={cn(!line && "rounded-full px-4")}
                  disabled={!canPost}
                  onClick={onSubmit}
                >
                  {posting ? <Spinner /> : null}
                  {submitLabel}
                </Button>
              </SendShortcutTooltip>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
