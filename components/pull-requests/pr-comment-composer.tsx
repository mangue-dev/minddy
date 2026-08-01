"use client";

// Le composer de commentaire d'une pull request (MIN-162).
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

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, cn, Spinner, Tabs, TabsList, TabsTrigger } from "mangue-ui";
import { AttachButton, DropOverlay, pasteFileHandler, useFileDrop } from "@/components/attachments";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { Markdown } from "@/components/markdown";
import { MentionTextarea } from "@/components/mention-textarea";
import { usePrMembersQuery } from "@/lib/use-pr-members-query";
import { useForgeUploads } from "@/lib/use-forge-uploads";

export function PrCommentComposer({
  prId,
  value,
  onChange,
  onSubmit,
  posting,
  placeholder,
  submitLabel,
  focusSignal,
}: {
  prId: string;
  value: string;
  /** Le brouillon vit chez l'appelant : « Citer » y écrit aussi (quoteReply). */
  onChange: (transform: (draft: string) => string) => void;
  onSubmit: () => void;
  posting: boolean;
  placeholder: string;
  submitLabel: string;
  /** Incrémenté par « Citer » : le message vient d'être écrit dans le brouillon,
      le curseur doit suivre. */
  focusSignal?: number;
}) {
  const t = useTranslations("PullRequests");
  const [tab, setTab] = useState<"write" | "preview">("write");
  // Les comptes de la forge ne se chargent qu'au premier « @ » tapé : ouvrir une
  // PR ne doit coûter aucune requête de plus, et la plupart se lisent sans qu'on
  // y écrive. Le drapeau ne redescend jamais — une fois la liste demandée, elle
  // reste en cache pour tout le temps du panneau.
  const [wantsMentions, setWantsMentions] = useState(false);
  const { members } = usePrMembersQuery(prId, wantsMentions);
  const uploads = useForgeUploads(prId, onChange);
  const drop = useFileDrop(uploads.addFiles);

  const body = value.trim();
  // Un fichier encore en vol laisserait sa ligne d'attente DANS le message
  // publié : on attend qu'il ait atterri, comme le composer de ticket attend
  // ses uploads.
  const canPost = !!body && !posting && !uploads.uploading;

  return (
    <div
      className={cn(
        "relative w-full rounded-lg border border-border bg-card transition-colors focus-within:border-ring",
        drop.dragging && "border-brand",
      )}
      onPaste={pasteFileHandler(uploads.addFiles)}
      {...drop.handlers}
    >
      <DropOverlay show={drop.dragging} />

      {/* « Écrire » / « Aperçu », comme chez GitHub : le corps d'un commentaire
          de PR est du markdown, souvent avec une image ou un extrait de code, et
          on n'a aujourd'hui aucun moyen de le voir avant de l'envoyer. */}
      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next as "write" | "preview")}
        className="gap-0"
      >
        <TabsList className="m-2.5 mb-0 h-auto">
          <TabsTrigger value="write" className="text-xs">
            {t("composerWrite")}
          </TabsTrigger>
          <TabsTrigger value="preview" className="text-xs" disabled={!body}>
            {t("composerPreview")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Le champ reste MONTÉ sous l'aperçu (`hidden`) : le démonter emporterait
          le caret, la pile d'annulation et les enveloppes de mentions — revenir
          à « Écrire » rendrait un champ amnésique. */}
      <div className={cn(tab === "preview" && "hidden")}>
        <MentionTextarea
          value={value}
          onChange={(next) => onChange(() => next)}
          forgeMembers={members}
          onMentionQuery={() => setWantsMentions(true)}
          focusSignal={focusSignal}
          onSubmit={onSubmit}
          placeholder={placeholder}
          dropUp
          includeNumo
          className="rounded-none border-0 bg-transparent px-3.5 py-2.5 focus-visible:border-0 focus-visible:ring-0"
        />
      </div>
      {tab === "preview" ? (
        <div className="px-3.5 py-2.5">
          <Markdown className="text-foreground">{value}</Markdown>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-1.5 px-2.5 pb-2.5">
        <AttachButton onFiles={uploads.addFiles} disabled={posting} />
        <DictateButton
          onTranscription={(text) =>
            onChange((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))
          }
          disabled={posting}
        />
        {body || posting ? (
          <Button
            size="sm"
            className="rounded-full px-4"
            disabled={!canPost}
            onClick={onSubmit}
          >
            {posting ? <Spinner /> : null}
            {submitLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
