/**
 * Windows sandbox adapter (stub).
 */

export function supportsWindowsSandbox(): boolean {
  return false;
}

export function windowsSandboxReason(): string {
  return "Windows sandbox backend not configured";
}
