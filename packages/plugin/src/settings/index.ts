/**
 * Plugin Settings Module
 *
 * Exports settings-related types and schemas for plugin configuration.
 *
 * @module plugin/settings
 */

export {
  type EnvMapping,
  // Environment mapping
  EnvMappingSchema,
  type JsonSchemaObject,
  JsonSchemaObjectSchema,
  type JsonSchemaProperty,
  JsonSchemaPropertySchema,
  type JsonSchemaType,
  // JSON Schema types
  JsonSchemaTypeSchema,
  type PluginSettingsSchema,
  // Main settings schema
  PluginSettingsSchemaSchema,
  type SettingsDefaults,
  // Settings defaults
  SettingsDefaultsSchema,
  type SettingsValue,
  // Settings value
  SettingsValueSchema,
} from "./types.js";
