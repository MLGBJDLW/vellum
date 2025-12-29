# @vellum/core

Core library for the Vellum AI coding assistant. Provides the agent loop, tool system, session management, and provider integrations.

## Installation

```bash
pnpm add @vellum/core
```

## Features

- **Agent Loop** - Stateful conversation loop with streaming, tool execution, and error recovery
- **Tool System** - Extensible tool registry with permission checking and execution
- **Session Management** - Message history, state persistence, and context management
- **Provider Support** - Multi-provider LLM integration (Anthropic, OpenAI, Google)
- **Git Snapshots** - Automatic working directory state tracking and restoration

---

## Tool System

The tool system provides a flexible, type-safe architecture for registering and executing tools within the agent loop.

### Quick Start

```typescript
import {
  createToolRegistry,
  registerAllBuiltinTools,
  ToolExecutor,
} from "@vellum/core";

// 1. Create a registry
const registry = createToolRegistry();

// 2. Register built-in tools
await registerAllBuiltinTools(registry, {
  cwd: process.cwd(),
  projectRoot: "/path/to/project",
});

// 3. Create an executor with permission checking
const executor = new ToolExecutor({
  permissionChecker: {
    checkPermission: async (toolName, input) => {
      // Implement your permission logic
      return { allowed: true };
    },
  },
});

// 4. Execute a tool
const result = await executor.execute(
  {
    callId: "call-123",
    name: "read_file",
    input: { path: "/path/to/file.ts" },
  },
  registry
);
```

### Core Components

#### ToolRegistry

The registry manages tool registration and provides tool definitions to the LLM.

```typescript
import { createToolRegistry, type ToolRegistry } from "@vellum/core";

const registry = createToolRegistry();

// Get all tool definitions for LLM
const tools = registry.getTools();

// Get a specific tool
const readFile = registry.getTool("read_file");
```

#### Built-in Tools

Register all built-in tools at once:

```typescript
import { registerAllBuiltinTools } from "@vellum/core";

await registerAllBuiltinTools(registry, {
  cwd: "/current/working/dir",
  projectRoot: "/project/root",
  enableBash: true,      // Enable bash tool (default: true)
  enableWeb: false,      // Enable web tools (default: false)
  enableMcp: false,      // Enable MCP proxy (default: false)
});
```

Available built-in tools:
- `read_file` - Read file contents with line range support
- `write_file` - Write content to a file
- `edit_file` - Smart edit with search/replace
- `list_directory` - List directory contents
- `bash` - Execute shell commands (when enabled)
- `glob_search` - Search files by pattern
- `grep_search` - Search file contents
- `store_memory` - Store persistent memory
- `recall_memory` - Recall stored memories

**Git Tools** (15 tools for repository management):
- `git_status` - Repository status and branch info
- `git_diff` - Show differences between commits/working tree
- `git_log` - Commit history with filters
- `git_commit` - Create commits
- `git_branch` - Manage branches (list/create/delete/rename)
- `git_checkout` - Switch branches or restore files
- `git_merge` - Merge branches
- `git_conflict_info` - List merge conflicts
- `git_resolve_conflict` - Resolve merge conflicts
- `git_stash` - Stash management (push/pop/apply/list/drop/clear)
- `git_fetch` - Fetch from remote
- `git_pull` - Pull changes from remote
- `git_push` - Push changes to remote
- `git_remote` - Manage remotes (list/add/remove/rename)
- `git_generate_pr` - Generate PR title and description

> See [Git Tools Documentation](../../docs/tools/git.md) for detailed usage and examples.

#### ToolExecutor

Executes tools with permission checking and error handling.

```typescript
import { ToolExecutor, type PermissionChecker } from "@vellum/core";

const permissionChecker: PermissionChecker = {
  checkPermission: async (toolName, input) => {
    // Check if tool execution is allowed
    if (toolName === "bash" && input.command?.includes("rm -rf")) {
      return { allowed: false, reason: "Destructive command blocked" };
    }
    return { allowed: true };
  },
};

const executor = new ToolExecutor({ permissionChecker });

// Execute with full error handling
const result = await executor.execute(toolCall, registry);

if (result.success) {
  console.log("Output:", result.output);
} else {
  console.error("Error:", result.error);
}
```

#### Smart Edit (edit_file)

The `edit_file` tool uses intelligent matching for reliable code edits:

```typescript
// Tool input format
const editInput = {
  path: "/path/to/file.ts",
  old_string: "function oldName(",
  new_string: "function newName(",
};

// Supports fuzzy matching for whitespace differences
// Validates unique matches before applying
```

### Custom Tools

Create and register custom tools:

```typescript
import { type Tool, type ToolRegistry } from "@vellum/core";
import { z } from "zod";

// Define input schema
const myToolSchema = z.object({
  query: z.string().describe("Search query"),
  limit: z.number().optional().default(10),
});

// Create tool
const myTool: Tool = {
  name: "my_custom_tool",
  description: "A custom tool that does something useful",
  inputSchema: myToolSchema,
  execute: async (input) => {
    const { query, limit } = myToolSchema.parse(input);
    // Implement your logic
    return { success: true, output: `Found ${limit} results for: ${query}` };
  },
};

// Register
registry.registerTool(myTool);
```

### MCP Proxy

Connect to Model Context Protocol servers:

```typescript
import { MCPProxy } from "@vellum/core";

const proxy = new MCPProxy();

// Connect to an MCP server
await proxy.connect({
  name: "my-mcp-server",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem"],
});

// Register MCP tools into the registry
proxy.registerTools(registry);

// Tools are now available as: mcp__my-mcp-server__tool_name
```

### Permission System

The permission system provides fine-grained control over tool execution with trust presets, session persistence, and comprehensive event handling.

#### Quick Start

```typescript
import {
  createDefaultPermissionChecker,
  TrustManager,
  SessionPermissionManager,
  type PermissionAskHandler,
} from "@vellum/core/permission";
import { ToolExecutor } from "@vellum/core";

// Create a permission checker with a trust preset
const checker = createDefaultPermissionChecker({
  trustManager: new TrustManager({ configPreset: "default" }),
  askHandler: async (info) => {
    // Prompt user and return: "once", "always", "reject", or undefined (timeout)
    const response = await promptUser(`Allow ${info.type}?`);
    return response ? "once" : "reject";
  },
});

const executor = new ToolExecutor({ permissionChecker: checker });
```

#### Trust Presets

| Preset | Description | Read | Edit | Bash | MCP |
|--------|-------------|------|------|------|-----|
| `paranoid` | Deny everything | ❌ | ❌ | ❌ | ❌ |
| `cautious` | Ask for everything | ❓ | ❓ | ❓ | ❓ |
| `default` | Balanced permissions | ✅ | ✅ | ❓ | ❓ |
| `relaxed` | Allow most operations | ✅ | ✅ | ✅ | ❓ |
| `yolo` | Allow everything | ✅ | ✅ | ✅ | ✅ |

```typescript
// Use a specific preset
const trustManager = new TrustManager({ configPreset: "cautious" });

// Or customize with per-tool rules
const trustManager = new TrustManager({
  config: {
    preset: "default",
    bash: {
      "npm *": "allow",      // Allow npm commands
      "pnpm *": "allow",     // Allow pnpm commands
      "rm -rf *": "deny",    // Block destructive commands
      "*": "ask",            // Ask for all other commands
    },
    edit: {
      "*.test.ts": "allow",  // Auto-approve test file edits
      "*": "ask",            // Ask for other files
    },
  },
});
```

#### Session Permissions

Permissions can be remembered within a session:

```typescript
import { SessionPermissionManager } from "@vellum/core/permission";

const sessionManager = new SessionPermissionManager();

// Permissions granted with "always" response are cached
// Future requests for the same type are auto-approved

// Clear session permissions when needed
sessionManager.clear();
```

#### Permission Events

Monitor permission decisions with the event bus:

```typescript
const checker = createDefaultPermissionChecker({ /* ... */ });

checker.eventBus.on("permissionCheck", (event) => {
  console.log(`Checking: ${event.type}`);
});

checker.eventBus.on("permissionGranted", (event) => {
  console.log(`Granted: ${event.type} (${event.response})`);
});

checker.eventBus.on("permissionDenied", (event) => {
  console.log(`Denied: ${event.type} - ${event.reason}`);
});
```

#### Dangerous Operation Detection

Automatically detect and block dangerous operations:

```typescript
import { DangerousOperationDetector } from "@vellum/core/permission";

const detector = new DangerousOperationDetector();

// Check if a command is dangerous
const result = detector.check("rm -rf /");
if (result.isDangerous) {
  console.log(`Blocked: ${result.reason}`);
}
```

Detected patterns include:
- Recursive deletion (`rm -rf`, `del /s /q`)
- System directory access (`/etc`, `/system32`)
- Permission changes on system files (`chmod`, `chown`)
- Disk formatting commands

#### Ask Service

Handle user prompts with timeouts:

```typescript
import { PermissionAskService } from "@vellum/core/permission";

const askService = new PermissionAskService({
  defaultTimeoutMs: 30000, // 30 second timeout
  handler: async (info) => {
    // Show dialog, return "once" | "always" | "reject" | undefined
    return await showPermissionDialog(info);
  },
});
```

#### Protected Files

Protect system and configuration files:

```typescript
import { protectedFilePatterns, isProtectedFile } from "@vellum/core/permission";

// Check if a file is protected
if (isProtectedFile("/etc/passwd")) {
  console.log("Access to system file blocked");
}

// Default protected patterns include:
// - SSH keys (~/.ssh/*)
// - Git credentials (~/.git-credentials)
// - Environment files (*.env, .env.*)
// - Shell config (~/.bashrc, ~/.zshrc)
```

#### Permission Types

```typescript
import type {
  PermissionInfo,
  PermissionDecision,
  PermissionResponse,
  TrustConfig,
} from "@vellum/core/permission";

// Permission info passed to ask handler
type PermissionInfo = {
  type: "read" | "edit" | "bash" | "mcp" | "notebook";
  toolName: string;
  input: Record<string, unknown>;
  description?: string;
};

// Decision returned by permission checker
type PermissionDecision = "allow" | "ask" | "deny";

// User response to permission prompt
type PermissionResponse = "once" | "always" | "reject" | undefined;
```

### Error Handling

Tool execution returns structured results:

```typescript
import type { ExecutionResult } from "@vellum/core";

const result: ExecutionResult = await executor.execute(call, registry);

if (result.success) {
  // result.output contains the tool output
  console.log(result.output);
} else {
  // result.error contains error details
  console.error(result.error);

  // Check error type
  if (result.error?.includes("Permission denied")) {
    // Handle permission error
  } else if (result.error?.includes("not found")) {
    // Handle missing tool
  }
}
```

---

## Git Snapshot System

The git snapshot system provides automatic tracking and restoration of working directory states using git's internal storage.

### Quick Start

```typescript
import {
  createGitSnapshotService,
  GitOperations,
  GitSnapshotLock,
  type GitSnapshotConfig,
} from "@vellum/core/git";

// Configure the snapshot system
const config: GitSnapshotConfig = {
  enabled: true,
  workDir: "/path/to/repo",
  maxSnapshots: 100,
  lockTimeoutMs: 30000,
};

// Create service instance
const operations = new GitOperations(config.workDir);
const lock = new GitSnapshotLock(config.lockTimeoutMs);

const snapshotService = createGitSnapshotService({
  config,
  operations,
  lock,
  logger: console, // Optional
});

// Create a snapshot
const trackResult = await snapshotService.track();
if (trackResult.ok && trackResult.value) {
  console.log("Snapshot created:", trackResult.value);
}
```

### Core Operations

#### track() - Create Snapshot

Creates a snapshot of the current working directory state:

```typescript
const result = await snapshotService.track();
if (result.ok) {
  if (result.value) {
    // Snapshot created - result.value is 40-char SHA hash
    console.log("Snapshot hash:", result.value);
  } else {
    // Snapshots are disabled
    console.log("Snapshots disabled");
  }
} else {
  // Error occurred
  console.error("Failed:", result.error.message);
}
```

#### patch() - Get Changed Files

Gets the list of files changed since a snapshot:

```typescript
const patchResult = await snapshotService.patch(snapshotHash);
if (patchResult.ok) {
  for (const file of patchResult.value.files) {
    console.log(`${file.type}: ${file.path}`);
    // file.type: "added" | "modified" | "deleted" | "renamed"
  }
}
```

#### diff() - Get Unified Diff

Gets a unified diff since a snapshot:

```typescript
const diffResult = await snapshotService.diff(snapshotHash);
if (diffResult.ok) {
  console.log(diffResult.value); // Standard unified diff output
}
```

#### restore() - Full Restore

Restores the entire working directory to a snapshot state:

```typescript
const restoreResult = await snapshotService.restore(snapshotHash);
if (restoreResult.ok) {
  console.log("Working directory restored");
}
```

#### revert() - Selective Revert

Reverts specific files from a patch:

```typescript
const patchResult = await snapshotService.patch(hash);
if (patchResult.ok) {
  const revertResult = await snapshotService.revert(hash, patchResult.value);
  if (revertResult.ok) {
    console.log("Selected files reverted");
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable snapshots |
| `workDir` | string | - | Git repository path |
| `maxSnapshots` | number | `100` | Max snapshots to retain (0 = unlimited) |
| `autoSnapshotIntervalMs` | number | `0` | Auto-snapshot interval (0 = disabled) |
| `includeUntracked` | boolean | `true` | Include untracked files |
| `lockTimeoutMs` | number | `30000` | Lock acquisition timeout |
| `customExclusions` | string[] | `[]` | Additional gitignore patterns |
| `commitMessagePrefix` | string | `"[vellum-snapshot]"` | Prefix for snapshot commits |

### Error Codes (7xxx Range)

| Code | Constant | Description |
|------|----------|-------------|
| 7000 | `GIT_NOT_INITIALIZED` | No .git directory found |
| 7001 | `GIT_SNAPSHOT_DISABLED` | Snapshots disabled in config |
| 7002 | `GIT_PROTECTED_PATH` | Operation on protected path blocked |
| 7010 | `GIT_OPERATION_FAILED` | General git command failure |
| 7020 | `GIT_LOCK_TIMEOUT` | Lock acquisition timeout (retryable) |

### Error Handling

All methods return `Result<T, VellumError>` for type-safe error handling:

```typescript
import { gitNotInitializedError, gitOperationFailedError } from "@vellum/core/git";

const result = await snapshotService.track();
if (!result.ok) {
  switch (result.error.code) {
    case 7000: // GIT_NOT_INITIALIZED
      console.error("Initialize git first: git init");
      break;
    case 7001: // GIT_SNAPSHOT_DISABLED
      console.log("Enable snapshots in config");
      break;
    case 7020: // GIT_LOCK_TIMEOUT
      // Retry after delay
      if (result.error.isRetryable) {
        await delay(result.error.retryDelay ?? 1000);
        // Retry operation...
      }
      break;
    default:
      console.error(result.error.message);
  }
}
```

### Safety Features

The git module includes built-in safety protections:

```typescript
import { checkProtectedPath, getSanitizedEnv } from "@vellum/core/git";

// Check if a path is safe for git operations
const safeResult = checkProtectedPath("/path/to/check");
if (!safeResult.ok) {
  console.error("Protected path:", safeResult.error.message);
}

// Get sanitized environment (no credential prompts)
const env = getSanitizedEnv();
```

Protected paths include:

- User home directory root
- Desktop, Documents, Downloads, etc.
- System directories (`/etc`, `C:\Windows`, etc.)

### Diff Formatting

Parse and format diff output for display:

```typescript
import {
  formatFileDiff,
  formatMultiFileDiff,
  getDiffStats,
} from "@vellum/core/git";

// Parse a single file diff
const formatted = formatFileDiff(diffText);
console.log(`${formatted.path}: ${formatted.type}`);
console.log(`Hunks: ${formatted.hunks.length}`);

// Get statistics
const stats = getDiffStats(formatted);
console.log(`+${stats.additions} -${stats.deletions}`);
```

### Event Bus Integration

Subscribe to snapshot events:

```typescript
const eventBus = {
  emit: (event, payload) => {
    switch (event) {
      case "gitSnapshotCreated":
        console.log("Created:", payload.hash);
        break;
      case "gitSnapshotRestored":
        console.log("Restored:", payload.hash);
        break;
      case "gitSnapshotReverted":
        console.log("Reverted files:", payload.files.length);
        break;
    }
  },
};

const service = createGitSnapshotService({
  config,
  operations,
  lock,
  eventBus,
});
```

---

## Agent Loop

The agent loop manages the conversation cycle:

```typescript
import { AgentLoop, type AgentLoopConfig } from "@vellum/core";

const config: AgentLoopConfig = {
  sessionId: "session-123",
  mode: {
    name: "code",
    description: "Code assistance mode",
    tools: { edit: true, bash: true, web: false, mcp: false },
    prompt: "You are a helpful coding assistant.",
  },
  providerType: "anthropic",
  model: "claude-sonnet-4-20250514",
  cwd: process.cwd(),
  projectRoot: "/path/to/project",
  toolExecutor: executor,
  permissionChecker: checker,
};

const loop = new AgentLoop(config);

// Subscribe to events
loop.on("text", (text) => console.log(text));
loop.on("toolCall", (call) => console.log("Tool:", call.name));
loop.on("complete", () => console.log("Done"));

// Run the loop
loop.addMessage(createUserMessage("Hello!"));
await loop.run();
```

---

## Session Management

```typescript
import { SessionManager, createUserMessage } from "@vellum/core";

const session = new SessionManager({
  sessionId: "session-123",
  maxTokens: 100000,
});

// Add messages
session.addMessage(createUserMessage("Hello"));

// Get conversation history
const messages = session.getMessages();

// Clear session
session.clear();
```

---

## Configuration

Configuration is loaded from multiple sources with priority:

1. Environment variables
2. Project `.vellum/config.toml`
3. Global `~/.vellum/config.toml`
4. Defaults

```toml
# .vellum/config.toml
[provider]
default = "anthropic"

[model]
default = "claude-sonnet-4-20250514"

[tools]
bash = true
web = false
mcp = false
```

---

## API Reference

### Exports

```typescript
// Tool System
export {
  createToolRegistry,
  registerAllBuiltinTools,
  ToolExecutor,
  MCPProxy,
  type Tool,
  type ToolRegistry,
  type ToolCall,
  type ExecutionResult,
  type PermissionChecker,
  type PermissionResult,
} from "@vellum/core";

// Permission System
export {
  // Factory
  createDefaultPermissionChecker,
  // Components
  DefaultPermissionChecker,
  TrustManager,
  SessionPermissionManager,
  PermissionAskService,
  PermissionEventBus,
  DangerousOperationDetector,
  AutoApprovalLimitsHandler,
  // Utilities
  isProtectedFile,
  isSafeCommand,
  matchWildcard,
  // Types
  type PermissionInfo,
  type PermissionDecision,
  type PermissionResponse,
  type PermissionAskHandler,
  type TrustConfig,
  type TrustPreset,
} from "@vellum/core/permission";

// Git Snapshot System
export {
  // Service
  GitSnapshotService,
  createGitSnapshotService,
  type CreateGitSnapshotServiceOptions,
  type GitSnapshotEventBus,
  // Operations
  GitOperations,
  type DiffNameEntry,
  // Lock
  GitSnapshotLock,
  globalSnapshotLock,
  // Safety
  checkProtectedPath,
  getSanitizedEnv,
  getNoGpgFlags,
  getGitSafetyConfig,
  // Exclusions
  getExclusionPatterns,
  getMinimalExclusionPatterns,
  // Diff Formatting
  formatFileDiff,
  formatMultiFileDiff,
  renderFormattedDiff,
  getDiffStats,
  // Error Factories
  gitNotInitializedError,
  gitSnapshotDisabledError,
  gitProtectedPathError,
  gitLockTimeoutError,
  gitOperationFailedError,
  // Types
  type GitSnapshotConfig,
  type GitPatch,
  type GitFileDiff,
  type GitFileChange,
  type FileChangeType,
  type FormattedDiff,
  type DiffHunk,
  type DiffLine,
  type IGitSnapshotService,
} from "@vellum/core/git";

// Agent
export {
  AgentLoop,
  type AgentLoopConfig,
  type AgentState,
  createUserMessage,
} from "@vellum/core";

// Session
export {
  SessionManager,
  SessionParts,
  type SessionMessage,
} from "@vellum/core";

// Configuration
export {
  loadConfig,
  type VellumConfig,
} from "@vellum/core";
```

---

## License

MIT
