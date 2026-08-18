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
 * Project settings → THE LOCAL FOLDER (MIN-359).
 *
 * ## It only exists in the app, and without anchor
 *
 * Like the channel map ([account-desktop-section.tsx](account-desktop-section.tsx)),
 * and for the same reason: no entry in `SETTINGS_SECTIONS`, because the
 * catalog feeds ⌘K, which runs everywhere. An anchor here would give every
 * person on the web a palette line that opens the settings and highlights
 * nothing.
 *
 * ## This setting is not for the project, it's for THIS machine
 *
 * A path home means nothing elsewhere. The attachment lives in the app
 * (`userData/repos.json`), and nothing from it goes up to the server — hence the fact that a
 * colleague on another machine will never see this folder, nor will it be able to enforce it. What the card says must therefore be true FOR THE ONE WHO READS IT, and
 * do not promise anything to anyone else.
 *
 * ## The sentence
 *
 * The screen which activates the mode must say in one sentence what it allows. It
 * is not decorative: it is the only thing we read before letting an
 * agent open a real folder, with real files, under his own account —
 * and what the agent reads there goes up the thread of the conversation, so at
 * minddy. Saying it here is cheaper than finding out afterwards.
 */
export function ProjectLocalRepoSection({ projectId }: { projectId: string }) {
  const t = useTranslations("Settings");
  const ta = useTranslations("Agent");
  const { state, linked, busy, attach, detach } = useLocalRepo(projectId);

  // No bridge (so no desktop app), or no linked repository: nothing to
  // attach, and a gray card would teach nothing.
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
            {/* A retained file that has become invalid SAYS why: without that, the
 "attach" button would reappear without anyone understanding
 that yesterday's file has moved. */}
            {state.status === "invalid"
              ? ta(LOCAL_REPO_ERROR_KEYS[state.reason])
              : t("localRepoEmpty")}
          </SettingsEmpty>
          <Button variant="outline" size="sm" onClick={choose} disabled={busy}>
            {t("localRepoAttach")}
          </Button>
        </div>
      )}
      {/* THE SENTENCE. Under the gesture and not above: we read it at the moment of
 deciding, not before having understood what it is about. It remains displayed after the folder is attached — that's where it describes what's really going on. */}
      <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
        {t("localRepoWarning")}
      </p>
    </SettingsGroup>
  );
}
