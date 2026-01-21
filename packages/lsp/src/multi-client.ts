/**
 * Multi-client manager for handling multiple LSP servers per file.
 *
 * TODO: Integration with LspHub
 * ============================
 * This class is exported but not yet integrated into LspHub.
 * Integration path:
 * 1. LspHub.getConnectionForFile() should return multiple connections
 * 2. LspHub should use MultiClientManager.mergeDiagnostics() when aggregating
 * 3. Consider workspace-aware connection pooling (multiple workspaces may share servers)
 *
 * Current limitation: Each serverId has only one connection, which means
 * multiple workspaces cannot have independent LSP sessions for the same server type.
 *
 * @module @vellum/lsp/multi-client
 */

export interface PriorityRule {
  pattern: string;
  servers: string[];
}

export interface MultiClientConfig {
  maxClientsPerFile: number;
  priorityRules: PriorityRule[];
  diagnosticMergeStrategy: "union" | "priority" | "deduplicate";
}

export class MultiClientManager {
  private config: MultiClientConfig;

  constructor(config: Partial<MultiClientConfig> = {}) {
    this.config = {
      maxClientsPerFile: config.maxClientsPerFile ?? 3,
      priorityRules: config.priorityRules ?? [],
      diagnosticMergeStrategy: config.diagnosticMergeStrategy ?? "deduplicate",
    };
  }

  getMaxClientsPerFile(): number {
    return this.config.maxClientsPerFile;
  }

  getPriorityServers(filePath: string): string[] {
    for (const rule of this.config.priorityRules) {
      if (this.matchSimplePattern(filePath, rule.pattern)) {
        return rule.servers;
      }
    }
    return [];
  }

  mergeDiagnostics<T extends { message: string; range?: unknown }>(sources: T[][]): T[] {
    if (this.config.diagnosticMergeStrategy === "union") {
      return sources.flat();
    }

    const deduped: T[] = [];
    const seen = new Set<string>();

    for (const list of sources) {
      for (const diag of list) {
        const key = `${diag.message}:${JSON.stringify(diag.range ?? {})}`;
        if (this.config.diagnosticMergeStrategy === "priority") {
          if (!seen.has(key)) {
            deduped.push(diag);
            seen.add(key);
          }
        } else {
          if (!seen.has(key)) {
            deduped.push(diag);
            seen.add(key);
          }
        }
      }
    }

    return deduped;
  }

  private matchSimplePattern(value: string, pattern: string): boolean {
    if (pattern === "*") return true;
    if (!pattern.includes("*") && !pattern.includes("?")) {
      return value.includes(pattern);
    }

    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
    return regex.test(value);
  }
}
