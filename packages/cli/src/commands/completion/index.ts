/**
 * Shell Completion Generator (T-047)
 *
 * Generates shell completion scripts for various shells.
 * Supports: bash, zsh, fish, powershell
 *
 * @module cli/commands/completion
 */

import type { CommandRegistry } from "../registry.js";
import type { SlashCommand } from "../types.js";

// =============================================================================
// Interfaces
// =============================================================================

/**
 * Shell completion generator interface
 *
 * Implementations generate shell-specific completion scripts.
 */
export interface CompletionGenerator {
  /** Shell name for identification */
  readonly shell: ShellType;

  /**
   * Generate completion script
   *
   * @param commands - Available commands to complete
   * @param programName - CLI program name (e.g., 'vellum')
   * @returns Shell script as string
   */
  generate(commands: readonly SlashCommand[], programName: string): string;
}

/**
 * Supported shell types
 */
export type ShellType = "bash" | "zsh" | "fish" | "powershell";

/**
 * Completion generation options
 */
export interface CompletionOptions {
  /** CLI program name */
  programName: string;
  /** Target shell */
  shell: ShellType;
  /** Include command descriptions in completions */
  includeDescriptions?: boolean;
}

// =============================================================================
// Bash Completion Generator
// =============================================================================

/**
 * Generates Bash completion script
 */
export class BashCompletionGenerator implements CompletionGenerator {
  readonly shell: ShellType = "bash";

  generate(commands: readonly SlashCommand[], programName: string): string {
    const commandNames = commands.map((c) => c.name).join(" ");
    const commandCompletions = commands
      .map((c) => {
        const flags = (c.namedArgs ?? []).map((a) => `--${a.name}`).join(" ");
        return flags
          ? `      ${c.name}) COMPREPLY=( $(compgen -W "${flags}" -- "\${cur}") );;`
          : "";
      })
      .filter(Boolean)
      .join("\n");

    return `# Bash completion for ${programName}
# Add to ~/.bashrc: source <(${programName} completion bash)

_${programName}_completions() {
  local cur prev commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${commandNames}"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    # Complete command names (with / prefix)
    if [[ \${cur} == /* ]]; then
      COMPREPLY=( $(compgen -P "/" -W "\${commands}" -- "\${cur#/}") )
    else
      COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
    fi
    return 0
  fi

  # Complete command-specific flags
  case "\${COMP_WORDS[1]#/}" in
${commandCompletions}
    *);;
  esac

  return 0
}

complete -F _${programName}_completions ${programName}
`;
  }
}

// =============================================================================
// Zsh Completion Generator
// =============================================================================

/**
 * Generates Zsh completion script
 */
export class ZshCompletionGenerator implements CompletionGenerator {
  readonly shell: ShellType = "zsh";

  generate(commands: readonly SlashCommand[], programName: string): string {
    const commandCompletions = commands
      .map((c) => `      '/${c.name}:${this.escapeDescription(c.description)}'`)
      .join(" \\\n");

    const subcommandCompletions = commands
      .filter((c) => c.namedArgs && c.namedArgs.length > 0)
      .map((c) => {
        const flags = (c.namedArgs ?? [])
          .map((a) => {
            const desc = this.escapeDescription(a.description);
            return `        '--${a.name}[${desc}]'`;
          })
          .join(" \\\n");
        return `    ${c.name})\n      _arguments \\\n${flags}\n      ;;`;
      })
      .join("\n");

    return `#compdef ${programName}
# Zsh completion for ${programName}
# Add to fpath or source directly

_${programName}() {
  local -a commands
  commands=(
${commandCompletions}
  )

  _arguments -C \\
    '1: :->command' \\
    '*: :->args'

  case $state in
    command)
      _describe 'commands' commands
      ;;
    args)
      case \${words[2]#/} in
${subcommandCompletions}
      esac
      ;;
  esac
}

_${programName} "$@"
`;
  }

  private escapeDescription(desc: string): string {
    return desc.replace(/'/g, "'\\''").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  }
}

// =============================================================================
// Fish Completion Generator
// =============================================================================

/**
 * Generates Fish shell completion script
 */
export class FishCompletionGenerator implements CompletionGenerator {
  readonly shell: ShellType = "fish";

  generate(commands: readonly SlashCommand[], programName: string): string {
    const commandCompletions = commands
      .map(
        (c) =>
          `complete -c ${programName} -n "__fish_use_subcommand" -a "/${c.name}" -d '${this.escapeDescription(c.description)}'`
      )
      .join("\n");

    const flagCompletions = commands
      .filter((c) => c.namedArgs && c.namedArgs.length > 0)
      .flatMap((c) =>
        (c.namedArgs ?? []).map(
          (a) =>
            `complete -c ${programName} -n "__fish_seen_subcommand_from /${c.name}" -l ${a.name} -d '${this.escapeDescription(a.description)}'`
        )
      )
      .join("\n");

    return `# Fish completion for ${programName}
# Save to ~/.config/fish/completions/${programName}.fish

# Disable file completions for command position
complete -c ${programName} -f

# Command completions
${commandCompletions}

# Flag completions
${flagCompletions}
`;
  }

  private escapeDescription(desc: string): string {
    return desc.replace(/'/g, "\\'");
  }
}

// =============================================================================
// PowerShell Completion Generator
// =============================================================================

/**
 * Generates PowerShell completion script
 */
export class PowerShellCompletionGenerator implements CompletionGenerator {
  readonly shell: ShellType = "powershell";

  generate(commands: readonly SlashCommand[], programName: string): string {
    const commandCompletions = commands
      .map(
        (c) =>
          `        @{ Command = '/${c.name}'; Description = '${this.escapeDescription(c.description)}'; Flags = @(${this.formatFlags(c)}) }`
      )
      .join("\n");

    return `# PowerShell completion for ${programName}
# Add to $PROFILE: . <(${programName} completion powershell)

$${programName}Commands = @(
${commandCompletions}
)

Register-ArgumentCompleter -Native -CommandName ${programName} -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    
    $commands = $${programName}Commands
    
    # Get current command state
    $elements = $commandAst.CommandElements
    $command = $null
    
    if ($elements.Count -gt 1) {
        $command = $elements[1].ToString()
    }
    
    if (-not $command -or $wordToComplete -eq $command) {
        # Complete command names
        $commands | Where-Object {
            $_.Command -like "$wordToComplete*"
        } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new(
                $_.Command,
                $_.Command,
                'ParameterValue',
                $_.Description
            )
        }
    }
    else {
        # Complete flags for command
        $cmdInfo = $commands | Where-Object { $_.Command -eq $command }
        if ($cmdInfo) {
            $cmdInfo.Flags | Where-Object {
                $_ -like "$wordToComplete*"
            } | ForEach-Object {
                [System.Management.Automation.CompletionResult]::new(
                    $_,
                    $_,
                    'ParameterName',
                    $_
                )
            }
        }
    }
}
`;
  }

  private escapeDescription(desc: string): string {
    return desc.replace(/'/g, "''");
  }

  private formatFlags(command: SlashCommand): string {
    if (!command.namedArgs || command.namedArgs.length === 0) {
      return "";
    }
    return command.namedArgs.map((a) => `'--${a.name}'`).join(", ");
  }
}

// =============================================================================
// Completion Factory
// =============================================================================

/**
 * Registry of shell completion generators
 */
const GENERATORS: Record<ShellType, CompletionGenerator> = {
  bash: new BashCompletionGenerator(),
  zsh: new ZshCompletionGenerator(),
  fish: new FishCompletionGenerator(),
  powershell: new PowerShellCompletionGenerator(),
};

/**
 * Get available shell types
 */
export function getAvailableShells(): readonly ShellType[] {
  return Object.keys(GENERATORS) as ShellType[];
}

/**
 * Check if a shell type is supported
 */
export function isValidShell(shell: string): shell is ShellType {
  return shell in GENERATORS;
}

/**
 * Get a completion generator for a specific shell
 *
 * @param shell - Target shell type
 * @returns Completion generator for the shell
 * @throws Error if shell is not supported
 */
export function getGenerator(shell: ShellType): CompletionGenerator {
  const generator = GENERATORS[shell];
  if (!generator) {
    throw new Error(`Unsupported shell: ${shell}. Supported: ${getAvailableShells().join(", ")}`);
  }
  return generator;
}

/**
 * Generate completion script for a shell
 *
 * @param options - Completion options
 * @param registry - Command registry to get commands from
 * @returns Generated shell script
 */
export function generateCompletion(options: CompletionOptions, registry: CommandRegistry): string {
  const generator = getGenerator(options.shell);
  const commands = registry.list();
  return generator.generate(commands, options.programName);
}

/**
 * Generate completion script from a list of commands
 *
 * @param options - Completion options
 * @param commands - Commands to generate completions for
 * @returns Generated shell script
 */
export function generateCompletionFromCommands(
  options: CompletionOptions,
  commands: readonly SlashCommand[]
): string {
  const generator = getGenerator(options.shell);
  return generator.generate(commands, options.programName);
}
