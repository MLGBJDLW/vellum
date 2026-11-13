# Shell runtime reliability follow-up

Source review: November 13, 2026. This extends the existing
[agent harness comparison](agent-harness.md) inside the current executors.

## Upstream reference

[Pi's shell tool](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/tools/bash.ts)
closes stdin after command transport or ignores it when commands are arguments. It
uses process groups and tracks cancellation through subprocess completion. Its
[agent loop](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent-loop.ts)
keeps tool outcomes and cancellation in the existing turn owner.

[DeepSeek Harness's driver](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/core/agent-loop/src/agent.ts)
uses per-turn signals, records cancellation causes, and releases tool admission in
`finally`. These are lifecycle references; this change does not introduce its
plugin framework or another scheduler.

## Reproduced problems and changes

- Both shell paths left stdin open when no input was supplied. Readers then waited
  indefinitely with the existing unlimited deadline. Non-interactive shell input
  now closes immediately; the sandbox still supports explicit input, including an
  empty string.
- Sandbox output discarded an entire incoming chunk when it exceeded the byte
  limit. Its limit also mixed JavaScript character counts with byte counts. It now
  retains the available prefix using independent byte counters for stdout/stderr.
- Independent decoding of each byte chunk corrupted split UTF-8 sequences. Both
  paths now retain decoder state. Truncation omits an incomplete final character;
  full streaming callbacks continue independently of the retained-output limit.
- Sandbox cancellation killed only the immediate process, misreported cancellation
  as timeout, and could never escalate after `ChildProcess.killed` became true.
  Both execution paths now share process-tree termination. Unix execution creates
  a process group; Windows uses asynchronous, hidden `taskkill /T`. Graceful Unix
  exits no longer require waiting the whole escalation interval.
- Windows termination resolves `taskkill.exe` from the system directory, including
  hosts with no System32 entry in PATH. A utility failure is reported and falls
  back to terminating the owned child and closing its inherited output pipes.
- Background startup errors had no error listener. Startup is now reported only
  after the spawn event. Pre-cancelled operations launch nothing, and cancellation
  received while awaiting startup terminates the new process. Optional
  display callback errors cannot escape the output event handler and crash Vellum.

## Validation boundary

The first hosted Windows/Node 24 run passed every assertion but reported an
unhandled filesystem error from an instruction watcher after its test directory
was removed. The integration fixture had never disposed its agent. The underlying
runtime also allowed initialization to publish after disposal. Initialization and
cleanup now share their in-flight promises, disposed integrations cannot restart,
and watcher errors reach the loop's diagnostic handler. The fixture awaits actual
initialization and cleanup instead of sleeping for a fixed duration. Deterministic
overlap tests cover loading, watcher startup, disposal and restart.

Focused tests reproduce absent/empty stdin, byte-prefix retention, cancellation
classification, descendants retaining output handles, byte-by-byte Chinese/emoji
output, background startup failures, and display observer failures. The existing
process-tree tests exercise platform behavior; a Unix-only case checks escalation
for a process that ignores SIGTERM. The existing Windows PowerShell Unicode
pipeline case remains covered. No provider request, dependency, CI job, default
task deadline, or new execution service was added. This is subprocess lifecycle
hardening, not a claim of additional operating-system sandbox isolation.
