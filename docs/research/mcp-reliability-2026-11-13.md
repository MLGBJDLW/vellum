# MCP discovery and result reliability

Audited on November 13, 2026. Vellum's installed `@modelcontextprotocol/sdk`
1.32.2 issues one request per list call. Its newer upstream client has different
aggregation behavior; applying current main-branch examples to this installed
version would silently omit results.

The [MCP pagination specification](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/pagination)
defines opaque cursors for tools, resources, templates, and prompts. The
[Codex connection manager](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/connection_manager.rs)
also follows resource cursors and detects repeats. Vellum now uses one internal
page collector for its existing discovery methods, retaining filters and only
publishing a complete inventory. A repeated cursor is an error, including an
empty-string cursor; it cannot start an infinite repeated-page loop. No fixed
model/tool count or page count was added.

Tool pages are aggregated below the SDK's public `request` interface so its
existing `listTools` method caches the complete inventory once. This preserves
first-page output-schema validation and required-task checks, and a failed later
page leaves the previous SDK metadata intact. No private SDK cache is modified.
Resource-only servers can connect without exposing a tools capability.

The [MCP tool result contract](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
distinguishes application errors from protocol failures and supports structured
results. Previously, Vellum's registration callback discarded `isError` and
`structuredContent`, so an unsuccessful operation appeared successful and a
structured-only result became empty. Registered tools now preserve structured
data and return failed receipts with server diagnostics. Existing content-only
outputs keep their shape; protocol content types come from the installed SDK.

Failed connection initialization now closes the client, transport, and any source
watcher before storing its failed status. This matters when a subprocess starts
successfully but later capability discovery fails.

Validation uses real SDK clients and servers connected through the SDK's in-memory
transport: multi-page discovery, filtered refresh, repeat cursors, failed later
pages, structured-only output, error receipts, and resource links. A separate
lifecycle regression checks failed-startup cleanup. No external MCP service or
paid inference is required. Server-side authorization and nonterminating streams
of unique cursors are not certified by these fixtures.
