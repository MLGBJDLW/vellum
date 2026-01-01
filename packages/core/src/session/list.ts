// ============================================
// Session List Service
// ============================================

/**
 * Service for listing, filtering, sorting, and paginating sessions.
 *
 * Provides efficient session queries by operating on metadata only,
 * avoiding full session loads for better performance.
 *
 * @module @vellum/core/session/list
 */

import { z } from "zod";
import type { StorageManager } from "./storage.js";
import type { SessionMetadata } from "./types.js";

// =============================================================================
// Session Filter Schema & Type
// =============================================================================

/**
 * Schema for session filter options.
 *
 * All fields are optional - unset fields are not used in filtering.
 */
export const SessionFilterSchema = z.object({
  /** Filter by session status (single or multiple) */
  status: z
    .union([
      z.enum(["active", "paused", "completed", "archived"]),
      z.array(z.enum(["active", "paused", "completed", "archived"])),
    ])
    .optional(),
  /** Filter by session mode (single or multiple) */
  mode: z
    .union([
      z.enum(["chat", "code", "plan", "debug", "draft"]),
      z.array(z.enum(["chat", "code", "plan", "debug", "draft"])),
    ])
    .optional(),
  /** Filter by tags (matches any tag in the list) */
  tags: z.array(z.string()).optional(),
  /** Filter by working directory (exact match) */
  workingDirectory: z.string().optional(),
  /** Filter sessions created after this date */
  createdAfter: z.coerce.date().optional(),
  /** Filter sessions created before this date */
  createdBefore: z.coerce.date().optional(),
  /** Simple text search on title and summary */
  searchQuery: z.string().optional(),
});

/**
 * Filter options for listing sessions.
 *
 * All fields are optional - unset fields are not used in filtering.
 *
 * @example
 * ```typescript
 * const filter: SessionFilter = {
 *   status: 'active',
 *   tags: ['important', 'work'],
 *   createdAfter: new Date('2025-01-01')
 * };
 * ```
 */
export type SessionFilter = z.infer<typeof SessionFilterSchema>;

// =============================================================================
// Session Sort Schema & Type
// =============================================================================

/**
 * Fields available for sorting sessions.
 */
export const SessionSortFieldSchema = z.enum([
  "createdAt",
  "updatedAt",
  "lastActive",
  "title",
  "messageCount",
]);

export type SessionSortField = z.infer<typeof SessionSortFieldSchema>;

/**
 * Sort direction.
 */
export const SortDirectionSchema = z.enum(["asc", "desc"]);

export type SortDirection = z.infer<typeof SortDirectionSchema>;

/**
 * Schema for session sort options.
 */
export const SessionSortSchema = z.object({
  /** Field to sort by */
  field: SessionSortFieldSchema,
  /** Sort direction */
  direction: SortDirectionSchema,
});

/**
 * Sort options for listing sessions.
 *
 * @example
 * ```typescript
 * const sort: SessionSort = {
 *   field: 'lastActive',
 *   direction: 'desc'
 * };
 * ```
 */
export type SessionSort = z.infer<typeof SessionSortSchema>;

// =============================================================================
// Pagination Schema & Types
// =============================================================================

/**
 * Schema for pagination options.
 */
export const PaginationOptionsSchema = z.object({
  /** Page number (1-based) */
  page: z.number().int().positive().default(1),
  /** Number of items per page */
  pageSize: z.number().int().positive().default(20),
});

/**
 * Pagination options for listing sessions.
 *
 * @example
 * ```typescript
 * const pagination: PaginationOptions = {
 *   page: 2,
 *   pageSize: 10
 * };
 * ```
 */
export type PaginationOptions = z.infer<typeof PaginationOptionsSchema>;

/**
 * Schema for paginated results.
 */
export const PaginatedResultSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    /** Items for the current page */
    items: z.array(itemSchema),
    /** Total number of items matching the filter */
    total: z.number().int().nonnegative(),
    /** Current page number (1-based) */
    page: z.number().int().positive(),
    /** Number of items per page */
    pageSize: z.number().int().positive(),
    /** Whether there are more pages after this one */
    hasMore: z.boolean(),
  });

/**
 * Generic paginated result interface.
 *
 * @typeParam T - Type of items in the result
 *
 * @example
 * ```typescript
 * const result: PaginatedResult<SessionMetadata> = {
 *   items: [session1, session2],
 *   total: 50,
 *   page: 1,
 *   pageSize: 20,
 *   hasMore: true
 * };
 * ```
 */
export interface PaginatedResult<T> {
  /** Items for the current page */
  items: T[];
  /** Total number of items matching the filter */
  total: number;
  /** Current page number (1-based) */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Whether there are more pages after this one */
  hasMore: boolean;
}

// =============================================================================
// Default Values
// =============================================================================

/** Default page number */
export const DEFAULT_PAGE = 1;

/** Default page size */
export const DEFAULT_PAGE_SIZE = 20;

/** Default sort configuration */
export const DEFAULT_SORT: SessionSort = {
  field: "lastActive",
  direction: "desc",
};

// =============================================================================
// Session List Service
// =============================================================================

/**
 * Service for listing, filtering, sorting, and paginating sessions.
 *
 * Operates on session metadata only (via the storage index) for efficiency,
 * avoiding full session loads.
 *
 * @example
 * ```typescript
 * const storage = await StorageManager.create();
 * const listService = new SessionListService(storage);
 *
 * // List active sessions, sorted by last active
 * const result = await listService.listSessions(
 *   { status: 'active' },
 *   { field: 'lastActive', direction: 'desc' },
 *   { page: 1, pageSize: 10 }
 * );
 *
 * // Get recent sessions (shorthand)
 * const recent = await listService.getRecentSessions(5);
 *
 * // Count sessions by tag
 * const count = await listService.countSessions({ tags: ['important'] });
 *
 * // Get all sessions with a specific tag
 * const tagged = await listService.getSessionsByTag('work');
 * ```
 */
export class SessionListService {
  /** Storage manager for accessing session index */
  private readonly storage: StorageManager;

  /**
   * Creates a new SessionListService.
   *
   * @param storage - StorageManager instance for accessing session data
   */
  constructor(storage: StorageManager) {
    this.storage = storage;
  }

  /**
   * Lists sessions with optional filtering, sorting, and pagination.
   *
   * Filters are applied on metadata only for efficiency.
   * Supports multiple sort fields via array (primary sort first).
   *
   * @param filter - Optional filter criteria
   * @param sort - Optional sort configuration (single or array for multi-field)
   * @param pagination - Optional pagination options
   * @returns Paginated result of session metadata
   *
   * @example
   * ```typescript
   * // List active sessions in code mode
   * const result = await service.listSessions(
   *   { status: 'active', mode: 'code' },
   *   { field: 'updatedAt', direction: 'desc' }
   * );
   *
   * // Multi-field sort: by status, then by title
   * const result = await service.listSessions(
   *   undefined,
   *   [
   *     { field: 'title', direction: 'asc' },
   *     { field: 'createdAt', direction: 'desc' }
   *   ]
   * );
   * ```
   */
  async listSessions(
    filter?: SessionFilter,
    sort?: SessionSort | SessionSort[],
    pagination?: Partial<PaginationOptions>
  ): Promise<PaginatedResult<SessionMetadata>> {
    // Get all sessions from the index
    const index = await this.storage.getIndex();
    let sessions = Array.from(index.values());

    // Apply filters
    if (filter) {
      sessions = this.applyFilter(sessions, filter);
    }

    // Apply sorting
    const sortConfig = sort ?? DEFAULT_SORT;
    sessions = this.applySort(sessions, sortConfig);

    // Calculate pagination
    const page = pagination?.page ?? DEFAULT_PAGE;
    const pageSize = pagination?.pageSize ?? DEFAULT_PAGE_SIZE;
    const total = sessions.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const items = sessions.slice(startIndex, endIndex);
    const hasMore = endIndex < total;

    return {
      items,
      total,
      page,
      pageSize,
      hasMore,
    };
  }

  /**
   * Gets recent sessions sorted by lastActive date.
   *
   * Shorthand for listing sessions sorted by lastActive descending.
   *
   * @param limit - Maximum number of sessions to return (default: 10)
   * @returns Array of recent session metadata
   *
   * @example
   * ```typescript
   * const recent = await service.getRecentSessions(5);
   * ```
   */
  async getRecentSessions(limit = 10): Promise<SessionMetadata[]> {
    const result = await this.listSessions(
      undefined,
      { field: "lastActive", direction: "desc" },
      { page: 1, pageSize: limit }
    );
    return result.items;
  }

  /**
   * Counts sessions matching the given filter.
   *
   * @param filter - Optional filter criteria
   * @returns Number of sessions matching the filter
   *
   * @example
   * ```typescript
   * const activeCount = await service.countSessions({ status: 'active' });
   * const totalCount = await service.countSessions();
   * ```
   */
  async countSessions(filter?: SessionFilter): Promise<number> {
    const index = await this.storage.getIndex();
    let sessions = Array.from(index.values());

    if (filter) {
      sessions = this.applyFilter(sessions, filter);
    }

    return sessions.length;
  }

  /**
   * Gets all sessions with a specific tag.
   *
   * Shorthand for filtering by a single tag.
   *
   * @param tag - Tag to filter by
   * @returns Array of session metadata with the tag
   *
   * @example
   * ```typescript
   * const workSessions = await service.getSessionsByTag('work');
   * ```
   */
  async getSessionsByTag(tag: string): Promise<SessionMetadata[]> {
    const result = await this.listSessions(
      { tags: [tag] },
      { field: "lastActive", direction: "desc" },
      { page: 1, pageSize: Number.MAX_SAFE_INTEGER }
    );
    return result.items;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Applies filter criteria to a list of sessions.
   */
  private applyFilter(sessions: SessionMetadata[], filter: SessionFilter): SessionMetadata[] {
    return sessions.filter((session) => this.matchesFilter(session, filter));
  }

  /**
   * Checks if a session matches all filter criteria.
   */
  private matchesFilter(session: SessionMetadata, filter: SessionFilter): boolean {
    return (
      this.matchesStatus(session, filter) &&
      this.matchesMode(session, filter) &&
      this.matchesTags(session, filter) &&
      this.matchesWorkingDirectory(session, filter) &&
      this.matchesDateRange(session, filter) &&
      this.matchesSearchQuery(session, filter)
    );
  }

  /**
   * Checks if a session matches the status filter.
   */
  private matchesStatus(session: SessionMetadata, filter: SessionFilter): boolean {
    if (filter.status === undefined) {
      return true;
    }
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    return statuses.includes(session.status);
  }

  /**
   * Checks if a session matches the mode filter.
   */
  private matchesMode(session: SessionMetadata, filter: SessionFilter): boolean {
    if (filter.mode === undefined) {
      return true;
    }
    const modes = Array.isArray(filter.mode) ? filter.mode : [filter.mode];
    return modes.includes(session.mode);
  }

  /**
   * Checks if a session matches the tags filter (any tag).
   */
  private matchesTags(session: SessionMetadata, filter: SessionFilter): boolean {
    if (filter.tags === undefined || filter.tags.length === 0) {
      return true;
    }
    return filter.tags.some((tag) => session.tags.includes(tag));
  }

  /**
   * Checks if a session matches the working directory filter.
   */
  private matchesWorkingDirectory(session: SessionMetadata, filter: SessionFilter): boolean {
    if (filter.workingDirectory === undefined) {
      return true;
    }
    return session.workingDirectory === filter.workingDirectory;
  }

  /**
   * Checks if a session matches the date range filter.
   */
  private matchesDateRange(session: SessionMetadata, filter: SessionFilter): boolean {
    const sessionCreatedAt = this.toDate(session.createdAt);

    if (filter.createdAfter !== undefined && sessionCreatedAt < filter.createdAfter) {
      return false;
    }

    if (filter.createdBefore !== undefined && sessionCreatedAt > filter.createdBefore) {
      return false;
    }

    return true;
  }

  /**
   * Checks if a session matches the search query filter.
   */
  private matchesSearchQuery(session: SessionMetadata, filter: SessionFilter): boolean {
    if (filter.searchQuery === undefined || filter.searchQuery.trim() === "") {
      return true;
    }
    const query = filter.searchQuery.toLowerCase();
    const titleMatch = session.title.toLowerCase().includes(query);
    const summaryMatch = session.summary?.toLowerCase().includes(query) ?? false;
    return titleMatch || summaryMatch;
  }

  /**
   * Applies sort configuration to a list of sessions.
   */
  private applySort(
    sessions: SessionMetadata[],
    sort: SessionSort | SessionSort[]
  ): SessionMetadata[] {
    const sortConfigs = Array.isArray(sort) ? sort : [sort];

    return [...sessions].sort((a, b) => {
      for (const config of sortConfigs) {
        const comparison = this.compareByField(a, b, config.field, config.direction);
        if (comparison !== 0) {
          return comparison;
        }
      }
      return 0;
    });
  }

  /**
   * Compares two sessions by a specific field.
   */
  private compareByField(
    a: SessionMetadata,
    b: SessionMetadata,
    field: SessionSortField,
    direction: SortDirection
  ): number {
    let comparison: number;

    switch (field) {
      case "createdAt": {
        const dateA = this.toDate(a.createdAt);
        const dateB = this.toDate(b.createdAt);
        comparison = dateA.getTime() - dateB.getTime();
        break;
      }
      case "updatedAt": {
        const dateA = this.toDate(a.updatedAt);
        const dateB = this.toDate(b.updatedAt);
        comparison = dateA.getTime() - dateB.getTime();
        break;
      }
      case "lastActive": {
        const dateA = this.toDate(a.lastActive);
        const dateB = this.toDate(b.lastActive);
        comparison = dateA.getTime() - dateB.getTime();
        break;
      }
      case "title": {
        comparison = a.title.localeCompare(b.title);
        break;
      }
      case "messageCount": {
        comparison = a.messageCount - b.messageCount;
        break;
      }
      default: {
        comparison = 0;
      }
    }

    return direction === "desc" ? -comparison : comparison;
  }

  /**
   * Converts a Date or string to a Date object.
   */
  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }
}
