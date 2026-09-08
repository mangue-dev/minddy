# Public documentation-constrained AI replay: Minddy v0.10.29

Result: **single-release installation and core account/data flows completed, with qualifications**. This is not a completed two-release clean-room acceptance. No update, backup, blank restore, or deliberate application-stop recovery was performed in this bounded phase. The original stack, its database/Storage, configuration and revoked integration remain intact for the separately published target release.

## Identity and trust

Public release: https://github.com/mangue-dev/minddy/releases/tag/v0.10.29 . Source commit: `ec9fafd59beae57d793f611d3009810e798897cf`. The annotated tag identity is in `tag-identities.txt`. Before dependency installation or application execution, all six release asset hashes passed; manifest tag/commit/image identity matched; Cosign verified the official production workflow identity and GitHub OIDC issuer. Evidence: `asset-checksums.txt`, `cosign.json`, `cosign.log`, `running-image.txt`. The final source worktree status is empty.

The supplied VM was fresh for product operations, with no host mounts, SSH agent, prior containers/images/volumes, or provider environment. It already held read-only public release downloads and prerequisites. The exact delegated prompt is `prompt.txt`; `clean-host.json` records the pre-download clean state. No maintainer checkout, previous task history, other VM, private release review, or host /tmp/min407 file was read. The only host inspection was free disk space. Playwright harness documentation was read separately from product instructions.

## Discovery and timing

Discovery ran 2026-09-08T18:12:02Z–18:13:45Z: **103 seconds**, within ten minutes. Selected `full` because an isolated Docker VM can operate the pinned free upstream stack and has no managed Supabase provider account. Inputs were localhost origin, synthetic admin@example.test, pinned upstream path, protected environment path, verified official OCI digest, and explicit forge relay opt-out. No optional external provider was enabled.

The live guide https://www.minddy.app/self-hosting returned HTTP 200 and linked directly to https://github.com/mangue-dev/minddy/blob/v0.10.29/docs/self-hosting-operations.md . Installation, backup, update, blank restore, and rollback were all located in public v29 documents. Required coordinated backup components and operation order are in `discovery.md`; full timing records are in `timings.json`.

Installer start: 2026-09-08T18:14:37Z. First passing doctor: 2026-09-08T18:24:00Z. Inclusive elapsed time: **9.38 minutes**, below45 minutes even including transient registry failures and the harness correction. Frozen dependencies and pinned upstream fetching are timed separately. The exact documented command is in `sanitized-install-command.txt`; successful installer phases and checkpoint timestamps are retained. First and final doctors pass overall, with documented localhost DNS/TLS and disposable SMTP advisories.

## Verified user flows and data

- Synthetic account creation and local Mailpit confirmation succeeded; the email link opened localhost and required an explicit confirmation gesture. No real external mail was sent.
- Account settings → Security → Turn on enrolled TOTP. A current code verified. Ten complete recovery codes were retained outside the browser in a mode0600 private file; they were not published.
- A sign-out, password sign-in, six-digit TOTP challenge, and return to Home succeeded. The account menu then exposed Admin dashboard, which opened with one account. No database role was changed manually.
- Created `Clean Room` (ROOM), default appearance, no repository, no AI description, Smart Assign off. Project ID: `c3e316db-ab5a-40ee-be09-6b562351662c`.
- Created ROOM-1, `Survives update and restore`, description `MIN-383 acceptance marker`, status `in_progress`, priority `urgent`, effort `m`, with Smart-fill off. Issue ID: `42205f54-5572-49bf-a637-5c265aa4fc99`.
- Uploaded `clean-room-marker.txt`,25 bytes, containing `clean-room-storage-marker`. Preview displayed the marker. The browser download exactly matched the source bytes. SHA-256: `c314b7c37b0649174ba8834fb579baa63a60dff59cc32c82742e716c5a90564b`. Attachment ID: `b00ef09f-974b-423d-9141-bbba0720bb33`.
- Created the documented local `issues` integration `Clean room caller`, with no outgoing webhook. Its generated Copy prompt specified POST localhost/api/v1/issues and the accepted JSON body. The request returned201, creating ROOM-2 in triage: `6cd24e82-01e3-4edc-9ca8-e597ea9b0466`. A read-only database check confirmed integration ID `942bb22b-94b9-4b8f-a92d-cea97d2ba37c`. The UI showed Last used. Revoking through the UI produced Revoked; reuse returned401 `invalid_api_key` and created no third issue.
- After data creation, a second sign-out and password+TOTP sign-in succeeded. ROOM-1 and its marker attachment remained readable. Final counts: {"auth.users": 1, "public.issues": 2, "public.projects": 1, "storage.objects": 1, "public.attachments": 1}.
- OAuth authorization discovery, protected-resource metadata, and MCP server-card URLs all used localhost. Authenticated settings exposed no managed billing controls. Git connection setup explicitly stated that GitHub/GitLab connections were unavailable. No AI provider was configured; an actual AI execution attempt was not performed.

Sanitized row IDs, counts, migration versions, integration statuses, doctor reports, and image identity are separate report artifacts. Password reset and recovery-code consumption were not exercised; code retention and TOTP sign-in were exercised.

## Qualifications and gaps

1. **Harness permission correction, not a product defect:** the replay agent applied umask077 too broadly while fetching the public pinned Supabase checkout. Kong's mounted entrypoint became0700 and its config0600. The first startup failed with permission denied. The original failed checkout and checkpoint were preserved; the same public pinned checkout was fetched again at the same path under normal umask0022. No source content, compatibility entry, image pin, deployment network, or secret changed. The environment checksum matched before and after this correction. Ordinary startup then succeeded. See `harness-correction.md` and before/after mode files. The initial unpublished-error hypothesis was withdrawn.
2. Docker Hub manifest-header timeouts interrupted three pulls. Direct ordinary registry reachability from the VM returned expected unauthenticated401. The unchanged documented retry ultimately pulled all pins; no alternate registry or image was used.
3. **Visible integration attribution gap:** ROOM-2 appeared in triage, but its screen showed no integration badge and Activity said No activity yet. The generated integration instructions promise a badge. Database attribution is present and the integration UI records use; visible badge acceptance is not claimed.
4. Main installation text says desktop-first, while the public disposable acceptance procedure explicitly prescribes the VM's browser. This replay follows that explicit browser route and makes no desktop installation claim.
5. Browser event hooks added through the CLI caused Session closed errors on navigation. Removing that custom harness instrumentation restored ordinary CLI operation. Browser evidence therefore consists of two sanitized CLI request collections (145 and75 records, each only localhost), not a complete DevTools HAR. They have collection timestamps, not original per-request start times, and may overlap or omit earlier navigation traffic. Do not add their counts as unique requests.
6. The self-hosted unauthenticated root served the shared marketing page including Cloud pricing copy. Authenticated settings had no billing controls; the marketing presentation was not treated as an enabled billing capability.

## Actual bounded network observation

The metadata filter captured only TCP SYN/initial acknowledgements and DNS; no payloads, headers, request bodies or packet files were recorded. `container-network-map.txt` identifies the sources. Two direct namespace windows observed minddy, scheduler and agent-runner for300 seconds each during account/confirmation and integration creation. No containers were recreated during those windows. Scheduler-to-minddy traffic was observed at multiple minute boundaries. All captured direct namespace destinations were loopback or named internal services; see `namespace-network-summary.json`. No IPv6 packet lines were observed, while AAAA queries are included in the DNS evidence.

The whole-VM windows also contain host tooling/browser traffic. Auth source172.22.0.2 connected to the DNS-resolved api.pwnedpasswords.com addresses, as the public Auth contract requires. Host/NAT DNS also observed registry.npmjs.org and Google/Chromium-related names: accounts.google.com, android.clients.google.com, clients2.google.com, content-autofill.googleapis.com, mtalk.google.com, redirector.gvt1.com, r5---sn-2o25g5-5c.gvt1.com and www.google.com. A process socket snapshot assigns the long-lived Google TCP5228 connection to Chromium. Repeated npx CLI invocations explain a harness source for npm registry activity, but packets are not universally process-attributed. Other host/NAT sources remain explicitly unassigned; shared DNS address candidates are not definitive ownership. These are not evidence of application-provider egress. The browser's captured page requests show only localhost.

All observed external DNS names/connections and uncertainty are preserved in `external-destinations.json`; packet summaries report zero kernel drops. The requested all-host isolation criterion is **inconclusive**, not a universal no-egress pass, because the stock browser/harness produced background traffic and full per-request HAR coverage was unavailable. The narrower direct application/scheduler/runner namespace observations are supported by actual captures.

## Handoff

VM: min407-public-029. Source: /home/clementguerin.guest/minddy-clean-room/source. Upstream: /home/clementguerin.guest/minddy-clean-room/supabase. Protected deployment configuration remains at source/deploy/self-hosted/.env. Private synthetic account, TOTP, complete recovery codes, revoked integration key, raw browser records and command logs remain outside this sanitized directory. Do not publish them. Use the same saved source stack for the later separately verified public update; this report does not substitute for two-release preflight, backup, restore or injected-fault acceptance.

Report prepared: 2026-09-08T18:51:39.793267+00:00.
