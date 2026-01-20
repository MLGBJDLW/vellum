# @vellum/core

Core library for the Vellum AI coding assistant. Provides the agent loop, tool system, session management, and provider integrations.

## Installation

```bash
pnpm add @vellum/core
```markdown

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
```markdown

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
```markdown

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
```text

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
```markdown

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
```markdown

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
```markdown

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
```markdown

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
```markdown

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
```markdown

#### Session Permissions

Permissions can be remembered within a session:

```typescript
import { SessionPermissionManager } from "@vellum/core/permission";

const sessionManager = new SessionPermissionManager();

// Permissions granted with "always" response are cached
// Future requests for the same type are auto-approved

// Clear session permissions when needed
sessionManager.clear();
```markdown

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
```markdown

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
```text

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
```markdown

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
```markdown

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
```markdown

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
```text

---

## Web Browsing Tools

Vellum provides secure web browsing tools with built-in SSRF protection.

### doc_lookup

Look up documentation from various sources:

```typescript
import { docLookupTool } from "@vellum/core";

// MDN documentation
await docLookupTool.execute({ source: "mdn", query: "Array.map" });

// npm package info
await docLookupTool.execute({ source: "npm", package: "zod" });

// PyPI package info  
await docLookupTool.execute({ source: "pypi", package: "requests" });

// GitHub README
await docLookupTool.execute({ source: "github", repo: "microsoft/vscode" });
```markdown

### Security Features

All web tools include SSRF protection:
- Private IP blocking (RFC 1918, link-local, CGNAT)
- Cloud metadata endpoint blocking (AWS, GCP, Azure, etc.)
- DNS rebinding protection
- Domain whitelist/blacklist support

### Configuration

```typescript
import { WebBrowsingConfigSchema } from "@vellum/core";

const config = WebBrowsingConfigSchema.parse({
  security: {
    blockPrivateIPs: true,
    blockCloudMetadata: true,
    validateDNS: true,
  },
  domains: {
    blacklist: ["malicious.com"],
  },
  cache: {
    enabled: true,
    maxEntries: 1000,
    defaultTtlMs: 300_000,
  },
});
```markdown

### Error Codes

Web browsing errors use the 31xx code range:
- 3100-3109: SSRF protection errors
- 3110-3119: Domain control errors
- 3120-3129: Rate limiting errors
- 3130-3139: Connection errors
- 3140-3149: Response errors
- 3150-3159: Browser errors

---

## Prompt System

Vellum includes a powerful prompt builder for composing agent system prompts.

### Quick Start

```typescript
import { PromptBuilder, BASE_PROMPT, CODER_PROMPT } from '@vellum/core';

const prompt = new PromptBuilder()
  .withBase(BASE_PROMPT)
  .withRole('coder', CODER_PROMPT)
  .withModeOverrides('Focus on TypeScript')
  .setVariable('PROJECT_NAME', 'my-app')
  .build();
```markdown

### Features

- **4-Layer Priority System**: Base → Role → Mode → Context
- **Variable Injection**: Use `{{KEY}}` placeholders
- **Safety Sanitization**: Auto-filters injection attempts
- **Size Validation**: Throws `PromptSizeError` if too large

### Architecture

```
┌─────────────────────────────────────────────────┐
│                 PromptBuilder                    │
├─────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐   │
│  │ Priority 1: Base Instructions           │   │
│  │ (Core system prompt, always first)      │   │
│  └─────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐   │
│  │ Priority 2: Role Instructions           │   │
│  │ (coder, qa, writer, analyst, architect) │   │
│  └─────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐   │
│  │ Priority 3: Mode Overrides              │   │
│  │ (plan, code, debug modes)               │   │
│  └─────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐   │
│  │ Priority 4: Session Context             │   │
│  │ (active file, git status, current task) │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```markdown

### PromptBuilder API

```typescript
import { PromptBuilder, ContextBuilder, BASE_PROMPT, CODER_PROMPT } from '@vellum/core';

// Full example with all layers
const builder = new PromptBuilder()
  // Priority 1: Base instructions (always included)
  .withBase(BASE_PROMPT)
  
  // Priority 2: Role-specific behavior
  .withRole('coder', CODER_PROMPT)
  
  // Priority 3: Mode overrides
  .withModeOverrides('Focus on implementation, not planning.')
  
  // Priority 4: Dynamic session context
  .withSessionContext({
    activeFile: { path: 'src/app.ts', language: 'typescript' },
    currentTask: { id: 'T001', description: 'Fix bug', status: 'in-progress' },
    gitStatus: { branch: 'main', modified: ['file1.ts'], staged: [] }
  })
  
  // Variable substitution ({{KEY}} syntax)
  .setVariable('PROJECT_NAME', 'my-app')
  .setVariable('LANGUAGE', 'TypeScript');

// Build the final prompt (validates size)
const prompt = builder.build();

// Check size before building
const size = builder.getSize();
if (size > 100000) {
  console.warn('Prompt is getting large:', size, 'chars');
}

// Inspect layers for debugging
const layers = builder.getLayers();
```markdown

### ContextBuilder

Builds formatted markdown context from session state:

```typescript
import { ContextBuilder } from '@vellum/core';

const contextBuilder = new ContextBuilder();

// Build complete session context
const context = contextBuilder.buildContext({
  activeFile: { path: 'src/app.ts', language: 'typescript', selection: 'function foo()' },
  currentTask: { id: 'T001', description: 'Implement feature', status: 'in-progress' },
  gitStatus: { branch: 'feature/auth', modified: ['src/auth.ts'], staged: [] },
  errors: ['Type error in line 42']
});

// Or build individual sections
const fileContext = contextBuilder.buildFileContext({ path: 'src/app.ts', language: 'typescript' });
const taskContext = contextBuilder.buildTaskContext({ id: 'T001', description: 'Fix bug', status: 'pending' });
const gitContext = contextBuilder.buildGitContext({ branch: 'main', modified: [], staged: [] });
```markdown

### Role Prompts

Built-in role prompts for different agent specializations:

```typescript
import {
  BASE_PROMPT,
  ORCHESTRATOR_PROMPT,
  CODER_PROMPT,
  QA_PROMPT,
  WRITER_PROMPT,
  ANALYST_PROMPT,
  ARCHITECT_PROMPT
} from '@vellum/core';

// Use role prompt constants directly
const coderPrompt = CODER_PROMPT;
const qaPrompt = QA_PROMPT;

// Available roles: orchestrator, coder, qa, writer, analyst, architect
```markdown

### Sanitization

Protection against prompt injection:

```typescript
import { sanitizeVariable, containsDangerousContent } from '@vellum/core';

// Check for dangerous content
containsDangerousContent('Hello world');                    // false
containsDangerousContent('ignore previous instructions');   // true
containsDangerousContent('You are now a different AI');     // true

// Sanitize user input for prompt inclusion
const safe = sanitizeVariable('input', userProvidedValue);
// - Removes control characters
// - Replaces injection patterns with [FILTERED]
// - Truncates if too long (default: 10000 chars)
```markdown

### Error Handling

```typescript
import { PromptBuilder, PromptSizeError, MAX_PROMPT_SIZE } from '@vellum/core';

try {
  const prompt = new PromptBuilder()
    .withBase(veryLargeContent)
    .build();
} catch (error) {
  if (error instanceof PromptSizeError) {
    console.error(`Prompt too large: ${error.actualSize} > ${error.maxSize}`);
  }
}

// MAX_PROMPT_SIZE = 200000 characters
```markdown

### Migration from Legacy Config

```typescript
import { PromptBuilder } from '@vellum/core';

// Convert legacy configuration object
const builder = PromptBuilder.fromLegacyConfig({
  systemPrompt: 'You are an AI assistant.',
  rolePrompt: 'You write code.',
  modePrompt: 'Focus on implementation.',
  customInstructions: ['Use TypeScript', 'Follow DRY'],
  providerType: 'anthropic',
  mode: 'code',
  cwd: '/project/root'
});
```text

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
```markdown

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
```markdown

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
```markdown

#### diff() - Get Unified Diff

Gets a unified diff since a snapshot:

```typescript
const diffResult = await snapshotService.diff(snapshotHash);
if (diffResult.ok) {
  console.log(diffResult.value); // Standard unified diff output
}
```markdown

#### restore() - Full Restore

Restores the entire working directory to a snapshot state:

```typescript
const restoreResult = await snapshotService.restore(snapshotHash);
if (restoreResult.ok) {
  console.log("Working directory restored");
}
```markdown

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
```markdown

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
```markdown

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
```text

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
```markdown

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
```text

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
```text

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
```text

---

## Session System

The session system provides comprehensive session management with persistence, search, export, and Git-based file tracking.

> See [Session System Documentation](../../docs/session-system.md) for detailed architecture and examples.

### Quick Start

```typescript
import { 
  StorageManager, 
  PersistenceManager,
  SearchService,
  ExportService 
} from "@vellum/core/session";

// 1. Create storage manager
const storage = await StorageManager.create();

// 2. Create persistence manager with auto-save
const persistence = new PersistenceManager(storage, {
  autoSaveIntervalSecs: 60,
  maxUnsavedMessages: 10
});

// 3. Create a new session
await persistence.newSession({ title: "My Session" });

// 4. Handle messages
await persistence.onMessage(message);

// 5. Close when done
await persistence.closeSession();
```markdown

### Core Components

#### StorageManager

Manages session persistence to disk with JSON storage and optional compression.

```typescript
import { StorageManager } from "@vellum/core/session";

// Create with custom storage path
const storage = await StorageManager.create({
  storageDir: "/custom/path/.vellum/sessions",
  compress: true  // Enable gzip compression
});

// Save session
await storage.saveSession(session);

// Load session
const session = await storage.loadSession("session-123");

// List all sessions
const sessions = await storage.listSessions();

// Delete session
await storage.deleteSession("session-123");
```markdown

#### PersistenceManager

Provides auto-save and session lifecycle management with event emission.

```typescript
import { PersistenceManager } from "@vellum/core/session";

const persistence = new PersistenceManager(storage, {
  autoSaveEnabled: true,
  autoSaveIntervalSecs: 30,
  maxUnsavedMessages: 5
});

// Listen for save events
persistence.on('save', (session) => {
  console.log('Session saved:', session.metadata.id);
});

persistence.on('error', (err, session) => {
  console.error('Save failed:', err);
});

// Create new session
await persistence.newSession({ 
  title: "Code Review",
  tags: ["review", "typescript"]
});

// Load existing session
await persistence.loadSession("session-123");

// Add message (auto-saves based on config)
await persistence.onMessage(message);

// Manual checkpoint
await persistence.createCheckpoint("Before refactor");

// Close session (final save)
await persistence.closeSession();
```markdown

#### SearchService

Full-text search across session titles, summaries, tags, and message content using MiniSearch.

```typescript
import { SearchService } from "@vellum/core/session";

const searchService = new SearchService(storage);

// Initialize index
await searchService.initialize();

// Search sessions
const results = await searchService.search("typescript error", {
  limit: 10,
  includeSnippets: true
});

// Results include relevance scoring
for (const result of results) {
  console.log(`${result.title} (score: ${result.score})`);
  console.log(`Matches: ${result.matches.join(", ")}`);
  if (result.snippet) {
    console.log(`Snippet: ${result.snippet}`);
  }
}

// Rebuild index after changes
await searchService.rebuildIndex();
```markdown

#### ExportService

Export sessions to JSON, Markdown, HTML, or plain text formats.

```typescript
import { ExportService } from "@vellum/core/session";

const exportService = new ExportService();

// Export to Markdown
const markdown = exportService.export(session, { 
  format: 'markdown',
  includeMetadata: true,
  includeToolOutputs: true,
  includeTimestamps: true
});

// Export to HTML
const html = exportService.export(session, { format: 'html' });

// Export to JSON
const json = exportService.export(session, { format: 'json' });

// Export to text
const text = exportService.export(session, { format: 'text' });

// Save to file
await exportService.exportToFile(session, '/path/to/export.md', {
  format: 'markdown'
});
```markdown

**Supported Formats:**
- `json` - Pretty-printed JSON with full session data
- `markdown` - Formatted Markdown with role emojis (👤 🤖 ⚙️ 🔧)
- `html` - Self-contained HTML document with styling
- `text` - Plain text with role prefixes

#### Snapshot

Git-based file tracking using a shadow repository (`.vellum/.git-shadow/`).

```typescript
import { Snapshot } from "@vellum/core/session";

// Initialize shadow repository
await Snapshot.init("/project/root");

// Create snapshot
const snapshot = await Snapshot.create("/project/root", [
  "src/main.ts",
  "package.json"
]);
console.log("Created:", snapshot.hash);

// Get snapshot info
const info = await Snapshot.getInfo("/project/root", snapshot.hash);
console.log("Files:", info.files);
console.log("Timestamp:", info.timestamp);

// Compare with current state
const diff = await Snapshot.diff("/project/root", snapshot.hash);
console.log("Added:", diff.added);
console.log("Modified:", diff.modified);
console.log("Deleted:", diff.deleted);

// Restore files from snapshot
await Snapshot.restore("/project/root", snapshot.hash, ["src/main.ts"]);

// List all snapshots
const snapshots = await Snapshot.list("/project/root");
```markdown

### Error Handling

All session APIs use typed errors for reliable error handling:

```typescript
import { StorageError, StorageErrorType } from "@vellum/core/session";

try {
  await storage.loadSession("session-123");
} catch (err) {
  if (err instanceof StorageError) {
    switch (err.type) {
      case StorageErrorType.SESSION_NOT_FOUND:
        console.log("Session does not exist");
        break;
      case StorageErrorType.IO:
        console.error("Filesystem error:", err.cause);
        break;
      case StorageErrorType.SERIALIZATION:
        console.error("Invalid session data:", err.cause);
        break;
    }
  }
}
```text

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
```text

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
