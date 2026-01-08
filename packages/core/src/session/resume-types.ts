import { z } from "zod";
import type { Session, SessionMetadata } from "./types.js";

export const ResumeContextSchema = z.object({
  session: z.custom<Session>(),
  mode: z.enum(["full", "summary", "last-n"]),
  contextWindow: z.number().int().positive().default(20),
  includeProjectMemory: z.boolean().default(true),
  estimatedTokens: z.number().int().nonnegative(),
});

export type ResumeContext = z.infer<typeof ResumeContextSchema>;

export const ResumeOptionsSchema = z.object({
  sessionId: z.string().optional(),
  latest: z.boolean().default(false),
  mode: z.enum(["full", "summary", "last-n"]).default("summary"),
  lastN: z.number().int().positive().default(10),
  maxTokens: z.number().int().positive().default(8000),
});

export type ResumeOptions = z.infer<typeof ResumeOptionsSchema>;

export const SessionSearchQuerySchema = z.object({
  keyword: z.string().optional(),
  workingDirectory: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().positive().default(20),
});

export type SessionSearchQuery = z.infer<typeof SessionSearchQuerySchema>;

export const SessionSearchResultSchema = z.object({
  sessions: z.array(z.custom<SessionMetadata>()),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export type SessionSearchResult = z.infer<typeof SessionSearchResultSchema>;
