/**
 * Dangerous command detector.
 *
 * Provides lightweight pattern matching to flag high-risk shell commands.
 */

export type DangerSeverity = "low" | "medium" | "high" | "critical";

export interface DangerPattern {
  name: string;
  description: string;
  severity: DangerSeverity;
  pattern: RegExp;
}

export interface DetectionMatch {
  pattern: DangerPattern;
  match: string;
  position: number;
}

export interface DetectionResult {
  dangerous: boolean;
  matches: DetectionMatch[];
  command: string;
}

const DEFAULT_PATTERNS: DangerPattern[] = [
  {
    name: "rm-root",
    description: "Destructive delete on root or system paths",
    severity: "critical",
    pattern: /\brm\s+-rf\s+\/(\s|$)/i,
  },
  {
    name: "rm-recursive",
    description: "Recursive delete",
    severity: "high",
    pattern: /\brm\s+-rf\b/i,
  },
  {
    name: "sudo",
    description: "Privilege escalation via sudo",
    severity: "high",
    pattern: /\bsudo\b/i,
  },
  {
    name: "shell-download-exec",
    description: "Download and execute pipeline",
    severity: "high",
    pattern: /\b(curl|wget)\b.+\|\s*(bash|sh)\b/i,
  },
  {
    name: "netcat-shell",
    description: "Potential reverse shell via netcat",
    severity: "critical",
    pattern: /\bnc\s+-e\b/i,
  },
];

/**
 * DangerousCommandDetector scans a command string for risky patterns.
 */
export class DangerousCommandDetector {
  private readonly patterns: DangerPattern[];

  constructor(patterns: DangerPattern[] = DEFAULT_PATTERNS) {
    this.patterns = patterns;
  }

  detect(command: string): DetectionResult {
    const matches: DetectionMatch[] = [];

    for (const pattern of this.patterns) {
      const match = command.match(pattern.pattern);
      if (match?.[0]) {
        matches.push({
          pattern,
          match: match[0],
          position: command.indexOf(match[0]),
        });
      }
    }

    return {
      dangerous: matches.length > 0,
      matches,
      command,
    };
  }
}

/**
 * Convenience helper to detect dangerous commands.
 */
export function isCommandDangerous(command: string): boolean {
  const detector = new DangerousCommandDetector();
  return detector.detect(command).dangerous;
}
