"use client";

import { useTranslations } from "next-intl";
import { Button, toast } from "mangue-ui";
import { FolderGit2 } from "lucide-react";

import { LOCAL_REPO_ERROR_KEYS } from "@/components/agent/environment-combobox";
import {
  SettingsEmpty,
  SettingsGroup,
  SettingsListRow,
} from "@/components/settings/settings-ui";
import { useLocalRepo } from "@/lib/use-local-repo";

/**
 * Réglages du projet → LE DOSSIER LOCAL (MIN-359).
 *
 * ## Elle n'existe que dans l'app, et sans ancre
 *
 * Comme la carte du canal ([account-desktop-section.tsx](account-desktop-section.tsx)),
 * et pour la même raison : pas d'entrée dans `SETTINGS_SECTIONS`, parce que le
 * catalogue alimente ⌘K, qui tourne partout. Une ancre ici donnerait à chaque
 * personne sur le web une ligne de palette qui ouvre les réglages et ne surligne
 * rien.
 *
 * ## Ce réglage n'est pas celui du projet, c'est celui de CETTE machine
 *
 * Un chemin de home ne veut rien dire ailleurs. L'attachement vit dans l'app
 * (`userData/repos.json`), et rien n'en monte au serveur — d'où le fait qu'un
 * collègue sur une autre machine ne verra jamais ce dossier, ni ne pourra
 * l'imposer. Ce que la carte dit doit donc être vrai POUR CELUI QUI LA LIT, et
 * ne rien promettre à personne d'autre.
 *
 * ## La phrase
 *
 * L'écran qui active le mode doit dire en une phrase ce que ça autorise. Elle
 * n'est pas décorative : c'est la seule chose qu'on lit avant de laisser un
 * agent ouvrir un vrai dossier, avec de vrais fichiers, sous son propre compte —
 * et ce que l'agent y lit remonte dans le fil de la conversation, donc chez
 * minddy. Le dire ici est moins cher que de le découvrir après.
 */
export function ProjectLocalRepoSection({ projectId }: { projectId: string }) {
  const t = useTranslations("Settings");
  const ta = useTranslations("Agent");
  const { state, linked, busy, attach, detach } = useLocalRepo(projectId);

  // Pas de pont (donc pas d'app de bureau), ou pas de dépôt lié : rien à
  // attacher, et une carte grise n'apprendrait rien.
  if (!state || !linked) return null;

  const choose = () => {
    void attach().then((next) => {
      if (next && next.status === "invalid") {
        toast.error(ta(LOCAL_REPO_ERROR_KEYS[next.reason]));
      }
    });
  };

  return (
    <SettingsGroup
      icon={FolderGit2}
      title={t("localRepoTitle")}
      description={t("localRepoDesc")}
      variant="block"
    >
      {state.status === "ready" ? (
        <SettingsListRow
          className="py-1"
          icon={FolderGit2}
          title={state.folder}
          subtitle={state.path}
          truncateSubtitle={false}
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={choose} disabled={busy}>
                {t("localRepoChange")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void detach()}
                disabled={busy}
              >
                {t("localRepoDetach")}
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col items-start gap-3 py-1">
          <SettingsEmpty className="py-0">
            {/* Un dossier retenu devenu invalide DIT pourquoi : sans ça, le
                bouton « attacher » réapparaîtrait sans que personne comprenne
                que le dossier d'hier a bougé. */}
            {state.status === "invalid"
              ? ta(LOCAL_REPO_ERROR_KEYS[state.reason])
              : t("localRepoEmpty")}
          </SettingsEmpty>
          <Button variant="outline" size="sm" onClick={choose} disabled={busy}>
            {t("localRepoAttach")}
          </Button>
        </div>
      )}
      {/* LA PHRASE. Sous le geste et pas au-dessus : on la lit au moment de
          décider, pas avant d'avoir compris de quoi il s'agit. Elle reste
          affichée une fois le dossier attaché — c'est là qu'elle décrit ce qui
          se passe vraiment. */}
      <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
        {t("localRepoWarning")}
      </p>
    </SettingsGroup>
  );
}
