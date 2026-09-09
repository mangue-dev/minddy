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
per-minute infrastructure cost for headroom. The managed compute usage estimate
increases from $0.002 to $0.004 per wall-clock minute ($0.24/hour), scaling the
previous estimate with the doubled resource profile. This retains the existing
mostly-waiting workload assumption for iad1; it is not actual CPU metering.
The rate applies to future usage entries, including resumed persistent sessions;
historical ledger entries are unchanged. A region change requires recalibration.
Four additional billing tests verify agent and routine ledger amounts, partial
minutes, and empty durations.

## External references

- [Vercel Sandbox resource defaults and memory per vCPU](https://vercel.com/changelog/vercel-sandbox-now-supports-1-vcpu-2-gb-configurations)
- [Vercel Sandbox SDK](https://github.com/vercel/sandbox)
- [Vercel Sandbox resource observability](https://vercel.com/changelog/more-granular-observability-for-vercel-sandbox)
- [Go runtime memory limit](https://pkg.go.dev/runtime#hdr-Environment_Variables)
