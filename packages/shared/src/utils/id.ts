import { randomUUID } from "node:crypto";

/**
 * Generate a unique ID using crypto.randomUUID()
 */
export function createId(): string {
  return randomUUID();
}
