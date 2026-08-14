"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AppWindow } from "lucide-react";
import { Switch } from "mangue-ui";

import { getDesktopBridge } from "@/lib/desktop/bridge";
import { desktopChannelForOrigin, type DesktopChannel } from "@/lib/desktop/channel";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";

/**
 * Compte → Préférences : le CANAL de l'app de bureau (MIN-352).
 *
 * ## Elle n'existe que dans l'app, et sans ancre
 *
 * Pas d'entrée dans `SETTINGS_SECTIONS`, contrairement à toutes ses voisines, et
 * ce n'est pas un oubli : le catalogue alimente ⌘K, qui tourne partout. Une
 * entrée ici donnerait à chaque personne sur le web une ligne de palette qui
 * ouvre les préférences et ne surligne rien — exactement le défaut que
 * `settings-sections.test.ts` existe pour empêcher. Une carte qui n'apparaît que
 * dans un contexte n'a pas sa place dans une table lue par tous les contextes.
 *
 * ## L'état vient de l'origine, pas du pont
 *
 * `window.location.origin` EST le canal : c'est l'origine qui sert cette page.
 * Aucun aller-retour à faire, et surtout aucun second état à tenir synchrone
 * avec l'URL réellement chargée. `null` — le dév sur `localhost`, ou tout
 * simplement le navigateur — retire la carte plutôt que d'afficher un
 * interrupteur qui ne bougerait pas.
 */
export function AccountDesktopSection() {
  const ta = useTranslations("Account");
  // `null` jusqu'au montage : le pont et l'origine n'existent que côté client, et
  // rendre la carte au premier passage la ferait clignoter chez tout le monde.
  const [channel, setChannel] = useState<DesktopChannel | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!getDesktopBridge()) return;
    setChannel(desktopChannelForOrigin(window.location.origin));
  }, []);

  if (!channel) return null;

  // On ne revient PAS de cet appel : le main process recharge la fenêtre sur
  // l'autre origine, et ce document cesse d'exister. L'interrupteur se fige donc
  // sur la position demandée — il n'y a personne pour le remettre, et c'est ce
  // qu'on veut voir pendant la seconde de chargement.
  const toggle = (next: boolean) => {
    const bridge = getDesktopBridge();
    if (!bridge || switching) return;
    setSwitching(true);
    setChannel(next ? "preview" : "stable");
    bridge.setChannel(next ? "preview" : "stable");
  };

  return (
    <SettingsGroup
      icon={AppWindow}
      title={ta("desktopSectionTitle")}
      description={ta("desktopSectionDesc")}
    >
      <SettingsRow
        htmlFor="account-desktop-preview"
        label={ta("desktopPreviewLabel")}
        hint={ta("desktopPreviewDesc")}
        control={
          <Switch
            id="account-desktop-preview"
            checked={channel === "preview"}
            onCheckedChange={toggle}
            disabled={switching}
          />
        }
      />
    </SettingsGroup>
  );
}
