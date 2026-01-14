/**
 * Trust system for plugin capability management.
 * @module trust
 */

// Permission Bridge (plugin operation authorization)
export {
  type OperationResult,
  PermissionBridge,
  type PermissionChecker,
  type PluginOperation,
  type PluginOperationType,
} from "./permission-bridge.js";

export {
  // Store
  TrustStore,
  TrustStoreError,
  type TrustStoreFile,
  TrustStoreFileSchema,
} from "./store.js";
export {
  ContentHashSchema,
  IsoDateStringSchema,
  // Constants
  PLUGIN_CAPABILITIES,
  // Types
  type PluginCapability,
  // Schemas
  PluginCapabilitySchema,
  type TrustedPlugin,
  TrustedPluginSchema,
  type TrustLevel,
  TrustLevelSchema,
  type TrustStore as TrustStoreRecord,
  TrustStoreSchema,
} from "./types.js";
