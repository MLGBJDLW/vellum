/**
 * Migration Utilities
 *
 * Provides helpers for migrating from legacy formats to the new
 * Vellum type system.
 *
 * @module migration
 */

export {
  isLegacyMessage,
  type LegacyContentPart,
  type LegacyMessage,
  migrateMessage,
  migrateMessages,
} from "./message.js";
