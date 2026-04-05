/**
 * Open URL in the user's default browser.
 *
 * Security: Only http:// and https:// URLs are allowed.
 * Uses execFile (not exec) to avoid shell injection on macOS/Linux.
 * On Windows, cmd metacharacters are escaped with ^ prefix.
 *
 * @module tui/utils/open-url
 */

import { execFile } from "node:child_process";

/**
 * Open a URL in the user's default browser.
 *
 * @param url - The URL to open (only http/https allowed)
 */
export function openUrl(url: string): void {
  // Validate URL — only allow http and https protocols
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return;
  }

  const safeUrl = parsed.href;
  const platform = process.platform;

  try {
    if (platform === "win32") {
      // Escape cmd.exe metacharacters (& ^ | < >) with ^ prefix
      const escapedUrl = safeUrl.replace(/[&^|<>]/g, "^$&");
      execFile("cmd", ["/c", "start", "", escapedUrl], { windowsHide: true });
    } else if (platform === "darwin") {
      execFile("open", [safeUrl]);
    } else {
      execFile("xdg-open", [safeUrl]);
    }
  } catch {
    // Silently fail if the command cannot be executed
  }
}
