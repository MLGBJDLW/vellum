import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import type { LspServerConfig } from "./config.js";
import { InstallFailedError } from "./errors.js";
import type { AutoInstallMode } from "./types.js";

export interface InstallerConfig {
  npmRegistry: string;
  pipIndexUrl: string;
  timeoutMs: number;
  autoInstall: AutoInstallMode;
}

export interface InstallProgress {
  server: string;
  status: "pending" | "running" | "success" | "failed";
  progress: number;
  message: string;
  error?: Error;
}

export class ServerInstaller extends EventEmitter {
  private config: InstallerConfig;

  constructor(config: Partial<InstallerConfig> = {}) {
    super();
    this.config = {
      npmRegistry: config.npmRegistry ?? "https://registry.npmjs.org",
      pipIndexUrl: config.pipIndexUrl ?? "https://pypi.org/simple",
      timeoutMs: config.timeoutMs ?? 120_000,
      autoInstall: config.autoInstall ?? "prompt",
    };
  }

  async install(serverId: string, config: LspServerConfig): Promise<void> {
    if (!config.install) {
      throw new InstallFailedError(serverId, "manual", config.command);
    }

    const { command, args } = this.buildCommand(config.install.method, config.install.package, {
      args: config.install.args,
    });

    this.emitProgress(serverId, "running", 10, `Installing via ${config.install.method}...`);

    try {
      await this.run(command, args);
      this.emitProgress(serverId, "success", 100, "Install complete");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitProgress(serverId, "failed", 100, err.message, err);
      throw new InstallFailedError(serverId, config.install.method, config.install.package, err);
    }
  }

  private buildCommand(
    method: "npm" | "pip" | "cargo" | "system",
    pkg: string,
    options?: { args?: string[] }
  ): { command: string; args: string[] } {
    const extraArgs = options?.args ?? [];

    switch (method) {
      case "npm":
        return {
          command: "npm",
          args: ["install", "-g", pkg, "--registry", this.config.npmRegistry, ...extraArgs],
        };
      case "pip":
        return {
          command: "pip",
          args: ["install", pkg, "--index-url", this.config.pipIndexUrl, ...extraArgs],
        };
      case "cargo":
        return {
          command: "cargo",
          args: ["install", pkg, ...extraArgs],
        };
      default:
        return {
          command: pkg,
          args: extraArgs,
        };
    }
  }

  private run(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: "inherit",
        cwd: process.cwd(),
        shell: process.platform === "win32",
      });

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error(`Installation timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Installation failed with code ${code}`));
        }
      });

      proc.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private emitProgress(
    server: string,
    status: InstallProgress["status"],
    progress: number,
    message: string,
    error?: Error
  ): void {
    this.emit("progress", {
      server,
      status,
      progress,
      message,
      error,
    } satisfies InstallProgress);
  }
}
