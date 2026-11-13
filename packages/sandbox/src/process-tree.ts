import { spawn } from "node:child_process";
import { win32 } from "node:path";

/** Terminate a detached Unix process group or a Windows process and its descendants. */
export async function killProcessTree(
  pid: number,
  options: { timeout?: number } = {}
): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) return;
  const timeout = options.timeout ?? 5000;
  if (process.platform === "win32") {
    // Do not block the agent event loop while Windows walks the process tree.
    await new Promise<void>((resolve, reject) => {
      const taskkill = win32.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "taskkill.exe"
      );
      const failed = (error: Error) => {
        try {
          process.kill(pid, 0);
        } catch (probeError) {
          if ((probeError as NodeJS.ErrnoException).code === "ESRCH") {
            resolve();
            return;
          }
        }
        reject(error);
      };
      const killer = spawn(taskkill, ["/pid", String(pid), "/f", "/t"], {
        stdio: "ignore",
        windowsHide: true,
        timeout: 5000,
      });
      killer.once("error", failed);
      killer.once("close", (code) => {
        if (code === 0) resolve();
        else failed(new Error(`taskkill exited with code ${code}`));
      });
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
