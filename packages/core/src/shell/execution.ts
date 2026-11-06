import { existsSync } from "node:fs";
import { platform } from "node:os";
import { delimiter, join, win32 } from "node:path";

export interface ExecutionShell {
  shell: string;
  shellArgs: string[];
}

let cached: { key: string; value: ExecutionShell } | undefined;

/** Resolve the tool executor, independently of the terminal that launched Vellum. */
export function detectExecutionShell(): ExecutionShell {
  const os = platform();
  const searchPath = process.env.PATH ?? "";
  const key = JSON.stringify([
    os,
    searchPath,
    process.env.PWSH_PATH,
    process.env.BASH_PATH,
    process.env.SystemRoot,
  ]);
  if (cached?.key === key) {
    return { ...cached.value, shellArgs: [...cached.value.shellArgs] };
  }

  let value: ExecutionShell;
  if (os === "win32") {
    const pwsh = searchPath
      .split(";")
      .filter(Boolean)
      .map((directory) => win32.join(directory.replace(/^"|"$/g, ""), "pwsh.exe"))
      .find((candidate) => existsSync(candidate));
    const windowsPowerShell = win32.join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe"
    );
    value = {
      shell: process.env.PWSH_PATH || pwsh || windowsPowerShell,
      shellArgs: ["-NoProfile", "-NonInteractive", "-Command"],
    };
  } else {
    const bash = [
      "/bin/bash",
      ...searchPath
        .split(delimiter)
        .filter(Boolean)
        .map((directory) => join(directory, "bash")),
    ].find((candidate) => existsSync(candidate));
    value = { shell: process.env.BASH_PATH || bash || "/bin/sh", shellArgs: ["-c"] };
  }
  cached = { key, value };
  return { ...value, shellArgs: [...value.shellArgs] };
}
