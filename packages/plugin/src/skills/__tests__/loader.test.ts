/**
 * Unit tests for Skill Loader (T037)
 *
 * Tests SKILL.md parsing, subdirectory scanning, and missing SKILL.md handling.
 *
 * @module plugin/skills/__tests__/loader.test
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  extractFirstParagraph,
  extractNameFromDir,
  loadAllSkills,
  loadSkill,
  SkillLoadError,
} from "../loader.js";

// =============================================================================
// Test Constants
// =============================================================================

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures");

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a temporary directory for testing
 */
async function createTempDir(): Promise<string> {
  const tmpDir = path.join(
    FIXTURES_DIR,
    `temp-skills-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Removes a directory recursively
 */
async function removeTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore errors on cleanup
  }
}

/**
 * Creates a SKILL.md file with optional frontmatter and body
 */
async function createSkillFile(
  dir: string,
  frontmatter?: Record<string, unknown>,
  body?: string
): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "SKILL.md");

  let content = "";
  if (frontmatter) {
    content += "---\n";
    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) {
        content += `${key}:\n`;
        for (const item of value) {
          content += `  - ${item}\n`;
        }
      } else {
        content += `${key}: ${value}\n`;
      }
    }
    content += "---\n\n";
  }
  if (body) {
    content += body;
  }

  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

/**
 * Creates a script file in the scripts/ subdirectory
 */
async function createScriptFile(skillDir: string, filename: string): Promise<string> {
  const scriptsDir = path.join(skillDir, "scripts");
  await fs.mkdir(scriptsDir, { recursive: true });
  const filePath = path.join(scriptsDir, filename);
  await fs.writeFile(filePath, `# Script: ${filename}`, "utf-8");
  return filePath;
}

/**
 * Creates a reference file in the references/ subdirectory
 */
async function createReferenceFile(skillDir: string, filename: string): Promise<string> {
  const referencesDir = path.join(skillDir, "references");
  await fs.mkdir(referencesDir, { recursive: true });
  const filePath = path.join(referencesDir, filename);
  await fs.writeFile(filePath, `# Reference: ${filename}`, "utf-8");
  return filePath;
}

/**
 * Creates an example file in the examples/ subdirectory
 */
async function createExampleFile(skillDir: string, filename: string): Promise<string> {
  const examplesDir = path.join(skillDir, "examples");
  await fs.mkdir(examplesDir, { recursive: true });
  const filePath = path.join(examplesDir, filename);
  await fs.writeFile(filePath, `// Example: ${filename}`, "utf-8");
  return filePath;
}

// =============================================================================
// Helper Function Tests
// =============================================================================

describe("extractNameFromDir", () => {
  it("should extract the directory name from a path", () => {
    expect(extractNameFromDir("/path/to/python-testing")).toBe("python-testing");
    expect(extractNameFromDir("/skills/react-patterns")).toBe("react-patterns");
    expect(extractNameFromDir("simple")).toBe("simple");
  });

  it("should handle Windows-style paths", () => {
    expect(extractNameFromDir("C:\\skills\\typescript-patterns")).toBe("typescript-patterns");
  });
});

describe("extractFirstParagraph", () => {
  it("should extract the first paragraph after a heading", () => {
    const content = `# Skill Title

This is the description paragraph.

More content follows.`;
    expect(extractFirstParagraph(content)).toBe("This is the description paragraph.");
  });

  it("should skip multiple headings", () => {
    const content = `# Main Title
## Subtitle
### Sub-subtitle

Finally, the actual description.

More text.`;
    expect(extractFirstParagraph(content)).toBe("Finally, the actual description.");
  });

  it("should handle multi-line paragraphs", () => {
    const content = `# Title

This is a multi-line
description that spans
several lines.

Next paragraph.`;
    expect(extractFirstParagraph(content)).toBe(
      "This is a multi-line description that spans several lines."
    );
  });

  it("should skip horizontal rules", () => {
    // Note: extractFirstParagraph only handles body content (after frontmatter)
    // The frontmatter parser handles the --- markers separately
    const content = `# Title

---

The actual description after hr.

More text.`;
    expect(extractFirstParagraph(content)).toBe("The actual description after hr.");
  });

  it("should return empty string for content with only headings", () => {
    const content = `# Title
## Subtitle
### Another`;
    expect(extractFirstParagraph(content)).toBe("");
  });

  it("should handle empty content", () => {
    expect(extractFirstParagraph("")).toBe("");
    expect(extractFirstParagraph("   \n\n   ")).toBe("");
  });
});

// =============================================================================
// SKILL.md Parsing Tests
// =============================================================================

describe("loadSkill", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  describe("SKILL.md parsing", () => {
    it("should parse skill with full frontmatter", async () => {
      const skillDir = path.join(tempDir, "python-testing");
      await createSkillFile(
        skillDir,
        {
          name: "python-testing",
          description: "Best practices for Python unit testing",
          tags: ["python", "testing", "pytest"],
        },
        "# Python Testing\n\nThis skill provides patterns for testing."
      );

      const skill = await loadSkill(skillDir, "test-plugin");

      expect(skill.name).toBe("python-testing");
      expect(skill.description).toBe("Best practices for Python unit testing");
      expect(skill.filePath).toBe(path.join(skillDir, "SKILL.md"));
    });

    it("should use directory name when name not in frontmatter", async () => {
      const skillDir = path.join(tempDir, "inferred-name-skill");
      await createSkillFile(
        skillDir,
        { description: "A skill with inferred name" },
        "# Skill Content"
      );

      const skill = await loadSkill(skillDir, "test-plugin");

      expect(skill.name).toBe("inferred-name-skill");
    });

    it("should extract description from body when not in frontmatter", async () => {
      const skillDir = path.join(tempDir, "body-description-skill");
      await createSkillFile(
        skillDir,
        {},
        "# Skill Title\n\nThis description comes from the body.\n\nMore content."
      );

      const skill = await loadSkill(skillDir, "test-plugin");

      expect(skill.description).toBe("This description comes from the body.");
    });

    it("should handle skill without frontmatter", async () => {
      const skillDir = path.join(tempDir, "no-frontmatter-skill");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, "SKILL.md"),
        "# My Skill\n\nDescription from body only.\n\nDetails follow.",
        "utf-8"
      );

      const skill = await loadSkill(skillDir, "test-plugin");

      expect(skill.name).toBe("no-frontmatter-skill");
      expect(skill.description).toBe("Description from body only.");
    });

    it("should throw error for skill without description", async () => {
      const skillDir = path.join(tempDir, "no-description-skill");
      await createSkillFile(skillDir, {}, "# Just a Title\n## Subheading\n### Another");

      await expect(loadSkill(skillDir, "test-plugin")).rejects.toThrow(SkillLoadError);
      await expect(loadSkill(skillDir, "test-plugin")).rejects.toThrow(/must have a description/);
    });

    it("should throw SkillLoadError for missing SKILL.md", async () => {
      const skillDir = path.join(tempDir, "missing-skill");
      await fs.mkdir(skillDir, { recursive: true });

      await expect(loadSkill(skillDir, "test-plugin")).rejects.toThrow(SkillLoadError);
      await expect(loadSkill(skillDir, "test-plugin")).rejects.toThrow(/SKILL\.md not found/);
    });

    it("should throw SkillLoadError for non-existent directory", async () => {
      const nonExistentDir = path.join(tempDir, "non-existent");

      await expect(loadSkill(nonExistentDir, "test-plugin")).rejects.toThrow(SkillLoadError);
      await expect(loadSkill(nonExistentDir, "test-plugin")).rejects.toThrow(/does not exist/);
    });

    it("should include skill name and path in SkillLoadError", async () => {
      const skillDir = path.join(tempDir, "error-info-skill");
      await fs.mkdir(skillDir, { recursive: true });

      try {
        await loadSkill(skillDir, "test-plugin");
        expect.fail("Should have thrown SkillLoadError");
      } catch (error) {
        expect(error).toBeInstanceOf(SkillLoadError);
        const skillError = error as SkillLoadError;
        expect(skillError.skillName).toBe("error-info-skill");
        expect(skillError.skillPath).toBe(skillDir);
      }
    });
  });

  describe("subdirectory scanning", () => {
    it("should find scripts in scripts/ directory", async () => {
      const skillDir = path.join(tempDir, "with-scripts");
      await createSkillFile(
        skillDir,
        { description: "Skill with scripts" },
        "# Skill with scripts"
      );
      await createScriptFile(skillDir, "setup.py");
      await createScriptFile(skillDir, "validate.sh");
      await createScriptFile(skillDir, "helper.js");

      const skill = await loadSkill(skillDir, "test-plugin");

      expect(skill.scripts).toBeDefined();
      expect(skill.scripts).toHaveLength(3);
      expect(skill.scripts?.map((s) => path.basename(s)).sort()).toEqual([
        "helper.js",
        "setup.py",
        "validate.sh",
      ]);
    });

    it("should only include valid script extensions (.py, .sh, .js)", async () => {
      const skillDir = path.join(tempDir, "mixed-scripts");
      await createSkillFile(skillDir, { description: "Skill with mixed files" }, "# Mixed content");

      // Valid scripts
      await createScriptFile(skillDir, "valid.py");
      await createScriptFile(skillDir, "valid.sh");
      await createScriptFile(skillDir, "valid.js");

      // Invalid extensions (should be ignored)
      const scriptsDir = path.join(skillDir, "scripts");
      await fs.writeFile(path.join(scriptsDir, "readme.md"), "# Readme");
      await fs.writeFile(path.join(scriptsDir, "config.json"), "{}");
      await fs.writeFile(path.join(scriptsDir, "data.txt"), "data");

      const skill = await loadSkill(skillDir, "test-plugin");

      expect(skill.scripts).toHaveLength(3);
    });

    it("should find references in references/ directory", async () => {
      const skillDir = path.join(tempDir, "with-references");
      await createSkillFile(
        skillDir,
        { description: "Skill with references" },
        "# References skill"
      );
      await createReferenceFile(skillDir, "guide.md");
      await createReferenceFile(skillDir, "best-practices.md");

      const skill = await loadSkill(skillDir, "test-plugin");

      expect(skill.references).toBeDefined();
      expect(skill.references).toHaveLength(2);
      expect(skill.references?.map((r) => path.basename(r)).sort()).toEqual([
        "best-practices.md",
        "guide.md",
      ]);
    });

    it("should only include .md files in references", async () => {
      const skillDir = path.join(tempDir, "mixed-references");
      await createSkillFile(skillDir, { description: "Mixed references" }, "# Mixed refs");
      await createReferenceFile(skillDir, "valid.md");

      // Invalid files in references
      const refsDir = path.join(skillDir, "references");
      await fs.writeFile(path.join(refsDir, "image.png"), "fake-image");
      await fs.writeFile(path.join(refsDir, "data.json"), "{}");

      const skill = await loadSkill(skillDir, "test-plugin");

      expect(skill.references).toHaveLength(1);
      expect(skill.references?.[0]).toContain("valid.md");
    });

    it("should find all files in examples/ directory", async () => {
      const skillDir = path.join(tempDir, "with-examples");
      await createSkillFile(skillDir, { description: "Skill with examples" }, "# Examples skill");
      await createExampleFile(skillDir, "basic.ts");
      await createExampleFile(skillDir, "advanced.py");
      await createExampleFile(skillDir, "config.json");

      const skill = await loadSkill(skillDir, "test-plugin");

      expect(skill.examples).toBeDefined();
      expect(skill.examples).toHaveLength(3);
    });

    it("should not include empty arrays for missing subdirectories", async () => {
      const skillDir = path.join(tempDir, "no-subdirs");
      await createSkillFile(
        skillDir,
        { description: "Skill without subdirectories" },
        "# Simple skill"
      );

      const skill = await loadSkill(skillDir, "test-plugin");

      expect(skill.scripts).toBeUndefined();
      expect(skill.references).toBeUndefined();
      expect(skill.examples).toBeUndefined();
    });

    it("should handle all subdirectories together", async () => {
      const skillDir = path.join(tempDir, "full-skill");
      await createSkillFile(
        skillDir,
        { description: "Complete skill with all resources" },
        "# Complete Skill"
      );
      await createScriptFile(skillDir, "run.py");
      await createReferenceFile(skillDir, "docs.md");
      await createExampleFile(skillDir, "sample.ts");

      const skill = await loadSkill(skillDir, "test-plugin");

      expect(skill.scripts).toHaveLength(1);
      expect(skill.references).toHaveLength(1);
      expect(skill.examples).toHaveLength(1);
    });
  });
});

// =============================================================================
// loadAllSkills Tests
// =============================================================================

describe("loadAllSkills", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it("should load all skills from a directory", async () => {
    // Create multiple skills
    const skill1Dir = path.join(tempDir, "skill-one");
    const skill2Dir = path.join(tempDir, "skill-two");
    const skill3Dir = path.join(tempDir, "skill-three");

    await createSkillFile(skill1Dir, { description: "First skill" }, "# Skill One");
    await createSkillFile(skill2Dir, { description: "Second skill" }, "# Skill Two");
    await createSkillFile(skill3Dir, { description: "Third skill" }, "# Skill Three");

    const skills = await loadAllSkills(tempDir, "test-plugin");

    expect(skills).toHaveLength(3);
    expect(skills.map((s) => s.name).sort()).toEqual(["skill-one", "skill-three", "skill-two"]);
  });

  it("should skip directories without SKILL.md", async () => {
    // Valid skill
    const validSkillDir = path.join(tempDir, "valid-skill");
    await createSkillFile(validSkillDir, { description: "Valid skill" }, "# Valid");

    // Directory without SKILL.md
    const noSkillDir = path.join(tempDir, "not-a-skill");
    await fs.mkdir(noSkillDir, { recursive: true });
    await fs.writeFile(path.join(noSkillDir, "README.md"), "# Not a skill");

    // Another directory with only subdirectories
    const emptyDir = path.join(tempDir, "empty-dir");
    await fs.mkdir(emptyDir, { recursive: true });

    const skills = await loadAllSkills(tempDir, "test-plugin");

    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("valid-skill");
  });

  it("should return empty array for non-existent directory", async () => {
    const nonExistentDir = path.join(tempDir, "does-not-exist");

    const skills = await loadAllSkills(nonExistentDir, "test-plugin");

    expect(skills).toEqual([]);
  });

  it("should return empty array for empty directory", async () => {
    const skills = await loadAllSkills(tempDir, "test-plugin");

    expect(skills).toEqual([]);
  });

  it("should skip files (non-directories) in skills directory", async () => {
    // Valid skill directory
    const skillDir = path.join(tempDir, "real-skill");
    await createSkillFile(skillDir, { description: "Real skill" }, "# Real");

    // File at root level (not a directory)
    await fs.writeFile(path.join(tempDir, "not-a-directory.md"), "# File");

    const skills = await loadAllSkills(tempDir, "test-plugin");

    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("real-skill");
  });

  it("should skip skills with invalid SKILL.md content", async () => {
    // Valid skill
    const validDir = path.join(tempDir, "valid");
    await createSkillFile(validDir, { description: "Valid" }, "# Valid");

    // Invalid skill (no description)
    const invalidDir = path.join(tempDir, "invalid");
    await createSkillFile(invalidDir, {}, "# Only Title\n## Subheading");

    const skills = await loadAllSkills(tempDir, "test-plugin");

    // Only the valid skill should be loaded
    // Note: loadAllSkills catches errors and skips invalid skills
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("valid");
  });
});
