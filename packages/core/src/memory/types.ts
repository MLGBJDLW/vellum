/**
 * Project memory types and schemas.
 */

import { z } from "zod";

export const MemoryEntryTypeSchema = z.enum(["context", "preference", "decision", "summary"]);

export type MemoryEntryType = z.infer<typeof MemoryEntryTypeSchema>;

export const MemoryEntrySchema = z.object({
  key: z.string().min(1).max(100),
  type: MemoryEntryTypeSchema,
  content: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  metadata: z
    .object({
      sessionId: z.string().uuid().optional(),
      tags: z.array(z.string()).default([]),
      importance: z.number().min(0).max(1).default(0.5),
    })
    .default({ tags: [], importance: 0.5 }),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const ProjectMemorySchema = z.object({
  version: z.literal(1),
  projectPath: z.string(),
  entries: z.record(z.string(), MemoryEntrySchema),
  updatedAt: z.coerce.date(),
  stats: z.object({
    entryCount: z.number().int().nonnegative(),
    lastSessionId: z.string().uuid().optional(),
    createdAt: z.coerce.date(),
  }),
});

export type ProjectMemory = z.infer<typeof ProjectMemorySchema>;

export const MemoryConfigSchema = z.object({
  maxEntries: z.number().int().positive().default(100),
  maxEntrySize: z.number().int().positive().default(10_000),
  autoSummaryThreshold: z.number().int().positive().default(10),
  autoCleanup: z.boolean().default(true),
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
