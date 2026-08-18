export const SECURITY_CHECKLIST_VERSION = "1.0";

const RISK_STATUSES = new Set(["none", "documented"]);
const PENTEST_STATUSES = new Set(["not-required", "completed", "required-not-completed"]);

function requiredText(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} est obligatoire.`);
  if (/\s/.test(normalized)) {
    throw new Error(`${label} doit être une référence sans espace (URL ou identifiant d'issue).`);
  }
  if (!/^[A-Za-z0-9._:/#?=&%+-]+$/.test(normalized)) {
    throw new Error(`${label} contient des caractères non autorisés.`);
  }
  if (normalized.length > 200) throw new Error(`${label} dépasse 200 caractères.`);
  return normalized;
}

/**
 * Valide l'attestation qui accompagne toute promotion Cloud.
 * La preuve détaillée reste dans la référence : aucun secret ni détail
 * exploitable ne doit être copié dans les entrées ou les logs du workflow.
 */
export function assertSecurityRelease({ checklistVersion, reviewRef, residualRisks, pentest }) {
  if (checklistVersion !== SECURITY_CHECKLIST_VERSION) {
    throw new Error(
      `Checklist ${checklistVersion || "absente"} invalide : utiliser la version ${SECURITY_CHECKLIST_VERSION}.`,
    );
  }

  const normalizedRef = requiredText(reviewRef, "La référence de revue sécurité");
  if (!RISK_STATUSES.has(residualRisks)) {
    throw new Error("Le statut des risques résiduels doit être none ou documented.");
  }
  if (!PENTEST_STATUSES.has(pentest)) {
    throw new Error(
      "Le statut du pentest doit être not-required, completed ou required-not-completed.",
    );
  }
  if (pentest === "required-not-completed") {
    throw new Error("Promotion refusée : le pentest requis n'est pas terminé.");
  }

  return {
    checklistVersion,
    reviewRef: normalizedRef,
    residualRisks,
    pentest,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = assertSecurityRelease({
      checklistVersion: process.argv[2],
      reviewRef: process.argv[3],
      residualRisks: process.argv[4],
      pentest: process.argv[5],
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
