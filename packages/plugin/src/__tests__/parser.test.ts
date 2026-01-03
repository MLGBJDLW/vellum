import { describe, expect, it } from "vitest";

import {
  extractFirstParagraph,
  extractNameFromPath,
  hasArgumentsVariable,
  parseCommand,
} from "../commands/parser.js";

describe("CommandParser", () => {
  describe("extractNameFromPath", () => {
    it("should extract name from simple filename", () => {
      expect(extractNameFromPath("review.md")).toBe("review");
    });

    it("should extract name from path with directories", () => {
      expect(extractNameFromPath("/plugins/core/commands/review.md")).toBe("review");
    });

    it("should handle case-insensitive .MD extension", () => {
      expect(extractNameFromPath("Review.MD")).toBe("Review");
    });

    it("should preserve hyphens in filename", () => {
      expect(extractNameFromPath("fix-bugs.md")).toBe("fix-bugs");
    });

    it("should preserve underscores in filename", () => {
      expect(extractNameFromPath("run_tests.md")).toBe("run_tests");
    });
  });

  describe("extractFirstParagraph", () => {
    it("should extract simple first paragraph", () => {
      const content = "This is the first paragraph.\n\nThis is the second.";
      expect(extractFirstParagraph(content)).toBe("This is the first paragraph.");
    });

    it("should skip leading heading", () => {
      const content = "# Title\n\nThis is the first paragraph.";
      expect(extractFirstParagraph(content)).toBe("This is the first paragraph.");
    });

    it("should skip multiple headings", () => {
      const content = "# Title\n## Subtitle\n\nFirst paragraph here.";
      expect(extractFirstParagraph(content)).toBe("First paragraph here.");
    });

    it("should handle multi-line paragraph", () => {
      const content = "First line of paragraph.\nSecond line of paragraph.";
      expect(extractFirstParagraph(content)).toBe(
        "First line of paragraph. Second line of paragraph."
      );
    });

    it("should stop at empty line", () => {
      const content = "First paragraph.\n\nSecond paragraph.";
      expect(extractFirstParagraph(content)).toBe("First paragraph.");
    });

    it("should skip horizontal rules", () => {
      const content = "---\n\nFirst paragraph after rule.";
      expect(extractFirstParagraph(content)).toBe("First paragraph after rule.");
    });

    it("should return empty string for empty content", () => {
      expect(extractFirstParagraph("")).toBe("");
    });

    it("should return empty string for only headings", () => {
      expect(extractFirstParagraph("# Title\n## Subtitle")).toBe("");
    });
  });

  describe("hasArgumentsVariable", () => {
    it("should detect $ARGUMENTS in content", () => {
      expect(hasArgumentsVariable("Review changes on $ARGUMENTS")).toBe(true);
    });

    it("should return false when $ARGUMENTS is not present", () => {
      expect(hasArgumentsVariable("Review all changes")).toBe(false);
    });

    it("should detect $ARGUMENTS anywhere in content", () => {
      expect(hasArgumentsVariable("Start\n$ARGUMENTS\nEnd")).toBe(true);
    });
  });

  describe("parseCommand", () => {
    it("should parse command with full frontmatter", () => {
      const content = `---
name: review
description: Review code changes
argument-hint: <branch-name>
allowed-tools:
  - git
  - read_file
---
Review the changes on branch $ARGUMENTS and provide feedback.
`;

      const command = parseCommand("/commands/review.md", content);

      expect(command.name).toBe("review");
      expect(command.description).toBe("Review code changes");
      expect(command.argumentHint).toBe("<branch-name>");
      expect(command.allowedTools).toEqual(["git", "read_file"]);
      expect(command.content).toContain("Review the changes on branch");
      expect(command.filePath).toBe("/commands/review.md");
      expect(command.hasArgumentsVariable).toBe(true);
    });

    it("should use filename as name fallback", () => {
      const content = `---
description: Test command
---
Body content here.
`;

      const command = parseCommand("/commands/my-command.md", content);

      expect(command.name).toBe("my-command");
      expect(command.description).toBe("Test command");
    });

    it("should use first paragraph as description fallback", () => {
      const content = `---
name: test
---
# Header

This is the first paragraph description.

More content here.
`;

      const command = parseCommand("/commands/test.md", content);

      expect(command.name).toBe("test");
      expect(command.description).toBe("This is the first paragraph description.");
    });

    it("should use name as description fallback when no first paragraph", () => {
      const content = `---
name: empty-cmd
---
`;

      const command = parseCommand("/commands/empty.md", content);

      expect(command.name).toBe("empty-cmd");
      expect(command.description).toBe("empty-cmd");
    });

    it("should parse content without frontmatter", () => {
      const content = "# Simple Command\n\nJust do the thing with $ARGUMENTS.";

      const command = parseCommand("/commands/simple.md", content);

      expect(command.name).toBe("simple");
      expect(command.description).toBe("Just do the thing with $ARGUMENTS.");
      expect(command.content).toBe(content);
      expect(command.hasArgumentsVariable).toBe(true);
    });

    it("should handle empty frontmatter", () => {
      const content = `---
---
Command body here.
`;

      const command = parseCommand("/commands/empty-fm.md", content);

      expect(command.name).toBe("empty-fm");
      expect(command.description).toBe("Command body here.");
    });

    it("should not include argumentHint if not specified", () => {
      const content = `---
name: simple
description: Simple command
---
Body.
`;

      const command = parseCommand("/commands/simple.md", content);

      expect(command.argumentHint).toBeUndefined();
    });

    it("should not include allowedTools if not specified", () => {
      const content = `---
name: simple
description: Simple command
---
Body.
`;

      const command = parseCommand("/commands/simple.md", content);

      expect(command.allowedTools).toBeUndefined();
    });

    it("should detect hasArgumentsVariable as false when not present", () => {
      const content = `---
name: no-args
description: No arguments command
---
This command takes no arguments.
`;

      const command = parseCommand("/commands/no-args.md", content);

      expect(command.hasArgumentsVariable).toBe(false);
    });

    it("should handle malformed YAML gracefully", () => {
      const content = `---
name: test
invalid yaml [
---
Body content here.
`;

      // Should not throw, uses fallbacks
      const command = parseCommand("/commands/test.md", content);

      expect(command.name).toBe("test");
      expect(command.filePath).toBe("/commands/test.md");
    });
  });
});
