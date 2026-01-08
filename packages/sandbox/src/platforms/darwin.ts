/**
 * macOS sandbox adapter (stub).
 */

export function supportsDarwinSandbox(): boolean {
  return false;
}

export function darwinSandboxReason(): string {
  return "macOS sandbox backend not configured";
}
