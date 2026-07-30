"use client";

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { cn } from "mangue-ui";

/**
 * Saisie d'un code à six chiffres — deux groupes de trois, séparés d'un tiret
 * (MIN-132). Utilisé par l'écran de challenge et par l'enrôlement.
 *
 * ## Pourquoi une lib, et pas six `<input>`
 *
 * Six champs séparés cassent exactement ce qu'on veut ici : le **remplissage
 * automatique**. Safari, l'app Mots de passe d'Apple et les gestionnaires
 * tiers ne proposent leur code que sur UN champ portant
 * `autocomplete="one-time-code"` ; six champs à un caractère ne ressemblent à
 * rien qu'ils sachent remplir, et le collage manuel doit alors être réimplémenté
 * à la main (répartition des caractères, focus, effacement arrière).
 *
 * `input-otp` résout ça de la seule façon qui marche : il n'y a **qu'un vrai
 * `<input>`**, transparent, superposé aux cases. Le gestionnaire de mots de
 * passe voit un champ unique de six caractères, propose son code et le remplit ;
 * le collage, les flèches, la sélection et le retour arrière sont ceux du
 * navigateur. Les cases ne sont que du dessin.
 *
 * `pushPasswordManagerStrategy: "increase-width"` (le défaut de la lib) écarte
 * légèrement la zone quand une pastille de gestionnaire de mots de passe est
 * détectée, pour qu'elle ne recouvre pas le dernier chiffre.
 */

/** Une case. Purement décorative : le vrai champ est transparent, au-dessus. */
function Slot({ char, isActive }: SlotProps) {
  return (
    <div
      className={cn(
        "flex h-11 w-10 items-center justify-center rounded-md border border-input bg-card",
        "font-mono text-base tabular-nums transition-colors",
        // Pas de faux curseur clignotant : il demanderait un keyframe global
        // pour ce seul composant, alors que l'anneau dit déjà où on en est —
        // et c'est l'indication de focus des autres champs de l'app.
        isActive && "z-10 border-ring ring-2 ring-ring/40"
      )}
    >
      {char}
    </div>
  );
}

export function OtpInput({
  id,
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
}) {
  return (
    <OTPInput
      id={id}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      maxLength={6}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      // Le clavier numérique sur mobile, et rien d'autre que des chiffres —
      // y compris au collage, où la lib filtre sur ce motif.
      inputMode="numeric"
      pattern={REGEXP_ONLY_DIGITS}
      // Explicite bien que ce soit le défaut de la lib : c'est CE mot-clé que
      // Safari et les gestionnaires de mots de passe cherchent pour proposer le
      // code généré. Le perdre casserait silencieusement le remplissage.
      autoComplete="one-time-code"
      containerClassName={cn(
        "flex items-center gap-2",
        disabled && "pointer-events-none opacity-60"
      )}
      render={({ slots }) => (
        <>
          <div className="flex gap-2">
            {slots.slice(0, 3).map((slot, i) => (
              <Slot key={i} {...slot} />
            ))}
          </div>
          <div aria-hidden className="w-2 text-center text-muted-foreground">
            –
          </div>
          <div className="flex gap-2">
            {slots.slice(3).map((slot, i) => (
              <Slot key={i + 3} {...slot} />
            ))}
          </div>
        </>
      )}
    />
  );
}
