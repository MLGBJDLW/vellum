import type { IProjectMemoryService } from "../memory/service.js";
import { SessionListService } from "./list.js";
import { getTextContent } from "./message.js";
import type {
  ResumeContext,
  ResumeOptions,
  SessionSearchQuery,
  SessionSearchResult,
} from "./resume-types.js";
import type { StorageManager } from "./storage.js";
import type { Session, SessionMetadata } from "./types.js";

export interface ResumeServiceConfig {
  storageManager: StorageManager;
  projectMemory?: IProjectMemoryService;
  defaultContextWindow: number;
  defaultMaxTokens: number;
}

export interface ISessionResumeService {
  findSession(idOrKeyword: string): Promise<SessionMetadata[]>;
  getMostRecent(workingDirectory?: string): Promise<SessionMetadata | undefined>;
  search(query: SessionSearchQuery): Promise<SessionSearchResult>;
  buildResumeContext(options: ResumeOptions): Promise<ResumeContext>;
  restore(sessionId: string, restoreSnapshot?: boolean): Promise<Session>;
  assembleMessages(context: ResumeContext): Promise<{
    systemPrompt: string;
    historyMessages: Array<{ role: string; content: string }>;
  }>;
}

export class SessionResumeService implements ISessionResumeService {
  private readonly storage: StorageManager;
  private readonly listService: SessionListService;
  private readonly projectMemory?: IProjectMemoryService;
  private readonly defaultContextWindow: number;
  private readonly defaultMaxTokens: number;

  constructor(config: ResumeServiceConfig) {
    this.storage = config.storageManager;
    this.listService = new SessionListService(this.storage);
    this.projectMemory = config.projectMemory;
    this.defaultContextWindow = config.defaultContextWindow;
    this.defaultMaxTokens = config.defaultMaxTokens;
  }

  async findSession(idOrKeyword: string): Promise<SessionMetadata[]> {
    const index = await this.storage.getIndex();
    const keyword = idOrKeyword.toLowerCase();
    const matches: SessionMetadata[] = [];

    for (const [id, metadata] of index) {
      if (id.startsWith(idOrKeyword)) {
        matches.push(metadata);
        continue;
      }

      const title = metadata.title.toLowerCase();
      const summary = metadata.summary?.toLowerCase() ?? "";
      if (title.includes(keyword) || summary.includes(keyword)) {
        matches.push(metadata);
      }
    }

    return matches.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
  }

  async getMostRecent(workingDirectory?: string): Promise<SessionMetadata | undefined> {
    const filter = workingDirectory ? { workingDirectory } : undefined;
    const result = await this.listService.listSessions(filter, {
      field: "lastActive",
      direction: "desc",
    });
    return result.items[0];
  }

  async search(query: SessionSearchQuery): Promise<SessionSearchResult> {
    const filter = {
      workingDirectory: query.workingDirectory,
      tags: query.tags,
      createdAfter: query.from,
      createdBefore: query.to,
      searchQuery: query.keyword,
    };

    const result = await this.listService.listSessions(
      filter,
      {
        field: "lastActive",
        direction: "desc",
      },
      { page: 1, pageSize: query.limit }
    );

    return {
      sessions: result.items,
      total: result.total,
      hasMore: result.hasMore,
    };
  }

  async buildResumeContext(options: ResumeOptions): Promise<ResumeContext> {
    const resolved = { ...options };
    if (!resolved.sessionId && !resolved.latest) {
      resolved.latest = true;
    }

    const metadata = resolved.latest
      ? await this.getMostRecent()
      : resolved.sessionId
        ? await this.findByIdOrPrefix(resolved.sessionId)
        : undefined;

    if (!metadata) {
      throw new Error("Session not found");
    }

    const fullSession = await this.storage.load(metadata.id);
    const contextWindow = resolved.mode === "last-n" ? resolved.lastN : this.defaultContextWindow;
    const includeProjectMemory = true;

    const tokenLimit = resolved.maxTokens ?? this.defaultMaxTokens;
    const estimatedTokens = this.estimateTokens(fullSession, contextWindow, tokenLimit);

    return {
      session: fullSession,
      mode: resolved.mode,
      contextWindow,
      includeProjectMemory,
      estimatedTokens,
    };
  }

  async restore(sessionId: string, _restoreSnapshot?: boolean): Promise<Session> {
    return this.storage.load(sessionId);
  }

  async assembleMessages(context: ResumeContext): Promise<{
    systemPrompt: string;
    historyMessages: Array<{ role: string; content: string }>;
  }> {
    const session = context.session;
    const summary = session.metadata.summary;
    const projectMemory =
      context.includeProjectMemory && this.projectMemory
        ? await this.projectMemory.buildContext()
        : "";

    const systemSections: string[] = [];
    if (summary) {
      systemSections.push(`Session summary:\n${summary}`);
    }
    if (projectMemory) {
      systemSections.push(projectMemory);
    }

    const systemPrompt = systemSections.join("\n\n");
    const historyMessages = this.selectMessages(session, context).map((message) => ({
      role: message.role,
      content: getTextContent(message),
    }));

    return { systemPrompt, historyMessages };
  }

  private selectMessages(session: Session, context: ResumeContext) {
    const messages = session.messages;
    if (context.mode === "full") {
      return messages;
    }
    if (context.mode === "last-n") {
      return messages.slice(-context.contextWindow);
    }
    return messages.slice(-context.contextWindow);
  }

  private estimateTokens(session: Session, contextWindow: number, maxTokens: number): number {
    const slice = session.messages.slice(-contextWindow);
    const raw = slice.map((message) => getTextContent(message)).join("\n");
    const estimate = Math.ceil(raw.length / 4);
    return Math.min(estimate, maxTokens);
  }

  private async findByIdOrPrefix(sessionId: string): Promise<SessionMetadata | undefined> {
    const index = await this.storage.getIndex();
    const exact = index.get(sessionId);
    if (exact) {
      return exact;
    }

    const matches = Array.from(index.values()).filter((metadata) =>
      metadata.id.startsWith(sessionId)
    );
    if (matches.length === 1) {
      return matches[0];
    }

    return undefined;
  }
}
