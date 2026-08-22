export const SECURITY_CHECKLIST_VERSION = "1.0";

const RISK_STATUSES = new Set(["none", "documented"]);
const PENTEST_STATUSES = new Set(["not-required", "completed", "required-not-completed"]);

function requiredText(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (/\s/.test(normalized)) {
    throw new Error(`${label} must be a reference without spaces (URL or issue identifier).`);
  }
  if (!/^[A-Za-z0-9._:/#?=&%+-]+$/.test(normalized)) {
    throw new Error(`${label} contains unauthorized characters.`);
  }
  if (normalized.length > 200) throw new Error(`${label} exceeds 200 characters.`);
  return normalized;
}

/**
 * Validates the certificate that accompanies any Cloud promotion.
 * The detailed proof remains in the reference: no secrets or exploitable details
 * must be copied into the workflow entries or logs.
 */
export function assertSecurityRelease({
  checklistVersion,
  reviewRef,
  residualRisks,
  pentest,
  privateTestRelease = false,
}) {
  if (checklistVersion !== SECURITY_CHECKLIST_VERSION) {
    throw new Error(
      `Checklist ${checklistVersion || "missing"} is invalid: use version ${SECURITY_CHECKLIST_VERSION}.`,
    );
  }

  const normalizedRef = requiredText(reviewRef, "The security review reference");
  if (!RISK_STATUSES.has(residualRisks)) {
    throw new Error("Residual risk status must be none or documented.");
  }
  if (!PENTEST_STATUSES.has(pentest)) {
    throw new Error(
      "Pentest status must be not-required, completed, or required-not-completed.",
    );
  }
  if (pentest === "required-not-completed" && !privateTestRelease) {
    throw new Error("Promotion rejected: the required pentest is not complete.");
  }
  if (privateTestRelease && pentest !== "required-not-completed") {
    throw new Error("The private test exception is only valid for an incomplete required pentest.");
  }
  if (privateTestRelease && residualRisks !== "documented") {
    throw new Error("A private test release with an incomplete pentest must document residual risks.");
  }

  return {
    checklistVersion,
    reviewRef: normalizedRef,
    residualRisks,
    pentest,
    privateTestRelease,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = assertSecurityRelease({
      checklistVersion: process.argv[2],
      reviewRef: process.argv[3],
      residualRisks: process.argv[4],
      pentest: process.argv[5],
      privateTestRelease: process.argv[6] === "1",
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
