# Self-hosted deployment assets

This directory is reserved for versioned minddy self-hosting assets. It belongs
to the public main repository; no second deployment repository is part of the
supported distribution.

Current contents:

- `compatibility.json` is the release compatibility matrix consumed by the
  self-hosting distribution contract.

Future assets may include a minddy application Compose file, example proxy
configuration, and validation scripts. Each must be safe to publish, refer only
to operator-supplied secrets, identify its owning release, and be listed in the
release manifest. Do not add a copy of the Supabase Docker distribution here:
the complete path uses the official upstream Compose release pinned by
`compatibility.json`.
