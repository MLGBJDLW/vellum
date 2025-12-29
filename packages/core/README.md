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
