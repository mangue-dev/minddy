# Instance administration figures

Capture the instance administrator console for the manual's
`instance-administration-overview` and `instance-administration-models`
figures, in all six supported languages and light mode.

The console needs an administrator session raised to aal2. Use the capture
admin, a dedicated preview-only account created by
`node captures/world/admin-account.mjs --apply` and signed in by
`node captures/lib/admin-session.mjs`; it is never a real administrator, and
its credentials stay in the local `.env`. Run the shot against
`https://preview.minddy.app` or a local candidate; production origins are
refused.

The images show aggregate preview indicators and the existing model
configuration. Every write request is blocked except the capture admin's own
tab-strip state (`/api/me/app-tabs`, `/api/me/local-snapshots`), whose refusal
would paint the strip's save error into the image: no model, provider, quota or
account setting is changed, and no individual account is opened. Review each
image before updating the figure metadata (`capturedAt`, `revision`) in the six
`instance-administration.md` articles.
