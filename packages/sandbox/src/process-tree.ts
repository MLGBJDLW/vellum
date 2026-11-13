import { spawn } from "node:child_process";

/** Terminate a detached Unix process group or a Windows process and its descendants. */
export async function killProcessTree(
  pid: number,
  options: { timeout?: number } = {}
): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) return;
  const timeout = options.timeout ?? 5000;
  if (process.platform === "win32") {
    // Do not block the agent event loop while Windows walks the process tree.
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("error", () => resolve());
      killer.once("close", () => resolve());
    });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    return; // The process group may have already exited.
  }
  const deadline = Date.now() + timeout;
  await new Promise<void>((resolve) => {
    const check = () => {
      try {
        process.kill(-pid, 0);
      } catch {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // The last process may have exited between checking and signalling.
        }
        resolve();
        return;
      }
      setTimeout(check, Math.min(50, Math.max(1, deadline - Date.now())));
    };
    check();
  });
}
