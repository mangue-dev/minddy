# Routine failures and delayed sandbox recovery

Investigated on 2026-09-09. Times below are UTC. Production reads were limited
to the project's routine runs, their events, Vercel request logs, sandbox
metadata, and resource metrics. No production runs, billing records, routine
schedules, or deployment settings were changed.

## Findings

Two defects compound the reported symptom: compiler memory pressure can make
the shared VM unresponsive, and the watchdog treats an unanswered command wait
as positive evidence of liveness. The latter bypasses the existing 15-minute
cloud recovery threshold. Shortening the threshold alone cannot fix that path.

| Run prefix | Start | Last tool activity | Failure event | Observed trigger |
| --- | --- | --- | --- | --- |
| `7e5e2e74` | Sep 1, 08:00:06 | 08:08:19 | 10:08:26 | Typecheck pending; focused tests finished |
| `52f8de61` | Sep 3, 07:00:04 | 07:08:42 | 09:10:26 | Typecheck pending; focused tests finished |
| `39996d40` (resumed turn) | Sep 4, 09:16:44 | 09:33:51 | 11:34:25 | Cold typecheck after removing build info |
| `a3b70625` | Sep 7, 20:40:35 | 21:06:10 | 22:54:02 | Cold typecheck; preceding server tests passed |
| `c97a835a` | Sep 8, 08:00:30 | 08:10:00 | 10:08:02 | Typecheck pending; focused tests finished |

The Sep 8 supervisor's last `/api/agent-vm/heartbeat` request was at 08:09:05,
and returned HTTP 200. The production drain cron continued returning HTTP 200
every two minutes through the incident; this was not a missing cron invocation.
The sandbox entered platform status `failed` at approximately 10:07:40; the next
drain wrote `turnLost` at 10:08:02. Its requested timeout was 24 hours, not two
hours. The Sep 7 sandbox likewise entered `failed` shortly before its failure
notification.

Both sandboxes had 2 vCPUs and 4096 MiB. For Sep 8, Vercel reported 7,626,517 ms
of wall time and 14,992,624 ms of active CPU time. Resource metrics remained high
after tool output stopped. Thus the long elapsed time includes a stalled VM
that continued consuming resources, rather than two hours of useful agent work.
The existing duration formatter is not the origin of the delay.

The Sep 8 deployment was `11a6e41876fb33d976f4246f40860a3235ed22b6`. It already
contained the earlier shell-stall recovery, heartbeat, and 15-minute cloud
watchdog changes. This was not simply an undeployed previous fix.

## Compiler resource experiment

A disposable Vercel sandbox checked out that exact public commit and installed
the locked dependencies with `pnpm@10.34.3`. No model calls or production
credentials were used inside the sandbox. A separate monitor sampled compiler
RSS and imposed a memory and time ceiling on the experiment.

For an uncached check, the command was equivalent to:

```sh
tsc --noEmit --extendedDiagnostics --tsBuildInfoFile /tmp/unique-build-info
```

The configuration remained incremental, matching `npm run typecheck`; the
unique build-info path prevented reuse of a previous result. The same source,
dependencies, and command were compared on an 8 GiB / 4 vCPU sandbox:

| Runtime settings | Result | Peak compiler RSS | Wall time including monitoring |
| --- | --- | --- | --- |
| Defaults | Exit 0 | 3765 MiB | 14.7 s |
| `GOMEMLIMIT=2048MiB`, `GOMAXPROCS=4` | Exit 0 | 3007 MiB | 26.3 s |

The compiler alone can occupy almost all of the old 4 GiB VM, before OpenCode,
the Node supervisor, a concurrent test command, and the OS are included.
`GOMEMLIMIT` encourages earlier garbage collection but is a soft limit: the
compiler's live data and native allocations can exceed it. A runtime limit
alone is therefore insufficient; the VM also needs headroom.

This strongly supports resource exhaustion as the trigger. It does not identify
a specific kernel OOM victim: Vercel returned HTTP 410 `sandbox_failed` for the
original command logs, so those internal logs could not be recovered. Earlier
Aug 27-31 launch failures had different errors (an invalid CIDR and platform
HTTP 500s); they were not conflated with the September typecheck incidents.

## Changes

- Explicitly provision new managed Vercel sandboxes with 4 vCPUs / 8 GiB.
- Set Go's GC memory target to 2048 MiB. Apply this default at creation and
  on each harness launch, so tool child
  processes inherit them. Local desktop and self-hosted runtime configuration
  remain under their existing owner's control.
- Bound sandbox metadata, command lookup, command wait, and responsiveness
  requests. Previously only the wait itself had a deadline.
- After an unanswered wait, run a bounded `/bin/true` on the same session.
  Only a successful response establishes VM responsiveness. Otherwise return
  unknown, allowing the existing heartbeat grace period to take effect.
- Read terminal session status directly and use `currentSession()` methods.
  In the installed SDK, `Sandbox.getCommand()` calls `withResume()` even when
  the sandbox was initially retrieved with `resume: false`. A watchdog must
  not resume a stopped VM or change which session it is observing.
- Persist the probe verdict, last heartbeat, detection time, and sandbox/command
  identifiers with `turnLost`, and log the same diagnostic fields in Vercel.
  Future investigations no longer depend entirely on expired VM logs.

The watchdog still preserves a responsive long-running process, tolerates
short platform outages, and uses the existing compare-and-set guard against
concurrent completion or renewed activity. Recovery retains the last checkpoint;
it does not automatically replay commands or create a duplicate execution.

## Verification and rollout limits

- 261 focused tests passed across watchdog, local execution, sandbox creation,
  harness launch, supervisor, report landing, routines, and duration formatting.
- Typecheck, targeted lint, owned-English checks, and `git diff --check` passed.
- The disposable cloud experiment completed the production commit's cold check
  with the new resource profile. This is a compiler/workload probe, not an
  end-to-end scheduled run through the production control plane.

Production deployment and subsequent scheduled-run validation remain required.
Existing persistent sandbox instances are not resized by this change; their
future harness launches receive the runtime limits, while newly created routine
runs receive the larger VM. Historical failure records and elapsed durations
were not rewritten. Provisioned memory per new VM doubles, trading a higher
per-minute infrastructure cost for headroom. Historical ledger entries remain
unchanged; the $0.004/minute rate is retained only for legacy runs without
provider allocation metadata.

## Account sandbox preferences

Account settings → AI now offers Europe (Dublin, the default) or US (Washington),
and standard (4 vCPU / 8 GiB) or performance (8 vCPU / 16 GiB) sandboxes. The
controls are marked experimental and apply to new managed sandboxes, including
scheduled routines, using the run creator's account preferences. Persistent
instances keep their existing region and resources when resumed. Desktop-local
and self-hosted execution do not read these managed preferences.

Compute billing uses the provider session's actual region, CPU, and memory,
recorded in `agent_runs.sandbox_billing` before the agent loop launches. Normal
completion, bootstrap failure, and watchdog recovery use this server-recorded
rate; VM reports cannot choose their own rate. Legacy rows with null metadata
retain their previous estimate until a subsequent managed session records its
allocation. Historical ledger entries are not recalculated.

The estimate retains the previous mostly-waiting workload assumption: full
provisioned memory plus 13.75% active CPU utilization, derived from the existing
$0.24/hour rate for 4 vCPU / 8 GiB in Washington. Regional provider rates then
scale both resource sizes automatically:

| Region | Standard estimate / hour | Performance estimate / hour |
| --- | --- | --- |
| Europe (`dub1`) | $0.3148 | $0.6296 |
| US (`iad1`) | $0.24 | $0.48 |

The settings card converts the selected profile's hourly estimate into a
percentage of the account's effective usage allowance from the billing API.
It uses the full allowance, not the remaining balance, and excludes AI agent
usage. It recalculates on region, size, and allowance changes, formats percentages
for the user's locale, and reports unavailable estimates rather than zero when
billing data or a positive allowance is missing. Percentages above 100% are not
clamped (a small plan can consume its entire allowance in less than one hour).

These are usage-budget estimates, not actual CPU metering. Recalibrate the
utilization assumption against invoices as workloads change. Creation explicitly
disables regional failover. Regional warm-image variables are documented in
`.env.example`; the legacy snapshot variable is US-only, preventing European
creation from selecting an incompatible US snapshot.

Apply migration `20270106650000_account_sandbox_preferences.sql` before deploying
the application. It adds account defaults and nullable run billing metadata.
An isolated PostgreSQL 17 test verified existing-account defaults, valid and
invalid preference values, and preservation of legacy run metadata. 169 focused
tests cover preference API validation, allocation, all four rates, report and
watchdog billing, local execution, and existing sandbox behavior. Typecheck,
targeted lint, owned-English checks, and diff checks passed.

Two disposable Vercel probes in Dublin confirmed the requested allocations:
4 vCPU / 8192 MiB and 8 vCPU / 16384 MiB, each completing a command successfully.
Both probes were stopped and deleted. A browser fixture using the real settings
component and simulated APIs verified mobile and desktop layouts, region and
size changes, percentage recalculation against different allowances, persistence
after reload, and preservation of the saved selection after a failed write.
No account preferences or production runs were changed during validation.

## External references

- [Vercel Sandbox resource defaults and memory per vCPU](https://vercel.com/changelog/vercel-sandbox-now-supports-1-vcpu-2-gb-configurations)
- [Vercel Sandbox SDK](https://github.com/vercel/sandbox)
- [Vercel Sandbox resource observability](https://vercel.com/changelog/more-granular-observability-for-vercel-sandbox)
- [Go runtime memory limit](https://pkg.go.dev/runtime#hdr-Environment_Variables)

- [Vercel Sandbox regional pricing](https://vercel.com/docs/sandbox/pricing)
- [Vercel Sandbox regions](https://vercel.com/docs/sandbox/concepts/regions)
