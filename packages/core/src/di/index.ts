/**
 * Dependency Injection module
 *
 * Provides a type-safe DI container for managing dependencies,
 * along with bootstrap and shutdown lifecycle functions.
 */

export {
  type BootstrapOptions,
  bootstrap,
  hasGlobalHandlers,
  shutdown,
} from "./bootstrap.js";
// T107 - DI Barrel Export
export { Container, Token } from "./container.js";
export { Tokens } from "./tokens.js";
