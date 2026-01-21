# Session System

The session system provides comprehensive session management with five core components:

1. **StorageManager** - Session persistence to disk
2. **PersistenceManager** - Auto-save and lifecycle management
3. **SearchService** - Full-text search across sessions
4. **ExportService** - Export to multiple formats
5. **Snapshot** - Git-based file state tracking

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                      │
│  (TUI, CLI, Agent Loop, User Interface)                     │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                  PersistenceManager                          │
│  • Auto-save (time + message thresholds)                    │
│  • Session lifecycle (new, load, close)                     │
│  • Event emission (save, error)                             │
│  • Checkpoint management                                    │
└──────────────────┬──────────────────────────────────────────┘
                   │
       ┌───────────┼───────────┬────────────┐
       │           │           │            │
┌──────▼──────┐ ┌─▼────────┐ ┌▼─────────┐ ┌▼────────────┐
│  Storage    │ │  Search  │ │  Export  │ │  Snapshot   │
│  Manager    │ │  Service │ │  Service │ │  (Git)      │
│             │ │          │ │          │ │             │
│ • Save      │ │ • Index  │ │ • JSON   │ │ • Shadow    │
│ • Load      │ │ • Search │ │ • MD     │ │   repo      │
│ • Delete    │ │ • Score  │ │ • HTML   │ │ • Diff      │
│ • List      │ │ • Snip   │ │ • Text   │ │ • Restore   │
└──────┬──────┘ └──────────┘ └──────────┘ └─────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│              Filesystem / Git Storage                        │
│  ~/.vellum/sessions/                                         │
│  ├── session-abc123.json (or .json.gz)                      │
│  ├── session-def456.json                                    │
│  └── search-index.json                                      │
│  /project/.vellum/.git-shadow/  (shadow Git repo)           │
└─────────────────────────────────────────────────────────────┘
```

---

## StorageManager

Handles low-level session persistence with JSON storage and optional gzip compression.

### Features

- **OS-specific defaults** - Uses platform-appropriate directories
- **Compression** - Optional gzip for large sessions
- **Atomic writes** - Prevents data corruption
- **Typed errors** - Structured error handling

### API Reference

```typescript
class StorageManager {
  static async create(config?: StorageConfig): Promise<StorageManager>
  
  async saveSession(session: Session): Promise<void>
  async loadSession(sessionId: string): Promise<Session>
  async deleteSession(sessionId: string): Promise<void>
  async listSessions(): Promise<SessionMetadata[]>
  async sessionExists(sessionId: string): Promise<boolean>
  async getSessionMetadata(sessionId: string): Promise<SessionMetadata>
  
  getStorageDir(): string
  getSessionPath(sessionId: string): string
}
```

### Configuration

```typescript
interface StorageConfig {
  /** Storage directory (default: OS-specific) */
  storageDir?: string;
  /** Enable gzip compression (default: false) */
  compress?: boolean;
}
```

**Default paths:**

- **Linux/macOS:** `~/.local/share/vellum/sessions`
- **Windows:** `%LOCALAPPDATA%\vellum\sessions`

### Usage Examples

#### Basic Operations

```typescript
import { StorageManager } from "@vellum/core/session";

// Create with defaults
const storage = await StorageManager.create();

// Create with custom path
const customStorage = await StorageManager.create({
  storageDir: "/path/to/sessions",
  compress: true
});

// Save session
await storage.saveSession(session);

// Load session
const session = await storage.loadSession("session-123");

// Check existence
if (await storage.sessionExists("session-123")) {
  // Session exists
}

// Get metadata only (faster than loading full session)
const metadata = await storage.getSessionMetadata("session-123");
console.log(metadata.title, metadata.createdAt);

// List all sessions
const sessions = await storage.listSessions();
for (const meta of sessions) {
  console.log(`${meta.id}: ${meta.title}`);
}

// Delete session
await storage.deleteSession("session-123");
```

#### Error Handling

```typescript
import { StorageError, StorageErrorType } from "@vellum/core/session";

try {
  await storage.loadSession("missing-session");
} catch (err) {
  if (err instanceof StorageError) {
    switch (err.type) {
      case StorageErrorType.SESSION_NOT_FOUND:
        console.log("Session not found:", err.sessionId);
        break;
      case StorageErrorType.IO:
        console.error("I/O error:", err.path, err.cause);
        break;
      case StorageErrorType.SERIALIZATION:
        console.error("Invalid JSON:", err.cause);
        break;
      case StorageErrorType.INVALID_PATH:
        console.error("Invalid path:", err.path);
        break;
    }
  }
}
```text

---

## PersistenceManager

High-level session lifecycle manager with auto-save, checkpoints, and event emission.

### Features

- **Auto-save** - Periodic saves + message threshold
- **Event emission** - Subscribe to save/error events
- **Checkpoint system** - Named savepoints
- **Lifecycle management** - New, load, close workflows

### API Reference

```typescript
class PersistenceManager extends EventEmitter {
  constructor(storage: StorageManager, config?: PersistenceConfig)
  
  async newSession(options: CreateSessionOptions): Promise<Session>
  async loadSession(sessionId: string): Promise<Session>
  async closeSession(): Promise<void>
  
  async onMessage(message: SessionMessage): Promise<void>
  async createCheckpoint(name: string): Promise<SessionCheckpoint>
  
  getCurrentSession(): Session | null
  getUnsavedMessageCount(): number
  
  on(event: 'save', listener: (session: Session) => void): this
  on(event: 'error', listener: (err: Error, session: Session | null) => void): this
}
```

### Configuration

```typescript
interface PersistenceConfig {
  /** Enable auto-save (default: true) */
  autoSaveEnabled: boolean;
  /** Seconds between auto-saves (default: 30) */
  autoSaveIntervalSecs: number;
  /** Max unsaved messages before save (default: 5) */
  maxUnsavedMessages: number;
}
```

### Usage Examples

#### Complete Lifecycle

```typescript
import { StorageManager, PersistenceManager } from "@vellum/core/session";

// Setup
const storage = await StorageManager.create();
const persistence = new PersistenceManager(storage, {
  autoSaveIntervalSecs: 60,
  maxUnsavedMessages: 10
});

// Listen for events
persistence.on('save', (session) => {
  console.log(`✓ Saved: ${session.metadata.title}`);
});

persistence.on('error', (err, session) => {
  console.error(`✗ Save failed:`, err.message);
});

// Create new session
const session = await persistence.newSession({
  title: "TypeScript Refactor",
  tags: ["typescript", "refactor"],
  metadata: {
    project: "myapp",
    branch: "feature/refactor"
  }
});

// Add messages (auto-saves trigger automatically)
await persistence.onMessage({
  role: "user",
  content: [{ type: "text", text: "Refactor the UserService class" }]
});

await persistence.onMessage({
  role: "assistant",
  content: [{ type: "text", text: "I'll refactor the class..." }]
});

// Manual checkpoint before risky operation
await persistence.createCheckpoint("Before database migration");

// More messages...
await persistence.onMessage(nextMessage);

// Clean shutdown (final save)
await persistence.closeSession();
```

#### Loading Existing Session

```typescript
// Load session by ID
await persistence.loadSession("session-abc123");

// Current session is now loaded
const current = persistence.getCurrentSession();
console.log(current.metadata.title);

// Add messages to loaded session
await persistence.onMessage(message);

// Close when done
await persistence.closeSession();
```

#### Checkpoint Management

```typescript
// Create named checkpoints
const checkpoint1 = await persistence.createCheckpoint("Initial implementation");
const checkpoint2 = await persistence.createCheckpoint("After testing");

// Checkpoints are stored in session.checkpoints
const session = persistence.getCurrentSession();
for (const cp of session.checkpoints) {
  console.log(`${cp.name} at ${cp.timestamp}`);
}
```text

---

## SearchService

Full-text search across sessions using MiniSearch for efficient indexing and fuzzy matching.

### Features

- **Multi-field search** - Title, summary, tags, message content
- **Fuzzy matching** - Handles typos and variations
- **Relevance scoring** - Results ranked by relevance
- **Context snippets** - Shows matched content
- **Recency boost** - Recent sessions ranked higher

### API Reference

```typescript
class SearchService {
  constructor(storage: StorageManager, indexFile?: string)
  
  async initialize(): Promise<void>
  async search(query: string, options?: SearchOptions): Promise<SessionSearchResult[]>
  async rebuildIndex(): Promise<void>
  async addSession(session: Session): Promise<void>
  async removeSession(sessionId: string): Promise<void>
  async updateSession(session: Session): Promise<void>
}
```

### Search Options

```typescript
interface SearchOptions {
  /** Maximum results (default: 10, max: 100) */
  limit?: number;
  /** Include context snippets (default: false) */
  includeSnippets?: boolean;
  /** Fuzzy matching level (0-2, default: 0.2) */
  fuzzy?: number;
  /** Prefix matching (default: true) */
  prefix?: boolean;
}
```

### Usage Examples

#### Basic Search

```typescript
import { SearchService } from "@vellum/core/session";

const searchService = new SearchService(storage);

// Initialize index (do this once at startup)
await searchService.initialize();

// Simple search
const results = await searchService.search("typescript error");

for (const result of results) {
  console.log(`${result.title} (score: ${result.score.toFixed(2)})`);
  console.log(`  ID: ${result.sessionId}`);
  console.log(`  Matches: ${result.matches.join(", ")}`);
}
```

#### Advanced Search with Snippets

```typescript
// Search with context snippets
const results = await searchService.search("refactor class", {
  limit: 20,
  includeSnippets: true,
  fuzzy: 0.3,  // More permissive fuzzy matching
  prefix: true
});

for (const result of results) {
  console.log(`\n${result.title}`);
  console.log(`Score: ${result.score.toFixed(2)}`);
  
  // Show matched terms
  console.log(`Matches: ${result.matches.join(", ")}`);
  
  // Show context snippet
  if (result.snippet) {
    console.log(`Context: ...${result.snippet}...`);
  }
  
  // Session metadata
  console.log(`Created: ${result.metadata.createdAt}`);
  console.log(`Tags: ${result.metadata.tags.join(", ")}`);
}
```

#### Index Management

```typescript
// After creating new session
await searchService.addSession(session);

// After updating session
await searchService.updateSession(updatedSession);

// After deleting session
await searchService.removeSession("session-123");

// Rebuild entire index (e.g., after bulk operations)
await searchService.rebuildIndex();
```

#### Custom Index Location

```typescript
// Store index in custom location
const searchService = new SearchService(
  storage,
  "/custom/path/my-index.json"
);

await searchService.initialize();
```text

---

## ExportService

Export sessions to JSON, Markdown, HTML, or plain text formats with customizable options.

### Features

- **4 export formats** - JSON, Markdown, HTML, Text
- **Customizable output** - Control metadata, tool outputs, timestamps
- **Styled HTML** - Self-contained with CSS
- **Role formatting** - Emojis and colors for readability

### API Reference

```typescript
class ExportService {
  export(session: Session, options: ExportOptions): string
  async exportToFile(session: Session, filePath: string, options: ExportOptions): Promise<void>
}
```

### Export Options

```typescript
interface ExportOptions {
  /** Output format */
  format: 'json' | 'markdown' | 'html' | 'text';
  /** Include session metadata (default: true) */
  includeMetadata?: boolean;
  /** Include tool outputs (default: true) */
  includeToolOutputs?: boolean;
  /** Include timestamps (default: true) */
  includeTimestamps?: boolean;
}
```

### Usage Examples

### Export to Markdown

```typescript
import { ExportService } from "@vellum/core/session";

const exportService = new ExportService();

const markdown = exportService.export(session, {
  format: 'markdown',
  includeMetadata: true,
  includeToolOutputs: true,
  includeTimestamps: true
});

console.log(markdown);
```

**Output:**

```markdown
# Code Review Session

**Created:** 2024-01-15 10:30:00
**Tags:** review, typescript
**Messages:** 12

---

## 👤 User (10:30:15)

Can you review this TypeScript code?

## 🤖 Assistant (10:30:20)

I'll review the code for you.

## 🔧 Tool: read_file (10:30:21)

**Input:**
```json
{"path": "src/user.ts"}
```

**Output:**

```text
export class User { ... }
```

## 🤖 Assistant (10:30:25)

The code looks good, but I suggest...

```text
```

### Export to HTML

```typescript
const html = exportService.export(session, {
  format: 'html',
  includeMetadata: true
});

// HTML is self-contained with inline CSS
// Includes color-coded roles and styled message blocks
```

### Export to JSON

```typescript
const json = exportService.export(session, {
  format: 'json'
});

// Pretty-printed JSON with full session data
const parsed = JSON.parse(json);
```

### Export to Text

```typescript
const text = exportService.export(session, {
  format: 'text',
  includeTimestamps: false,  // Omit timestamps for cleaner output
  includeToolOutputs: false  // Skip tool details
});
```

**Output:**

```text
Session: Code Review Session
Created: 2024-01-15 10:30:00
Tags: review, typescript

[User]
Can you review this TypeScript code?

[Assistant]
I'll review the code for you. The code looks good, but I suggest...
```

### Export to File

```typescript
// Export to file (extension determines nothing, format is explicit)
await exportService.exportToFile(
  session,
  '/path/to/export/session-123.md',
  { format: 'markdown' }
);

await exportService.exportToFile(
  session,
  '/path/to/export/session-123.html',
  { format: 'html' }
);
```text

---

## Snapshot

Git-based file state tracking using a shadow repository (`.vellum/.git-shadow/`) that operates independently of the user's main Git repository.

### Features

- **Independent tracking** - Separate shadow repo, no conflicts with user's Git
- **SHA-based snapshots** - Cryptographic hashes for integrity
- **Diff support** - Compare current state with snapshots
- **Selective restore** - Restore specific files or entire snapshots
- **No GPG/hooks** - Sanitized environment for reliability

### API Reference

```typescript
namespace Snapshot {
  function init(projectRoot: string): Promise<Result<void, SnapshotError>>
  function create(projectRoot: string, files: string[], message?: string): Promise<Result<SnapshotInfo, SnapshotError>>
  function restore(projectRoot: string, hash: string, files?: string[]): Promise<Result<void, SnapshotError>>
  function diff(projectRoot: string, hash: string): Promise<Result<DiffResult, SnapshotError>>
  function getInfo(projectRoot: string, hash: string): Promise<Result<SnapshotInfo, SnapshotError>>
  function list(projectRoot: string): Promise<Result<SnapshotInfo[], SnapshotError>>
  function cleanup(projectRoot: string): Promise<Result<void, SnapshotError>>
}
```

### Types

```typescript
interface SnapshotInfo {
  /** 40-character SHA hash */
  hash: string;
  /** Creation timestamp */
  timestamp: Date;
  /** Tracked files */
  files: string[];
  /** Commit message */
  message?: string;
}

interface DiffResult {
  /** Files added since snapshot */
  added: string[];
  /** Files modified since snapshot */
  modified: string[];
  /** Files deleted since snapshot */
  deleted: string[];
  /** Unified diff patch */
  patch: string;
}
```

### Usage Examples

#### Initialize Shadow Repository

```typescript
import { Snapshot } from "@vellum/core/session";

// Initialize once per project (creates .vellum/.git-shadow/)
const result = await Snapshot.init("/path/to/project");

if (result.isOk()) {
  console.log("Shadow repo initialized");
} else {
  console.error("Init failed:", result.error.message);
}
```

#### Create Snapshots

```typescript
// Snapshot specific files
const result = await Snapshot.create(
  "/path/to/project",
  ["src/main.ts", "package.json", "tsconfig.json"],
  "Before refactor"
);

if (result.isOk()) {
  const snapshot = result.value;
  console.log("Created snapshot:", snapshot.hash);
  console.log("Files:", snapshot.files);
  console.log("Time:", snapshot.timestamp);
}
```

#### View Snapshot Information

```typescript
// Get snapshot details
const info = await Snapshot.getInfo("/path/to/project", "abc123...");

if (info.isOk()) {
  const snapshot = info.value;
  console.log("Hash:", snapshot.hash);
  console.log("Message:", snapshot.message);
  console.log("Created:", snapshot.timestamp);
  console.log("Files:", snapshot.files.length);
}

// List all snapshots
const list = await Snapshot.list("/path/to/project");

if (list.isOk()) {
  for (const snapshot of list.value) {
    console.log(`${snapshot.hash.slice(0, 7)} - ${snapshot.message}`);
  }
}
```

#### Diff Against Snapshot

```typescript
// Compare current state with snapshot
const diffResult = await Snapshot.diff("/path/to/project", "abc123...");

if (diffResult.isOk()) {
  const diff = diffResult.value;
  
  console.log("Added files:", diff.added);
  console.log("Modified files:", diff.modified);
  console.log("Deleted files:", diff.deleted);
  
  // Show unified diff
  console.log("\nChanges:");
  console.log(diff.patch);
}
```

#### Restore from Snapshot

```typescript
// Restore specific files
const restore = await Snapshot.restore(
  "/path/to/project",
  "abc123...",
  ["src/main.ts"]  // Optional: restore only these files
);

if (restore.isOk()) {
  console.log("Files restored successfully");
}

// Restore all files from snapshot
const restoreAll = await Snapshot.restore(
  "/path/to/project",
  "abc123..."
  // No files array = restore all
);
```

#### Cleanup

```typescript
// Remove shadow repository (destructive!)
const cleanup = await Snapshot.cleanup("/path/to/project");

if (cleanup.isOk()) {
  console.log("Shadow repo removed");
}
```text

---

## Common Workflows

### Complete Session Workflow

```typescript
import { 
  StorageManager, 
  PersistenceManager, 
  SearchService,
  ExportService 
} from "@vellum/core/session";

// 1. Setup
const storage = await StorageManager.create({ compress: true });
const persistence = new PersistenceManager(storage);
const searchService = new SearchService(storage);
await searchService.initialize();

// 2. Create session
await persistence.newSession({ 
  title: "New Feature Implementation",
  tags: ["feature", "backend"]
});

// 3. Work with session
await persistence.onMessage(userMessage);
await persistence.onMessage(assistantMessage);
await persistence.createCheckpoint("Initial implementation");

// 4. Search across sessions
const results = await searchService.search("authentication bug", {
  limit: 5,
  includeSnippets: true
});

// 5. Export session
const exportService = new ExportService();
const markdown = exportService.export(
  persistence.getCurrentSession()!,
  { format: 'markdown' }
);

// 6. Close session
await persistence.closeSession();
```

### Session Recovery

```typescript
// List available sessions
const sessions = await storage.listSessions();

// Find session by title
const target = sessions.find(s => s.title.includes("Feature X"));

if (target) {
  // Load and resume
  await persistence.loadSession(target.id);
  console.log(`Resumed: ${target.title}`);
  
  // Continue working
  await persistence.onMessage(newMessage);
}
```

### Batch Export

```typescript
const exportService = new ExportService();
const sessions = await storage.listSessions();

for (const meta of sessions) {
  const session = await storage.loadSession(meta.id);
  
  await exportService.exportToFile(
    session,
    `/exports/${meta.id}.md`,
    { format: 'markdown' }
  );
}

console.log(`Exported ${sessions.length} sessions`);
```

### File Tracking with Snapshots

```typescript
import { Snapshot } from "@vellum/core/session";

const projectRoot = "/path/to/project";

// Initialize
await Snapshot.init(projectRoot);

// Before making changes
const before = await Snapshot.create(projectRoot, [
  "src/auth.ts",
  "src/user.ts"
], "Before authentication refactor");

// Make changes...
// (user edits files)

// Compare changes
const diff = await Snapshot.diff(projectRoot, before.value.hash);
console.log("Modified:", diff.value.modified);

// Restore if needed
if (userWantsToRevert) {
  await Snapshot.restore(projectRoot, before.value.hash);
}
```text

---

## Configuration

### Storage Paths

Default storage locations by OS:

| OS | Path |
|----|------|
| **Linux** | `~/.local/share/vellum/sessions` |
| **macOS** | `~/.local/share/vellum/sessions` |
| **Windows** | `%LOCALAPPDATA%\vellum\sessions` |

Override with custom path:

```typescript
const storage = await StorageManager.create({
  storageDir: "/custom/path/sessions"
});
```

### Persistence Settings

```typescript
const persistence = new PersistenceManager(storage, {
  // Enable/disable auto-save
  autoSaveEnabled: true,
  
  // Save every N seconds
  autoSaveIntervalSecs: 60,
  
  // Save after N unsaved messages
  maxUnsavedMessages: 10
});
```

### Search Index Location

```typescript
// Default: storageDir/search-index.json
const search = new SearchService(storage);

// Custom location
const customSearch = new SearchService(
  storage,
  "/custom/path/index.json"
);
```

### Snapshot Location

Snapshots are always stored in:

```text
<projectRoot>/.vellum/.git-shadow/
```

This directory is automatically created by `Snapshot.init()`.

---

## Error Handling

### Storage Errors

```typescript
import { StorageError, StorageErrorType } from "@vellum/core/session";

try {
  await storage.loadSession(sessionId);
} catch (err) {
  if (err instanceof StorageError) {
    switch (err.type) {
      case StorageErrorType.SESSION_NOT_FOUND:
        // Handle missing session
        break;
      case StorageErrorType.IO:
        // Handle filesystem errors
        console.error("I/O error:", err.path, err.cause);
        break;
      case StorageErrorType.SERIALIZATION:
        // Handle corrupt data
        console.error("Invalid JSON:", err.cause);
        break;
      case StorageErrorType.INVALID_PATH:
        // Handle path issues
        console.error("Invalid path:", err.path);
        break;
    }
  }
}
```

### Snapshot Errors

```typescript
import { SnapshotError, SnapshotErrorCode } from "@vellum/core/session";

const result = await Snapshot.create(projectRoot, files);

if (result.isErr()) {
  const error = result.error;
  
  switch (error.code) {
    case SnapshotErrorCode.NOT_INITIALIZED:
      // Shadow repo not initialized
      await Snapshot.init(projectRoot);
      break;
    case SnapshotErrorCode.OPERATION_FAILED:
      // Git command failed
      console.error("Git error:", error.cause);
      break;
    case SnapshotErrorCode.INVALID_HASH:
      // Invalid snapshot hash
      console.error("Invalid hash format");
      break;
    case SnapshotErrorCode.NOT_FOUND:
      // Snapshot doesn't exist
      console.error("Snapshot not found");
      break;
  }
}
```

### Persistence Events

```typescript
persistence.on('error', (err, session) => {
  console.error('Persistence error:', err.message);
  
  if (session) {
    console.log('Failed session:', session.metadata.id);
  }
  
  // Implement retry logic, user notification, etc.
});
```text

---

## Performance Considerations

### Storage

- **Compression**: Enable for large sessions (100+ messages)
- **Metadata-only queries**: Use `getSessionMetadata()` instead of `loadSession()` when possible
- **Batch operations**: Use `listSessions()` once instead of multiple existence checks

```typescript
// ❌ Slow: Load full sessions
for (const id of sessionIds) {
  const session = await storage.loadSession(id);
  console.log(session.metadata.title);
}

// ✅ Fast: Use metadata-only query
const allMetadata = await storage.listSessions();
for (const meta of allMetadata) {
  console.log(meta.title);
}
```

### Search

- **Index persistence**: Index is saved to disk, no rebuild needed on restart
- **Incremental updates**: Use `addSession()` / `updateSession()` instead of `rebuildIndex()`
- **Content limits**: Large message content is truncated to 50,000 characters per session

### Snapshots

- **File tracking**: Only track files that change frequently
- **Cleanup old snapshots**: Use `list()` + `cleanup()` to manage snapshot count
- **Avoid large files**: Binary files should be excluded from tracking

---

## Related Documentation

- [packages/core/README.md](../packages/core/README.md) - Core API reference
- [docs/logging-telemetry.md](./logging-telemetry.md) - Logging and telemetry

---

## API Exports

All session APIs are available from `@vellum/core/session`:

```typescript
// Storage
export { 
  StorageManager,
  StorageError,
  StorageErrorType,
  type StorageConfig 
} from "@vellum/core/session";

// Persistence
export {
  PersistenceManager,
  type PersistenceConfig,
  type PersistenceEvents
} from "@vellum/core/session";

// Search
export {
  SearchService,
  type SearchOptions,
  type SessionSearchResult,
  type SessionSearchHit
} from "@vellum/core/session";

// Export
export {
  ExportService,
  type ExportFormat,
  type ExportOptions
} from "@vellum/core/session";

// Snapshot
export {
  Snapshot,
  type SnapshotInfo,
  type DiffResult,
  SnapshotError,
  SnapshotErrorCode
} from "@vellum/core/session";

// Types
export {
  type Session,
  type SessionMetadata,
  type SessionMessage,
  type SessionCheckpoint
} from "@vellum/core/session";
```

---

## Migration Guide

If upgrading from an older session system, see [MIGRATION.md](../packages/core/MIGRATION.md) for migration steps and compatibility notes.
