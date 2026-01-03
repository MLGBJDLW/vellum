// ============================================
// T001: Node.js v18 Web Crypto Polyfill
// ============================================
// Required for OAuth PKCE in Node.js v18.x where globalThis.crypto is not defined.
// Must be imported before any MCP SDK usage.

import { webcrypto } from "node:crypto";

// Only apply polyfill in Node.js environment when crypto is undefined
if (typeof globalThis.crypto === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as { crypto: typeof webcrypto }).crypto = webcrypto;
}
