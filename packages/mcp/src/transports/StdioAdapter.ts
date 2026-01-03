// ============================================
// T016: Stdio Transport Adapter
// ============================================

import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { expandEnvironmentVariables } from "../env-expansion.js";
import { McpTransportError } from "../errors.js";
import type { McpStdioConfig } from "../types.js";

/**
 * Options for stdio transport creation.
 */
export interface StdioTransportOptions {
  /** Server name for error context */
  serverName: string;
  /** Handler for stderr output from the spawned process */
  onStderr?: (data: string) => void;
  /** Handler for process exit */
  onExit?: (code: number | null, signal: string | null) => void;
}

/**
 * Result from creating a stdio transport.
 */
export interface StdioTransportResult {
  /** The transport instance */
  transport: Transport;
  /** Close handler to clean up resources */
  close: () => Promise<void>;
}

/**
 * Creates an MCP transport for stdio-based (local process) servers.
 *
 * This spawns a child process and communicates via stdin/stdout.
 * Environment variables in the config are expanded before spawning.
 *
 * @param config - Stdio server configuration
 * @param options - Transport options including callbacks
 * @returns Transport instance ready for MCP client connection
 *
 * @example
 * ```typescript
 * const { transport } = await createStdioTransport(
 *   { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] },
 *   { serverName: "filesystem", onStderr: (data) => console.error(data) }
 * );
 * ```
 */
export async function createStdioTransport(
  config: McpStdioConfig,
  options: StdioTransportOptions
): Promise<StdioTransportResult> {
  const { serverName, onStderr, onExit } = options;

  try {
    // Expand environment variables in the config
    const expandedEnv = config.env
      ? Object.fromEntries(
          Object.entries(config.env).map(([key, value]) => [key, expandEnvironmentVariables(value)])
        )
      : undefined;

    // Merge with current process environment (filter out undefined values)
    const filteredProcessEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        filteredProcessEnv[key] = value;
      }
    }

    const env: Record<string, string> = {
      ...filteredProcessEnv,
      ...expandedEnv,
    };

    // Create the stdio transport
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      env,
      stderr: "pipe", // Capture stderr for logging
    });

    // Set up stderr handler if provided
    if (onStderr) {
      // The StdioClientTransport exposes stderr through the process
      // We need to access it after start() is called
      const originalStart = transport.start.bind(transport);
      transport.start = async () => {
        await originalStart();

        // Access the underlying process stderr
        // @ts-expect-error - Accessing internal property for stderr handling
        const proc = transport._process;
        if (proc?.stderr) {
          proc.stderr.on("data", (data: Buffer) => {
            onStderr(data.toString());
          });
        }
      };
    }

    // Set up exit handler if provided
    if (onExit) {
      // @ts-expect-error - Accessing internal property for exit handling
      const proc = transport._process;
      if (proc) {
        proc.on("exit", (code: number | null, signal: string | null) => {
          onExit(code, signal);
        });
      }
    }

    const close = async () => {
      try {
        await transport.close();
      } catch {
        // Ignore close errors
      }
    };

    return { transport, close };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error spawning process";
    throw new McpTransportError(message, serverName, "stdio", {
      cause: error instanceof Error ? error : undefined,
      context: {
        command: config.command,
        args: config.args,
        cwd: config.cwd,
      },
    });
  }
}

/**
 * Validates stdio configuration before transport creation.
 *
 * @param config - Configuration to validate
 * @returns Array of validation error messages, empty if valid
 */
export function validateStdioConfig(config: McpStdioConfig): string[] {
  const errors: string[] = [];

  if (!config.command || typeof config.command !== "string") {
    errors.push("Command is required and must be a string");
  }

  if (config.args !== undefined && !Array.isArray(config.args)) {
    errors.push("Args must be an array of strings");
  } else if (Array.isArray(config.args) && !config.args.every((arg) => typeof arg === "string")) {
    errors.push("All args must be strings");
  }

  if (config.cwd !== undefined && typeof config.cwd !== "string") {
    errors.push("Cwd must be a string");
  }

  if (config.env !== undefined && (typeof config.env !== "object" || config.env === null)) {
    errors.push("Env must be an object");
  }

  return errors;
}
