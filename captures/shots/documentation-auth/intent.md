# Documentation authentication controls

Capture the actual candidate login, signup and password-recovery forms in all
six supported languages. These images explain where to start S02 and S03.
They do not establish successful signup, email delivery, reset or MFA recovery.
A disposable address appears only in the recovery input; no form is submitted.

Run against a local candidate with `node captures/shots/documentation-auth/shot.mjs`.
The script records the source commit, language, viewport and pending visual
review. Use the shared deterministic browser helper. Never capture a password,
reset link, session cookie, recovery code or another user's content.
