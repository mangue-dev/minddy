# Browser and desktop renderer copies

This inventory covers first-party browser storage and the same renderer inside
Electron. It is not a claim about endpoint backups, swap, browser extensions,
OS snapshots, downloaded exports or historical installations. The server can
decrypt; this is application encryption, not E2EE.

Toast messages are transient. The content toaster removes legacy error-history
snapshots on mount; error history is no longer saved or restored.

## Content copies

| Copy and writer | Scope and retention | Read, deletion and migration |
| --- | --- | --- |
| TanStack query cache and paused mutations (`query-provider.tsx`, `query-persistence.ts`) | Account-owned server-sealed envelope; 24 hours. The existing persistable-query filter remains. | Authenticated server open, with a current project-access fingerprint; a membership/ownership change refuses restoration. Logout cancels subscriptions and outstanding writes before removing the snapshot. Legacy clear caches are invalidated and reloaded from authoritative repositories. |
| Issue/objective draft title, body and resource references (`drafts.ts`) | Account-owned self-authored recovery copy; at most ten per kind and 30 days per draft. No key is stored on the device. | Authenticated owner restore and explicit delete. Web Locks serialize cross-tab read/modify/seal/write; an in-process queue covers environments without Web Locks. A failed save leaves the dialog and previous disk copy intact, with a localized error. Existing unowned clear drafts require explicit recovery and current access to every referenced project before atomic replacement. They are not silently discarded. |
| Search query history (`useQueryHistory.ts`) | Account envelope; at most 50 entries, 24 hours. | Authenticated restore, access fingerprint and logout deletion. Unowned legacy history is invalidated, not assigned to the next account. Search and new history remain available. |
| Database-list filters including free-text values (`page-database-view.tsx`) | Account envelope per database; 30 days. | Authenticated restore, access fingerprint and logout deletion. Unowned clear preferences reset; controls and encrypted persistence remain available. |
| Window tab destinations, including query/fragment (`app-tabs-context.tsx`) | Account envelope in sessionStorage; 24 hours, also bounded by the window session. | Authenticated restore and logout removal. The server-backed encrypted tab collection remains authoritative; old clear window snapshots reset. |
| Public Feedback draft title/body (`feedback-draft-storage.ts`) | Board-capability recovery copy; 32 KiB content limit and 30-day authenticated expiry. | Server seals with the project's historical content keys, a separate purpose and random per-draft nonce; open/seal requires the same enabled live board before and after crypto. Same-origin, rate-limited 64 KiB streamed requests return no-store. Clear/publication invalidates late writes; explicit legacy recover/discard, debounce and awaited close preserve recovery. This is not an account-owned Auth cache. |

All account snapshots authenticate owner, slot, expiry and payload with the
existing user content key and row/column AAD. They require a live authenticated
session and server root even while a content-migration flag is suspended. The
response is `private, no-store`. Historical key versions restore snapshots after
rotation; no client key or plaintext fallback is returned. In-memory editing,
search and cache behavior remain available when optional cache persistence fails.
Draft persistence failures are visible because silently losing a recovery copy
would be a product regression.

The public Feedback board token and stored nonce/envelope together authorize
recovery of that self-authored guest draft. This is an explicit capability, not
visitor/account authentication. Removing/disabling the board refuses restore;
rotating a token changes its storage lookup. Anyone who extracts both capability
and envelope may recover it through the enabled board. Server connectivity is
required: an unacknowledged edit at a crash/offline boundary is not claimed
durably saved. Endpoint compromise, shared browser profiles and historical
clear drafts need separate device/retention controls.

Account-owned self-authored drafts are deliberately recoverable after a project
membership changes. They are shown only within their project. Project erasure
does not establish deletion of these personal recovery copies; account erasure
removes decrypt authorization, and device expiry/logout/explicit deletion
retires the local ciphertext. Keep this retained-copy boundary in the global
closure inventory. Expiry is enforced on access, not a promise of background
physical deletion from an inactive browser or its backups.

## Allowed local metadata and identity material

The remaining localStorage writers were inspected: sidebar visibility, cycle
mode, cookie consent, theme, dismissed application version, page-tree expansion,
page setup state, last-open page/project, last-create/Agent project and selected
board view keep only booleans, bounded modes, UUID/routing IDs or timestamps.
Palette favorites and usage keep command/entity IDs, counters and last-used
times, not labels or query text. They are usability metadata, not a private
content exception. New content-bearing writers require a separate audit.

The project draft session marker is an opaque server draft ID. Window tab
activation is now encrypted because its href can contain free text. Desktop
Auth-turn storage holds a random one-time nonce with a 15-minute check; it is
consumed on return, never a content key. Supabase session/PKCE credentials are
identity-provider material with their own refresh/logout lifecycle, not an
exemption for application content. Electron secure credential storage and
server-selection preferences remain separate device-security controls.

Supabase Auth account import accepts only the explicit keys and bounded shapes
in `account-metadata-import.ts`: public member display names and product
preferences. Arbitrary JSON, comments, issue/page content, secrets and provider
error bodies are not imported. Existing Auth metadata is not scrubbed by this
import rule: its historical inventory and cleanup remain an operational task.

## Before closure

Inventory old browser profiles, Electron partitions, endpoint backups, old
Feedback drafts, downloads/exports and retired Agent directories. Obtain
retention and deletion evidence; do not infer their absence from a passing code
test. Test normal reload, offline/failure recovery, account switch, membership
revocation, expiry, explicit deletion and concurrent tabs in staging. Keep the
representative cache/key-load measurements in the staging activation protocol.
