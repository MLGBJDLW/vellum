# Configuration

Configuration guide for Vellum's core features and subsystems.

---

## Table of Contents

- [UI Configuration](#ui-configuration)
  - [Alternate Screen Buffer](#alternate-screen-buffer)
- [Session System Configuration](#session-system-configuration)
  - [Storage Configuration](#storage-configuration)
  - [Auto-Save Configuration](#auto-save-configuration)
  - [Compaction Configuration](#compaction-configuration)
  - [Search Configuration](#search-configuration)
  - [Summary Configuration](#summary-configuration)
- [Environment Variables](#environment-variables)
- [Complete Examples](#complete-examples)

---

## UI Configuration

UI settings are stored in `~/.vellum/settings.json` and control the terminal interface behavior.

### Alternate Screen Buffer

Controls whether Vellum uses the terminal's alternate screen buffer (like vim, less, etc.).

#### Benefits

| Feature | Description |
|---------|-------------|
| **Clean Exit** | Restores original terminal content when Vellum exits |
| **No Scrollback Pollution** | Vellum output doesn't appear in terminal scrollback history |
| **Better Rendering** | Full-screen mode without interfering with existing content |

#### Configuration

**Settings File** (`~/.vellum/settings.json`):

```json
{
  "ui": {
    "alternateBuffer": true
  }
}
```

#### Default Behavior

| Condition | Alternate Buffer |
|-----------|------------------|
| Normal terminal (TTY) | ✅ Enabled (default) |
| Screen reader detected | ❌ Disabled automatically |
| CI environment | ❌ Disabled automatically |
| Non-TTY (piped output) | ❌ Disabled automatically |

#### Disabling Alternate Buffer

If you prefer to keep Vellum output in your terminal scrollback:

```json
{
  "ui": {
    "alternateBuffer": false
  }
}
```

#### Screen Reader Compatibility

When a screen reader is detected (via environment variables like `SCREEN_READER`, `NVDA`, `JAWS`, `VOICEOVER`, etc.), the alternate buffer is automatically disabled to ensure accessibility. This allows screen readers to capture all output properly.

---

## Session System Configuration

The session system provides five configurable components: Storage, Auto-Save, Compaction, Search, and Summary.

### Storage Configuration

Controls where and how session data is persisted to disk.

#### Type Definition

```typescript
interface StorageConfig {
  /** Base directory path for session storage */
  basePath: string;
  /** Maximum number of sessions to retain (default: 100) */
  maxSessions: number;
  /** Whether to enable compression for stored sessions (default: true) */
  compressionEnabled: boolean;
  /** Name of the index file for session metadata (default: "index.json") */
  indexFileName: string;
}
```

#### Default Values

```typescript
{
  basePath: "<OS-specific>",  // See platform paths below
  maxSessions: 100,
  compressionEnabled: true,
  indexFileName: "index.json"
}
```

#### Platform-Specific Storage Paths

| Platform | Default Path |
|----------|--------------|
| **Windows** | `%APPDATA%\vellum\sessions`<br>Example: `C:\Users\YourName\AppData\Roaming\vellum\sessions` |
| **macOS** | `~/Library/Application Support/vellum/sessions`<br>Example: `/Users/yourname/Library/Application Support/vellum/sessions` |
| **Linux** | `$XDG_DATA_HOME/vellum/sessions` (or `~/.local/share/vellum/sessions`)<br>Example: `/home/yourname/.local/share/vellum/sessions` |

#### Configuration Examples

**Using defaults:**

```typescript
import { StorageManager, getDefaultStorageConfig } from '@vellum/core/session';

const storage = await StorageManager.create(getDefaultStorageConfig());
```

**Custom storage path:**

```typescript
import { StorageManager, createStorageConfig } from '@vellum/core/session';

const storage = await StorageManager.create({
  basePath: '/custom/path/sessions',
  maxSessions: 200,
  compressionEnabled: true
});
```

**Override specific options:**

```typescript
// Uses default basePath but custom maxSessions
const config = createStorageConfig({ maxSessions: 50 });
const storage = await StorageManager.create(config);
```

**Disable compression (for debugging):**

```typescript
const storage = await StorageManager.create({
  basePath: './debug-sessions',
  compressionEnabled: false,  // Stores as plain JSON
  maxSessions: 10
});
```text

---

### Auto-Save Configuration

Controls automatic session persistence timing and thresholds.

#### Type Definition

```typescript
interface PersistenceConfig {
  /** Whether auto-save is enabled (default: true) */
  autoSaveEnabled: boolean;
  /** Interval between auto-saves in seconds (default: 30) */
  autoSaveIntervalSecs: number;
  /** Maximum unsaved messages before triggering save (default: 5) */
  maxUnsavedMessages: number;
}
```

#### Default Values

```typescript
{
  autoSaveEnabled: true,
  autoSaveIntervalSecs: 30,
  maxUnsavedMessages: 5
}
```

#### Configuration Examples

**Using defaults:**

```typescript
import { PersistenceManager, DEFAULT_PERSISTENCE_CONFIG } from '@vellum/core/session';

const persistence = new PersistenceManager(storage, DEFAULT_PERSISTENCE_CONFIG);
```

**Aggressive auto-save (frequent saves):**

```typescript
const persistence = new PersistenceManager(storage, {
  autoSaveEnabled: true,
  autoSaveIntervalSecs: 10,    // Save every 10 seconds
  maxUnsavedMessages: 2         // Or after 2 messages
});
```

**Minimal auto-save (less frequent):**

```typescript
const persistence = new PersistenceManager(storage, {
  autoSaveEnabled: true,
  autoSaveIntervalSecs: 120,   // Save every 2 minutes
  maxUnsavedMessages: 20        // Or after 20 messages
});
```

**Disable auto-save (manual save only):**

```typescript
const persistence = new PersistenceManager(storage, {
  autoSaveEnabled: false,
  autoSaveIntervalSecs: 30,
  maxUnsavedMessages: 5
});
```text

---

### Compaction Configuration

Controls automatic session compaction to manage token usage.

#### Type Definitions

```typescript
interface CompactionConfig {
  /** Maximum length for tool outputs before truncation (default: 1000) */
  maxToolOutputLength: number;
  /** Number of messages to keep at the start of session (default: 5) */
  keepFirstMessages: number;
  /** Number of messages to keep at the end of session (default: 10) */
  keepLastMessages: number;
  /** Marker text for pruned tool outputs */
  prunedMarker: string;
  /** Marker text for truncated middle section. Use {count} placeholder for message count */
  truncatedMarker: string;
}

interface AutoCompactionConfig extends CompactionConfig {
  /** Token count threshold to trigger compaction (default: 100000) */
  tokenThreshold: number;
  /** Token count threshold to emit warning (default: 80000) */
  warningThreshold: number;
  /** Strategy for automatic compaction (default: 'both') */
  compactionStrategy: 'prune' | 'truncate' | 'both';
}
```

#### Default Values

```typescript
{
  // CompactionConfig defaults
  maxToolOutputLength: 1000,
  keepFirstMessages: 5,
  keepLastMessages: 10,
  prunedMarker: "[Output pruned for token efficiency]",
  truncatedMarker: "[{count} messages truncated]",
  
  // AutoCompactionConfig additional defaults
  tokenThreshold: 100000,
  warningThreshold: 80000,
  compactionStrategy: 'both'
}
```

#### Compaction Strategies

| Strategy | Behavior |
|----------|----------|
| **`prune`** | Only prunes large tool outputs |
| **`truncate`** | Only truncates middle messages (keeps first/last) |
| **`both`** | Prunes first, then truncates if still over threshold |

#### Configuration Examples

**Conservative compaction (higher limits):**

```typescript
const config: AutoCompactionConfig = {
  tokenThreshold: 150000,        // Higher limit before compaction
  warningThreshold: 120000,
  compactionStrategy: 'prune',    // Only prune, don't truncate
  maxToolOutputLength: 2000,      // Keep more tool output
  keepFirstMessages: 10,
  keepLastMessages: 20,
  prunedMarker: "[...]",
  truncatedMarker: "[{count} messages omitted]"
};
```

**Aggressive compaction (lower limits):**

```typescript
const config: AutoCompactionConfig = {
  tokenThreshold: 50000,          // Compact earlier
  warningThreshold: 40000,
  compactionStrategy: 'both',     // Use all strategies
  maxToolOutputLength: 500,       // Truncate tool outputs more
  keepFirstMessages: 3,
  keepLastMessages: 5,
  prunedMarker: "[Output truncated]",
  truncatedMarker: "[{count} messages removed]"
};
```

**Custom markers:**

```typescript
const config: AutoCompactionConfig = {
  tokenThreshold: 100000,
  warningThreshold: 80000,
  compactionStrategy: 'both',
  maxToolOutputLength: 1000,
  keepFirstMessages: 5,
  keepLastMessages: 10,
  prunedMarker: "⚠️ [Tool output shortened for context efficiency]",
  truncatedMarker: "📦 [{count} earlier messages archived]"
};
```

---

### Search Configuration

Controls full-text search behavior and indexing options.

#### Type Definition

```typescript
interface SearchOptions {
  /** Maximum number of results (default: 10, max: 100) */
  limit?: number;
  /** Enable fuzzy matching for typo tolerance (default: true) */
  fuzzy?: boolean;
  /** Enable prefix matching for partial terms (default: true) */
  prefix?: boolean;
  /** Fields to search (defaults to all) */
  fields?: string[];
}
```

#### Default Values

```typescript
{
  limit: 10,
  fuzzy: true,
  prefix: true,
  fields: ['title', 'summary', 'tags', 'content']
}
```

#### Search Index Configuration

The search service uses MiniSearch with the following built-in configuration:

```typescript
{
  fields: ['title', 'summary', 'tags', 'content'],
  storeFields: ['id', 'title', 'createdAt'],
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
    boost: {
      title: 3,      // Title matches score 3x higher
      summary: 2,    // Summary matches score 2x higher
      tags: 2,       // Tag matches score 2x higher
      content: 1     // Content matches at base score
    }
  }
}
```

#### Configuration Examples

**Default search:**

```typescript
import { SearchService } from '@vellum/core/session';

const search = new SearchService(storage);
await search.initialize();

const results = search.search('refactoring');
// Returns up to 10 results with fuzzy/prefix matching
```

**Exact matching (no fuzzy):**

```typescript
const results = search.search('typescript', {
  fuzzy: false,
  prefix: false,
  limit: 20
});
```

**Search specific fields only:**

```typescript
const results = search.search('bug fix', {
  fields: ['title', 'tags'],  // Only search title and tags
  limit: 5
});
```

**Large result set:**

```typescript
const results = search.search('session', {
  limit: 50,         // Request up to 50 results
  fuzzy: true,
  prefix: true
});
```

**Custom index path:**

```typescript
const search = new SearchService(
  storage,
  '/custom/path/my-search-index.json'
);
await search.initialize();
```

---

### Summary Configuration

Controls AI-powered session summary generation.

#### Type Definition

```typescript
interface SummaryConfig {
  /** Maximum number of messages to include in summary window */
  maxMessages: number;
  /** Minimum messages required before generating a summary */
  minMessagesForSummary: number;
  /** Whether to automatically update session title from summary */
  autoUpdateTitle: boolean;
}
```

#### Default Values

```typescript
{
  maxMessages: 20,
  minMessagesForSummary: 10,
  autoUpdateTitle: true
}
```

#### Configuration Examples

**Using defaults:**

```typescript
import { SessionSummaryService, DEFAULT_SUMMARY_CONFIG } from '@vellum/core/session';

const summaryService = new SessionSummaryService(DEFAULT_SUMMARY_CONFIG);
```

**Larger summary window:**

```typescript
const summaryService = new SessionSummaryService({
  maxMessages: 50,              // Consider more messages
  minMessagesForSummary: 20,    // Require more messages before summary
  autoUpdateTitle: true
});
```

**Minimal summaries:**

```typescript
const summaryService = new SessionSummaryService({
  maxMessages: 10,              // Smaller summary window
  minMessagesForSummary: 5,     // Generate summaries earlier
  autoUpdateTitle: false        // Don't auto-update title
});
```

**Manual title control:**

```typescript
const summaryService = new SessionSummaryService({
  maxMessages: 20,
  minMessagesForSummary: 10,
  autoUpdateTitle: false        // Keep original title
});

// Generate summary without title update
const summary = await summaryService.generateSummary(session);
```

---

## Environment Variables

The session system respects the following environment variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `APPDATA` | Windows: Storage base path | `%USERPROFILE%\AppData\Roaming` |
| `XDG_DATA_HOME` | Linux: Storage base path | `~/.local/share` |
| `HOME` | All platforms: User home directory | System-dependent |

### Setting Environment Variables

**Windows (PowerShell):**

```powershell
$env:APPDATA = "C:\CustomData"
```

**macOS/Linux (Bash):**

```bash
export XDG_DATA_HOME="/custom/data"
```

**Cross-platform (Node.js):**

```typescript
process.env.XDG_DATA_HOME = '/custom/data';
// Then create storage (will use custom path)
const storage = await StorageManager.create(getDefaultStorageConfig());
```

---

## Complete Examples

### Example 1: Production Configuration

```typescript
import {
  StorageManager,
  PersistenceManager,
  SearchService,
  SessionSummaryService,
  type AutoCompactionConfig
} from '@vellum/core/session';

// Storage with moderate retention
const storage = await StorageManager.create({
  basePath: '/var/lib/vellum/sessions',
  maxSessions: 500,
  compressionEnabled: true
});

// Conservative auto-save
const persistence = new PersistenceManager(storage, {
  autoSaveEnabled: true,
  autoSaveIntervalSecs: 60,
  maxUnsavedMessages: 10
});

// Moderate compaction
const compactionConfig: AutoCompactionConfig = {
  tokenThreshold: 120000,
  warningThreshold: 100000,
  compactionStrategy: 'both',
  maxToolOutputLength: 1500,
  keepFirstMessages: 8,
  keepLastMessages: 15,
  prunedMarker: "[Output truncated]",
  truncatedMarker: "[{count} messages archived]"
};

// Search service
const search = new SearchService(storage);
await search.initialize();

// Summary service
const summaryService = new SessionSummaryService({
  maxMessages: 30,
  minMessagesForSummary: 15,
  autoUpdateTitle: true
});
```

### Example 2: Development/Debug Configuration

```typescript
import { StorageManager, PersistenceManager } from '@vellum/core/session';

// Local storage with no compression (readable files)
const storage = await StorageManager.create({
  basePath: './dev-sessions',
  maxSessions: 20,
  compressionEnabled: false  // Keep as plain JSON
});

// Aggressive auto-save for testing
const persistence = new PersistenceManager(storage, {
  autoSaveEnabled: true,
  autoSaveIntervalSecs: 5,   // Save frequently
  maxUnsavedMessages: 1       // Save after every message
});
```

### Example 3: Resource-Constrained Environment

```typescript
import { StorageManager, PersistenceManager } from '@vellum/core/session';

// Minimal storage footprint
const storage = await StorageManager.create({
  basePath: '/tmp/vellum-sessions',
  maxSessions: 10,            // Keep only 10 sessions
  compressionEnabled: true     // Compress to save space
});

// Less frequent auto-save
const persistence = new PersistenceManager(storage, {
  autoSaveEnabled: true,
  autoSaveIntervalSecs: 300,   // Save every 5 minutes
  maxUnsavedMessages: 50       // Or after 50 messages
});

// Aggressive compaction
const compactionConfig: AutoCompactionConfig = {
  tokenThreshold: 40000,       // Compact early
  warningThreshold: 30000,
  compactionStrategy: 'both',
  maxToolOutputLength: 300,    // Truncate aggressively
  keepFirstMessages: 2,
  keepLastMessages: 5,
  prunedMarker: "[...]",
  truncatedMarker: "[{count} removed]"
};
```

### Example 4: Custom Search Index Location

```typescript
import { StorageManager, SearchService } from '@vellum/core/session';

const storage = await StorageManager.create({
  basePath: '/data/sessions'
});

// Store search index in separate location
const search = new SearchService(
  storage,
  '/data/search/vellum-index.json'
);
await search.initialize();

// Index all sessions
const sessions = await storage.listSessions();
for (const sessionId of sessions) {
  const session = await storage.loadSession(sessionId);
  await search.indexSession(session);
}
```text

---

## Configuration Best Practices

### 1. **Storage Configuration**
- Use default paths in production unless specific requirements dictate otherwise
- Enable compression to reduce disk usage (minimal performance impact)
- Set `maxSessions` based on expected usage patterns and disk space

### 2. **Auto-Save Configuration**
- Balance between data safety and I/O overhead
- Lower intervals (10-30s) for critical workflows
- Higher intervals (60-120s) for batch processing
- Disable auto-save for read-only or testing scenarios

### 3. **Compaction Configuration**
- Set `warningThreshold` to ~80% of `tokenThreshold` for early warnings
- Use `'both'` strategy for best token efficiency
- Adjust `keepFirstMessages`/`keepLastMessages` to preserve critical context
- Test compaction with your specific workflows to find optimal settings

### 4. **Search Configuration**
- Keep fuzzy/prefix enabled for better user experience
- Use field filtering when you know which fields to search
- Be mindful of `limit` to avoid performance issues with large result sets

### 5. **Summary Configuration**
- Higher `maxMessages` provides better context but costs more tokens
- Set `minMessagesForSummary` to avoid summaries on trivial sessions
- Disable `autoUpdateTitle` if you want manual control over session names

---

## TypeScript Type Exports

All configuration types are exported from the session module:

```typescript
import type {
  StorageConfig,
  PersistenceConfig,
  CompactionConfig,
  AutoCompactionConfig,
  SearchOptions,
  SummaryConfig
} from '@vellum/core/session';
```text

For default values:

```typescript
import {
  getDefaultStorageConfig,
  DEFAULT_PERSISTENCE_CONFIG,
  DEFAULT_SUMMARY_CONFIG
} from '@vellum/core/session';
```
