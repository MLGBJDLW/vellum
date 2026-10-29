# Dependency modernization — 2026-10-29

The direct dependency inventory was checked against the npm registry on October 29, 2026. The workspace now uses pnpm 12.16.1 and Node.js `^22.22.1 || >=24.11.0`; CI retains the existing three operating systems and two Node.js versions, with Node 22 and 24 replacing Node 20 and 22. The published CLI declares the same runtime requirement.

## Updated families

| Area | Previous baseline | Updated version |
| --- | --- | --- |
| Anthropic SDK | 0.71.2; core also used 0.52 | 1.3.0 |
| OpenAI SDK | 6.16.0 | 7.45.1 |
| Google GenAI SDK | 1.38.0 | 2.31.0 |
| MCP SDK | 1.25.3 | 1.32.2 |
| Ink fork / React | 6.4.7 / 19.2.3 | 7.1.0 / 19.3.1 |
| Biome | 2.3.12 | 2.6.4 |
| Vitest / coverage | 4.0.18; eval used 3.x | 5.0.5 throughout |
| Changesets CLI / GitHub changelog | 2.29.8 / 0.5.2 | 3.0.3 / 1.0.1 |
| tsup | 8.5.1 | 9.0.0 |
| OpenTelemetry SDK | 2.5 / 0.211 | 3.0 / 0.300 |
| Zod | 4.3.6; eval used 3.x | 4.6.7 throughout |
| Chokidar | 4.x and 5.x | 6.0.0 throughout |
| LSP protocol / JSON-RPC | 3.17.5 / 8.2.1 | 3.18.5 / 10.0.0 |
| Shiki / marked | 3.21.0 / 17.0.1 | 4.5.0 / 18.1.2 |
| diff / js-yaml / undici | 5.2.2 / 4.1.1 / 7.x | 9.0.0 / 5.5.0 / 8.12.3 |

Other direct dependencies were refreshed to their current stable registry releases. TypeScript remains 7.0.2, which was already current. Node type declarations intentionally follow the supported Node 22 line (22.20.5), rather than allowing development to silently depend on Node 26 APIs. The existing Ink fork remains the renderer because Vellum uses its layout and scrolling extensions; its new version still requires the separate input-routing repair described in this change.

## Compatibility changes and removals

- Replaced removed OpenTelemetry `sdk-trace-node` imports with `sdk-trace`, including explicit context registration and cleanup in the logger fixture.
- Used the LSP JSON-RPC package's public `node` export, retained markup diagnostic messages during deduplication, and rejected unadvertised interactive snippet edits instead of returning invalid plain text edits.
- Migrated js-yaml imports to its named ESM exports. Gave the CLI's CommonJS bridge a distinct import name so the new OpenTelemetry bundle cannot collide with it.
- Migrated existing optional benchmarks to Vitest 5's test-context benchmark fixture; the normal CI test selection does not include benchmark files.
- Preserved the fuzzy-search service's unlimited default explicitly after fuzzysort 4 introduced a ten-result default. UI windowing still determines how many matches are painted, and explicit caller limits remain effective.
- Adapted instruction-file watching to Chokidar 6 using normalized exact targets and filtered native directory subscriptions. This avoids duplicate Windows case aliases, observes newly created nested instruction files, and prevents parent lookup from recursively subscribing to the entire home directory.
- Preserved private package versioning explicitly in Changesets 3. Private packages remain unpublished and do not acquire release tags.
- Adapted snapshot Git operations to simple-git 4's environment guard: discard inherited Git/pager/editor overrides, allow only Vellum's explicit repository paths and non-interactive prompt setting, and keep unsafe execution disabled. Real snapshot and Git integration checks passed all 146 cases after the change.
- Removed unused direct `zod-to-json-schema` and `dependency-cruiser`, redundant `@types/marked`, `@types/diff`, and `@types/js-yaml`, the missing Blessed development entry point, and obsolete renderer externals.
- Removed unused Turbo cache steps. Installs use the frozen lockfile; pnpm's build permissions explicitly allow esbuild and keytar while skipping the inspected no-op/advisory hooks in Google GenAI and protobufjs. Running tests or builds does not silently launch another install.
- Preserved the prior Markdown lint/format scope during the Biome upgrade. Hook-factory lint suppression applies only to test fixtures. The stricter runtime array-key rule remains enabled; positional glyph/token cells have local documented suppressions, while autocomplete option rows use model identity.

The lockfile was refreshed recursively within dependency ranges after the direct upgrades. This removed 54 reported production advisories from stale transitive resolutions, including fixes in protobufjs, qs, minimatch, Hono's Node adapter, and Express dependencies, without adding broad version overrides. Both production and complete dependency audits subsequently reported zero known vulnerabilities (461 production/optional entries and 692 total entries). This is a registry advisory result, not a claim that the application has no security defects.

## Validation

- Frozen install completed successfully with pnpm 12.16.1, including esbuild and keytar native installation.
- All workspace packages built successfully with tsup 9 and TypeScript 7.
- Sequential typechecking passed across all nine packages.
- Focused telemetry, logger, and LSP tests passed: 74 tests.
- Follow-up dependency regressions passed: 95 delegation, autocomplete, clipboard-hook, and fuzzy-search tests, plus 22 instruction-watcher tests. The optional benchmark suite passed all 27 cases.
- Provider adapter and terminal input suites were validated separately by their implementation owners. The final full-suite and hosted CI results belong to the release record.

## Primary references

- [npm registry metadata](https://registry.npmjs.org/) supplied version, engine, peer-dependency, and deprecation information.
- [OpenTelemetry 3 migration guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/3.x/migration-guide.md) documents the removed trace packages and explicit registration API.
- [LSP implementation and release history](https://github.com/microsoft/vscode-languageserver-node) documents package exports and protocol 3.18 changes.
- [Vitest 5 migration guide](https://vitest.dev/guide/migration/) documents the benchmark fixture migration.
- [pnpm build settings](https://pnpm.io/settings/build) documents explicit build permissions and dependency checks before commands.
- [Changesets configuration schema](https://github.com/changesets/changesets/blob/main/packages/config/schema.json) defines private package versioning defaults.
- [Checkout releases](https://github.com/actions/checkout/releases), [setup-node releases](https://github.com/actions/setup-node/releases), [pnpm setup releases](https://github.com/pnpm/action-setup/releases), and [github-script releases](https://github.com/actions/github-script/releases) were used to update CI actions without expanding the matrix.
