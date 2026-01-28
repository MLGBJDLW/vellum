---
"@butlerw/vellum": patch
---

### fix(orchestrator)
- Added maxConcurrent check to spawnSubagent to enforce concurrent limits
- Added cleanup mechanism for handles, taskToChain, taskDeadlines Maps to prevent memory leaks
- Added deadline enforcement with timers that auto-cancel overdue tasks
- Completed mode/slug mapping in getAgentLevelForMode for all agent types
- Wired up executeWorkerTask in generic executeTask path for actual execution

### fix(agent)
- Aligned canAgentSpawn with canSpawn for consistent level hierarchy
- Added explicit targetAgent field to DelegateAgentSignal for reliable agent routing
- Replaced polling-based subagent wait with Promise-based event notification
- Fixed spawnSubagentWithEvents to call executeTask (not just spawnSubagent)
- Added AbortController to stop cancellationCheck loop after Promise.race resolves

### fix(decomposer)
- Changed dependency assignment from all-previous to immediate-predecessor only
