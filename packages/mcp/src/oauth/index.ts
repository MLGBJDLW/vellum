// ============================================
// OAuth Module Barrel Export
// ============================================

/**
 * OAuth utilities for MCP server authentication.
 *
 * This module provides OAuth-related utilities including:
 * - Dynamic Client Registration (RFC 7591)
 * - Authorization Server Metadata discovery (RFC 8414)
 *
 * @module mcp/oauth
 */

export {
  type AuthorizationServerMetadata,
  type CachedClientInfo,
  type ClientRegistrationRequest,
  type ClientRegistrationResponse,
  createDynamicClientRegistration,
  DynamicClientRegistration,
  type DynamicClientRegistrationConfig,
} from "./DynamicClientRegistration.js";
