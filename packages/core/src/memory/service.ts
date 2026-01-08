import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  type MemoryConfig,
  MemoryConfigSchema,
  type MemoryEntry,
  MemoryEntrySchema,
  type MemoryEntryType,
  type ProjectMemory,
  ProjectMemorySchema,
} from "./types.js";

export interface IProjectMemoryService {
  initialize(projectPath: string, config?: Partial<MemoryConfig>): Promise<void>;
  close(): Promise<void>;

  getEntry(key: string): Promise<MemoryEntry | undefined>;
  setEntry(key: string, type: MemoryEntryType, content: string, sessionId?: string): Promise<void>;
  deleteEntry(key: string): Promise<boolean>;
  listEntries(filter?: MemoryEntryType): Promise<MemoryEntry[]>;

  clear(confirm: true): Promise<void>;
  export(): Promise<string>;
  import(json: string, merge?: boolean): Promise<void>;

  getStats(): Promise<{
    entryCount: number;
    byType: Record<MemoryEntryType, number>;
    totalSize: number;
    lastUpdated: Date;
  }>;

  buildContext(maxTokens?: number): Promise<string>;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = MemoryConfigSchema.parse({
  maxEntries: 100,
  maxEntrySize: 10_000,
  autoSummaryThreshold: 10,
  autoCleanup: true,
});

export class ProjectMemoryService implements IProjectMemoryService {
  private config: MemoryConfig = DEFAULT_MEMORY_CONFIG;
  private memoryFilePath = "";
  private memory: ProjectMemory | null = null;

  async initialize(projectPath: string, config?: Partial<MemoryConfig>): Promise<void> {
    this.config = MemoryConfigSchema.parse({ ...DEFAULT_MEMORY_CONFIG, ...config });
    this.memoryFilePath = join(projectPath, ".vellum", "memory.json");

    await mkdir(dirname(this.memoryFilePath), { recursive: true });

    const existing = await this.loadFromDisk();
    if (existing) {
      this.memory = existing;
      return;
    }

    const now = new Date();
    this.memory = {
      version: 1,
      projectPath,
      entries: {},
      updatedAt: now,
      stats: {
        entryCount: 0,
        createdAt: now,
      },
    };

    await this.persist();
  }

  async close(): Promise<void> {
    if (!this.memory) {
      return;
    }
    await this.persist();
  }

  async getEntry(key: string): Promise<MemoryEntry | undefined> {
    const memory = this.ensureInitialized();
    return memory.entries[key];
  }

  async setEntry(
    key: string,
    type: MemoryEntryType,
    content: string,
    sessionId?: string
  ): Promise<void> {
    const memory = this.ensureInitialized();

    if (content.length > this.config.maxEntrySize) {
      throw new Error(`Memory entry exceeds maxEntrySize (${this.config.maxEntrySize})`);
    }

    const now = new Date();
    const existing = memory.entries[key];

    const entry: MemoryEntry = MemoryEntrySchema.parse({
      key,
      type,
      content,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      metadata: {
        sessionId: sessionId ?? existing?.metadata?.sessionId,
        tags: existing?.metadata?.tags ?? [],
        importance: existing?.metadata?.importance ?? 0.5,
      },
    });

    memory.entries[key] = entry;
    memory.updatedAt = now;
    this.updateStats(memory, sessionId);
    this.applyCleanup(memory);
    await this.persist();
  }

  async deleteEntry(key: string): Promise<boolean> {
    const memory = this.ensureInitialized();
    if (!memory.entries[key]) {
      return false;
    }

    delete memory.entries[key];
    memory.updatedAt = new Date();
    this.updateStats(memory, memory.stats.lastSessionId);
    await this.persist();
    return true;
  }

  async listEntries(filter?: MemoryEntryType): Promise<MemoryEntry[]> {
    const memory = this.ensureInitialized();
    const entries = Object.values(memory.entries);
    const filtered = filter ? entries.filter((entry) => entry.type === filter) : entries;
    return filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async clear(confirm: true): Promise<void> {
    if (!confirm) {
      throw new Error("Confirmation required to clear memory");
    }
    const memory = this.ensureInitialized();
    memory.entries = {};
    memory.updatedAt = new Date();
    this.updateStats(memory, memory.stats.lastSessionId);
    await this.persist();
  }

  async export(): Promise<string> {
    const memory = this.ensureInitialized();
    return JSON.stringify(memory, null, 2);
  }

  async import(json: string, merge = true): Promise<void> {
    const parsed = JSON.parse(json) as unknown;
    const imported = ProjectMemorySchema.parse(parsed);
    const memory = this.ensureInitialized();

    if (merge) {
      memory.entries = { ...memory.entries, ...imported.entries };
    } else {
      memory.entries = { ...imported.entries };
    }

    memory.updatedAt = new Date();
    memory.stats.createdAt = imported.stats.createdAt ?? memory.stats.createdAt;
    memory.stats.lastSessionId = imported.stats.lastSessionId ?? memory.stats.lastSessionId;
    this.updateStats(memory, memory.stats.lastSessionId);
    this.applyCleanup(memory);
    await this.persist();
  }

  async getStats(): Promise<{
    entryCount: number;
    byType: Record<MemoryEntryType, number>;
    totalSize: number;
    lastUpdated: Date;
  }> {
    const memory = this.ensureInitialized();
    const byType = {
      context: 0,
      preference: 0,
      decision: 0,
      summary: 0,
    } satisfies Record<MemoryEntryType, number>;

    let totalSize = 0;
    for (const entry of Object.values(memory.entries)) {
      byType[entry.type] += 1;
      totalSize += entry.content.length;
    }

    return {
      entryCount: memory.stats.entryCount,
      byType,
      totalSize,
      lastUpdated: memory.updatedAt,
    };
  }

  async buildContext(maxTokens?: number): Promise<string> {
    const entries = await this.listEntries();
    if (entries.length === 0) {
      return "";
    }

    const tokenBudget = maxTokens ? Math.max(0, maxTokens) : undefined;
    const charBudget = tokenBudget ? tokenBudget * 4 : undefined;

    const lines: string[] = ["Project memory:"];
    let currentLength = lines.join("\n").length;

    for (const entry of entries) {
      const line = `- [${entry.type}] ${entry.key}: ${entry.content}`;
      if (charBudget && currentLength + line.length + 1 > charBudget) {
        break;
      }
      lines.push(line);
      currentLength += line.length + 1;
    }

    return lines.join("\n");
  }

  private ensureInitialized(): ProjectMemory {
    if (!this.memory) {
      throw new Error("ProjectMemoryService not initialized");
    }
    return this.memory;
  }

  private updateStats(memory: ProjectMemory, sessionId?: string): void {
    memory.stats.entryCount = Object.keys(memory.entries).length;
    if (sessionId) {
      memory.stats.lastSessionId = sessionId;
    }
  }

  private applyCleanup(memory: ProjectMemory): void {
    if (!this.config.autoCleanup) {
      return;
    }

    const entries = Object.values(memory.entries);
    if (entries.length <= this.config.maxEntries) {
      return;
    }

    const sorted = entries.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
    const toRemove = sorted.slice(0, entries.length - this.config.maxEntries);
    for (const entry of toRemove) {
      delete memory.entries[entry.key];
    }

    memory.stats.entryCount = Object.keys(memory.entries).length;
  }

  private async loadFromDisk(): Promise<ProjectMemory | null> {
    try {
      const raw = await readFile(this.memoryFilePath, "utf-8");
      if (!raw.trim()) {
        return null;
      }
      const parsed = JSON.parse(raw) as unknown;
      return ProjectMemorySchema.parse(parsed);
    } catch {
      return null;
    }
  }

  private async persist(): Promise<void> {
    const memory = this.ensureInitialized();
    await writeFile(this.memoryFilePath, JSON.stringify(memory, null, 2), "utf-8");
  }
}
