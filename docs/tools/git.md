# Git Tools

> Comprehensive Git integration tools for the Vellum AI coding assistant.

## Overview

Vellum provides **15 Git tools** for complete repository management. These tools are organized into categories based on their function and risk level:

| Category | Tools | Permission |
|----------|-------|------------|
| **Read** | git_status, git_diff, git_log | `read` (auto-allowed) |
| **Write** | git_commit, git_branch, git_checkout, git_merge | `write` (may require confirmation) |
| **Conflict** | git_conflict_info, git_resolve_conflict | `read` / `write` |
| **Stash** | git_stash | `write` |
| **Network** | git_fetch, git_pull, git_push, git_remote | `write` (may require confirmation) |
| **PR** | git_generate_pr | `read` |

---

## Read Tools

### git_status

Get the current repository status including branch, staged changes, and working directory state.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `cwd` | string | No | Working directory (defaults to current) |

**Returns:** `GitStatusResult`

```typescript
{
  branch: string;      // Current branch name
  staged: string[];    // Files staged for commit
  modified: string[];  // Modified but unstaged files
  untracked: string[]; // Untracked files
  clean: boolean;      // Whether working directory is clean
}
```

**Example:**

```typescript
// Check repository status
const result = await executor.execute({
  callId: "1",
  name: "git_status",
  input: {}
});
// Returns: { branch: "main", staged: [], modified: ["src/app.ts"], untracked: [], clean: false }
```

---

### git_diff

Show differences between commits, working tree, and staging area.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `staged` | boolean | No | Show staged changes (default: false) |
| `paths` | string[] | No | Filter to specific file paths |
| `ref` | string | No | Commit ref or range (e.g., `HEAD~1`, `main..feature`) |
| `cwd` | string | No | Working directory |

**Returns:** `GitDiffResult`

```typescript
{
  diff: string;         // Raw unified diff output
  truncated: boolean;   // Whether output was truncated
  filesChanged: number; // Number of files changed
  hunks?: DiffHunk[];   // Parsed diff hunks (if not truncated)
}
```

**Examples:**

```typescript
// Show unstaged changes
const result = await executor.execute({
  callId: "1",
  name: "git_diff",
  input: {}
});

// Show staged changes
const result = await executor.execute({
  callId: "2",
  name: "git_diff",
  input: { staged: true }
});

// Compare with specific commit
const result = await executor.execute({
  callId: "3",
  name: "git_diff",
  input: { ref: "HEAD~3" }
});

// Diff specific files
const result = await executor.execute({
  callId: "4",
  name: "git_diff",
  input: { paths: ["src/index.ts", "src/utils.ts"] }
});
```

---

### git_log

Show commit history with filtering options.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Max commits to return (default: 10, max: 100) |
| `author` | string | No | Filter by author name or email |
| `since` | string | No | Show commits after date (e.g., `2024-01-01`, `1.week.ago`) |
| `until` | string | No | Show commits before date |
| `path` | string | No | Show commits affecting this file/directory |
| `cwd` | string | No | Working directory |

**Returns:** `GitLogResult`

```typescript
{
  commits: GitLogCommit[];  // List of commits
  count: number;            // Total commits returned
  truncated: boolean;       // Whether output was truncated
}

interface GitLogCommit {
  hash: string;      // Full 40-character hash
  shortHash: string; // 7-character short hash
  author: string;    // Author name and email
  date: string;      // ISO 8601 date
  message: string;   // Commit subject line
}
```

**Examples:**

```typescript
// Get last 10 commits
const result = await executor.execute({
  callId: "1",
  name: "git_log",
  input: {}
});

// Get commits from specific author
const result = await executor.execute({
  callId: "2",
  name: "git_log",
  input: { author: "john@example.com", limit: 20 }
});

// Get commits for a specific file
const result = await executor.execute({
  callId: "3",
  name: "git_log",
  input: { path: "src/api/handler.ts" }
});

// Get commits from last week
const result = await executor.execute({
  callId: "4",
  name: "git_log",
  input: { since: "1.week.ago" }
});
```

---

## Write Tools

### git_commit

Create a commit with staged changes.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `message` | string | No | Commit message (auto-generated if omitted) |
| `all` | boolean | No | Stage all changes before commit |
| `cwd` | string | No | Working directory |

**Returns:** `GitCommitResult`

```typescript
{
  hash: string;    // Short commit hash
  message: string; // Commit message used
}
```

**Examples:**

```typescript
// Commit with message
const result = await executor.execute({
  callId: "1",
  name: "git_commit",
  input: { message: "feat: add user authentication" }
});

// Auto-generate message and commit all changes
const result = await executor.execute({
  callId: "2",
  name: "git_commit",
  input: { all: true }
});
```

---

### git_branch

Manage branches (list, create, delete, rename).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | `"list"` \| `"create"` \| `"delete"` \| `"rename"` | Yes | Operation to perform |
| `name` | string | Conditional | Branch name (required for create/delete/rename) |
| `newName` | string | Conditional | New name (required for rename) |
| `remote` | boolean | No | Include remote branches (for list) |
| `force` | boolean | No | Force deletion |
| `cwd` | string | No | Working directory |

**Returns:** `GitBranchResult`

```typescript
// For list action:
{
  branches: GitBranchInfo[];
  current: string;
}

// For create/delete/rename:
{
  message: string;
  branch: string;
}
```

**⚠️ Confirmation Required:** `action: "delete"` requires user confirmation.

**Examples:**

```typescript
// List branches
const result = await executor.execute({
  callId: "1",
  name: "git_branch",
  input: { action: "list" }
});

// Create new branch
const result = await executor.execute({
  callId: "2",
  name: "git_branch",
  input: { action: "create", name: "feature/auth" }
});

// Delete branch (requires confirmation)
const result = await executor.execute({
  callId: "3",
  name: "git_branch",
  input: { action: "delete", name: "old-feature" }
});

// Rename branch
const result = await executor.execute({
  callId: "4",
  name: "git_branch",
  input: { action: "rename", name: "old-name", newName: "new-name" }
});
```

---

### git_checkout

Switch branches or restore files.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `target` | string | Yes | Branch name or commit ref |
| `create` | boolean | No | Create branch if not exists |
| `paths` | string[] | No | Restore specific files from ref |
| `force` | boolean | No | Force checkout, discard local changes |
| `cwd` | string | No | Working directory |

**Returns:** `GitCheckoutResult`

```typescript
{
  ref: string;             // New current branch/ref
  created: boolean;        // Whether branch was created
  restoredFiles?: string[]; // Files restored (if paths specified)
}
```

**⚠️ Confirmation Required:** `force: true` requires user confirmation.

**Examples:**

```typescript
// Switch to existing branch
const result = await executor.execute({
  callId: "1",
  name: "git_checkout",
  input: { target: "develop" }
});

// Create and switch to new branch
const result = await executor.execute({
  callId: "2",
  name: "git_checkout",
  input: { target: "feature/new", create: true }
});

// Restore a file from HEAD
const result = await executor.execute({
  callId: "3",
  name: "git_checkout",
  input: { target: "HEAD", paths: ["src/config.ts"] }
});

// Force checkout (requires confirmation)
const result = await executor.execute({
  callId: "4",
  name: "git_checkout",
  input: { target: "main", force: true }
});
```

---

### git_merge

Merge a branch into the current branch.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `branch` | string | Yes | Branch to merge into current |
| `noFf` | boolean | No | Create merge commit even if fast-forward possible |
| `abort` | boolean | No | Abort in-progress merge |
| `message` | string | No | Merge commit message |
| `cwd` | string | No | Working directory |

**Returns:** `GitMergeResult`

```typescript
{
  success: boolean;      // Whether merge succeeded
  message: string;       // Merge summary
  conflicts?: string[];  // Conflicting files (if any)
  fastForward?: boolean; // Whether it was a fast-forward merge
}
```

**⚠️ Confirmation Required:** All merge operations require user confirmation.

**Examples:**

```typescript
// Merge feature branch
const result = await executor.execute({
  callId: "1",
  name: "git_merge",
  input: { branch: "feature/auth" }
});

// Merge with no fast-forward
const result = await executor.execute({
  callId: "2",
  name: "git_merge",
  input: { branch: "feature/auth", noFf: true, message: "Merge feature/auth" }
});

// Abort conflicted merge
const result = await executor.execute({
  callId: "3",
  name: "git_merge",
  input: { branch: "", abort: true }
});
```

---

## Conflict Resolution Tools

### git_conflict_info

List files with merge conflicts and show conflict markers.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `cwd` | string | No | Working directory |

**Returns:** `GitConflictInfoResult`

```typescript
{
  hasConflicts: boolean;
  files: ConflictFile[];
}

interface ConflictFile {
  path: string;          // Path to conflicted file
  oursContent?: string;  // Content from current branch
  theirsContent?: string; // Content from merging branch
  markers: string;       // Raw conflict markers
}
```

**Example:**

```typescript
const result = await executor.execute({
  callId: "1",
  name: "git_conflict_info",
  input: {}
});
// Returns: {
//   hasConflicts: true,
//   files: [{
//     path: "src/config.ts",
//     oursContent: "const port = 3000;",
//     theirsContent: "const port = 8080;",
//     markers: "<<<<<<< HEAD\nconst port = 3000;\n=======\nconst port = 8080;\n>>>>>>> feature"
//   }]
// }
```

---

### git_resolve_conflict

Resolve a merge conflict using specified strategy.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | Yes | Path to conflicted file |
| `strategy` | `"ours"` \| `"theirs"` \| `"content"` | Yes | Resolution strategy |
| `content` | string | Conditional | Custom content (required if strategy is `"content"`) |
| `cwd` | string | No | Working directory |

**Returns:** `GitResolveConflictResult`

```typescript
{
  resolved: boolean;
  path: string;
  strategy: "ours" | "theirs" | "content";
}
```

**⚠️ Confirmation Required:** All conflict resolutions require user confirmation.

**Examples:**

```typescript
// Keep our changes
const result = await executor.execute({
  callId: "1",
  name: "git_resolve_conflict",
  input: { path: "src/config.ts", strategy: "ours" }
});

// Accept their changes
const result = await executor.execute({
  callId: "2",
  name: "git_resolve_conflict",
  input: { path: "src/config.ts", strategy: "theirs" }
});

// Provide custom resolution
const result = await executor.execute({
  callId: "3",
  name: "git_resolve_conflict",
  input: {
    path: "src/config.ts",
    strategy: "content",
    content: "const port = process.env.PORT || 3000;"
  }
});
```

---

## Stash Management

### git_stash

Manage stashed changes.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | `"push"` \| `"pop"` \| `"apply"` \| `"list"` \| `"drop"` \| `"clear"` | Yes | Stash operation |
| `message` | string | No | Message for push operation |
| `index` | number | No | Stash index for apply/drop |
| `includeUntracked` | boolean | No | Include untracked files (for push) |
| `cwd` | string | No | Working directory |

**Returns:** `GitStashResult` (varies by action)

```typescript
// push
{ stashed: boolean; message: string; }

// pop/apply
{ applied: boolean; message: string; }

// list
{ stashes: GitStashEntry[]; }

// drop
{ dropped: boolean; index?: number; }

// clear
{ count: number; }
```

**⚠️ Confirmation Required:** `drop` and `clear` actions require user confirmation.

**Examples:**

```typescript
// Stash current changes
const result = await executor.execute({
  callId: "1",
  name: "git_stash",
  input: { action: "push", message: "WIP: auth feature" }
});

// Stash including untracked files
const result = await executor.execute({
  callId: "2",
  name: "git_stash",
  input: { action: "push", includeUntracked: true }
});

// List stashes
const result = await executor.execute({
  callId: "3",
  name: "git_stash",
  input: { action: "list" }
});

// Apply most recent stash
const result = await executor.execute({
  callId: "4",
  name: "git_stash",
  input: { action: "apply" }
});

// Pop and remove stash
const result = await executor.execute({
  callId: "5",
  name: "git_stash",
  input: { action: "pop" }
});

// Drop specific stash (requires confirmation)
const result = await executor.execute({
  callId: "6",
  name: "git_stash",
  input: { action: "drop", index: 0 }
});

// Clear all stashes (requires confirmation)
const result = await executor.execute({
  callId: "7",
  name: "git_stash",
  input: { action: "clear" }
});
```

---

## Network Operations

### git_fetch

Download objects and refs from a remote repository.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `remote` | string | No | Remote name (default: `"origin"`) |
| `branch` | string | No | Specific branch to fetch |
| `all` | boolean | No | Fetch all remotes |
| `prune` | boolean | No | Prune deleted remote branches |
| `cwd` | string | No | Working directory |

**Returns:** `GitFetchResult`

```typescript
{
  success: boolean;
  remote: string;
  message: string;
  branch?: string;
  pruned?: boolean;
}
```

**Examples:**

```typescript
// Fetch from origin
const result = await executor.execute({
  callId: "1",
  name: "git_fetch",
  input: {}
});

// Fetch all remotes with pruning
const result = await executor.execute({
  callId: "2",
  name: "git_fetch",
  input: { all: true, prune: true }
});

// Fetch specific branch
const result = await executor.execute({
  callId: "3",
  name: "git_fetch",
  input: { branch: "develop" }
});
```

---

### git_pull

Fetch and integrate changes from a remote repository.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `remote` | string | No | Remote name (default: `"origin"`) |
| `branch` | string | No | Branch to pull |
| `rebase` | boolean | No | Use rebase instead of merge |
| `cwd` | string | No | Working directory |

**Returns:** `GitPullResult`

```typescript
{
  success: boolean;
  remote: string;
  message: string;
  rebased?: boolean;
  filesUpdated?: number;
  conflicts?: string[];
}
```

**Examples:**

```typescript
// Pull from origin
const result = await executor.execute({
  callId: "1",
  name: "git_pull",
  input: {}
});

// Pull with rebase
const result = await executor.execute({
  callId: "2",
  name: "git_pull",
  input: { rebase: true }
});

// Pull specific branch
const result = await executor.execute({
  callId: "3",
  name: "git_pull",
  input: { branch: "main" }
});
```

---

### git_push

Push local changes to a remote repository.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `remote` | string | No | Remote name (default: `"origin"`) |
| `branch` | string | No | Branch to push |
| `force` | boolean | No | Force push (⚠️ dangerous) |
| `setUpstream` | boolean | No | Set upstream tracking reference |
| `cwd` | string | No | Working directory |

**Returns:** `GitPushResult`

```typescript
{
  success: boolean;
  remote: string;
  message: string;
  branch?: string;
  forced?: boolean;
}
```

**⚠️ Confirmation Required:** `force: true` requires user confirmation.

**Examples:**

```typescript
// Push to origin
const result = await executor.execute({
  callId: "1",
  name: "git_push",
  input: {}
});

// Push and set upstream
const result = await executor.execute({
  callId: "2",
  name: "git_push",
  input: { setUpstream: true }
});

// Force push (requires confirmation)
const result = await executor.execute({
  callId: "3",
  name: "git_push",
  input: { force: true }
});
```

---

### git_remote

Manage remote repositories.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | `"list"` \| `"add"` \| `"remove"` \| `"rename"` | Yes | Operation to perform |
| `name` | string | Conditional | Remote name (for add/remove/rename) |
| `url` | string | Conditional | Remote URL (for add) |
| `newName` | string | Conditional | New name (for rename) |
| `cwd` | string | No | Working directory |

**Returns:** `GitRemoteResult`

```typescript
// For list:
{
  remotes: GitRemoteEntry[];
}

// For add/remove/rename:
{
  message: string;
  name: string;
}
```

**⚠️ Confirmation Required:** `action: "remove"` requires user confirmation.

**Examples:**

```typescript
// List remotes
const result = await executor.execute({
  callId: "1",
  name: "git_remote",
  input: { action: "list" }
});

// Add remote
const result = await executor.execute({
  callId: "2",
  name: "git_remote",
  input: { action: "add", name: "upstream", url: "https://github.com/org/repo.git" }
});

// Remove remote (requires confirmation)
const result = await executor.execute({
  callId: "3",
  name: "git_remote",
  input: { action: "remove", name: "old-remote" }
});

// Rename remote
const result = await executor.execute({
  callId: "4",
  name: "git_remote",
  input: { action: "rename", name: "origin", newName: "upstream" }
});
```

---

## PR Generation

### git_generate_pr

Generate a PR title and description from commits.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `target` | string | No | Target branch to compare against (default: `"main"`) |
| `template` | string | No | PR description template |
| `cwd` | string | No | Working directory |

**Returns:** `GeneratedPR`

```typescript
{
  title: string;         // Generated PR title
  body: string;          // Formatted PR description
  commits: number;       // Number of commits included
  filesChanged: string[]; // List of changed files
}
```

**Example:**

```typescript
const result = await executor.execute({
  callId: "1",
  name: "git_generate_pr",
  input: { target: "main" }
});
// Returns: {
//   title: "Add user authentication",
//   body: "## Changes\n\n- abc1234 feat: add login endpoint\n- def5678 feat: add logout endpoint\n\n## Files Changed\n\n- src/auth/login.ts\n- src/auth/logout.ts",
//   commits: 2,
//   filesChanged: ["src/auth/login.ts", "src/auth/logout.ts"]
// }
```

---

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 7000 | `GIT_NOT_INITIALIZED` | Not a Git repository |
| 7001 | `GIT_SNAPSHOT_DISABLED` | Snapshot service disabled |
| 7002 | `GIT_PROTECTED_PATH` | Attempting to modify protected path |
| 7010 | `GIT_OPERATION_FAILED` | Generic Git operation failure |
| 7020 | `GIT_LOCK_TIMEOUT` | Could not acquire Git lock |
| 7030 | `GIT_CONFLICT` | Merge/rebase conflicts exist |
| 7031 | `GIT_DIRTY_WORKDIR` | Uncommitted changes in working directory |
| 7032 | `GIT_BRANCH_EXISTS` | Branch already exists |
| 7033 | `GIT_BRANCH_NOT_FOUND` | Branch does not exist |
| 7034 | `GIT_REMOTE_ERROR` | Remote operation failed |
| 7035 | `GIT_TIMEOUT` | Git operation timed out |
| 7036 | `GIT_NO_STAGED_CHANGES` | No staged changes to commit |
| 7037 | `GIT_STASH_EMPTY` | Stash is empty |

### Error Handling Example

```typescript
import { ErrorCode } from "@vellum/core";

const result = await executor.execute({
  callId: "1",
  name: "git_commit",
  input: { message: "test" }
});

if (!result.success && result.error) {
  switch (result.error.code) {
    case ErrorCode.GIT_NO_STAGED_CHANGES:
      console.log("Nothing to commit - stage files first");
      break;
    case ErrorCode.GIT_CONFLICT:
      console.log("Resolve conflicts before committing");
      break;
    default:
      console.error(`Git error: ${result.error.message}`);
  }
}
```

---

## Confirmation Requirements

The following operations require user confirmation before execution:

| Tool | Condition | Reason |
|------|-----------|--------|
| `git_branch` | `action: "delete"` | Prevents accidental branch deletion |
| `git_checkout` | `force: true` | Discards uncommitted changes |
| `git_merge` | Always | Modifies commit history |
| `git_resolve_conflict` | Always | Overwrites conflicted file |
| `git_stash` | `action: "drop"` or `"clear"` | Permanently removes stashed changes |
| `git_push` | `force: true` | Rewrites remote history |
| `git_remote` | `action: "remove"` | Removes remote reference |

### Permission System Integration

Git tools integrate with Vellum's permission system:

```typescript
import { createDefaultPermissionChecker, TrustManager } from "@vellum/core/permission";

const checker = createDefaultPermissionChecker({
  trustManager: new TrustManager({ configPreset: "default" }),
  askHandler: async (info) => {
    if (info.toolName.startsWith("git_")) {
      // Custom handling for git tools
      console.log(`Git operation: ${info.toolName}`);
    }
    return "once";
  },
});
```

---

## Registration

Register all Git tools with a tool registry:

```typescript
import { createToolRegistry, registerGitTools } from "@vellum/core";

const registry = createToolRegistry();
registerGitTools(registry);

// Or register with all built-in tools
import { registerAllBuiltinTools } from "@vellum/core";

await registerAllBuiltinTools(registry, {
  cwd: process.cwd(),
  projectRoot: "/path/to/project",
});
```

---

## See Also

- [Tool System Documentation](../packages/core/README.md#tool-system)
- [Permission System](../packages/core/README.md#permission-system)
- [Error Handling](./errors.md)
