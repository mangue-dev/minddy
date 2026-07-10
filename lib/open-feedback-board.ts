/**
 * Ouvre le board de feedback minddy via l'endpoint serveur `/feedback`, qui
 * pré-identifie l'utilisateur (SSO) avant de rediriger. Nouvel onglet : on ne
 * sort pas l'utilisateur de son travail dans l'app. Déclenché sur un clic
 * (geste utilisateur), donc jamais bloqué par le bloqueur de pop-ups.
 */
export function openFeedbackBoard(): void {
  window.open("/feedback", "_blank", "noopener");
}
