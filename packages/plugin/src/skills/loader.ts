/**
 * Skill Loader for Plugin Skills
 *
 * Loads and parses skill definitions from SKILL.md files.
 * Scans subdirectories for scripts, references, and examples.
 *
 * @module plugin/skills/loader
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { FrontmatterParser } from "@vellum/shared";
import { z } from "zod";

import type { PluginSkill } from "../types.js";

// =============================================================================
// Constants
// =============================================================================

/** Standard filename for skill definitions */
const SKILL_FILENAME = "SKILL.md";

/** Script file extensions to include */
const SCRIPT_EXTENSIONS = new Set([".py", ".sh", ".js"]);

/** Reference file extensions to include */
const REFERENCE_EXTENSIONS = new Set([".md"]);

// =============================================================================
// Frontmatter Schema
// =============================================================================

/**
 * Schema for skill frontmatter validation.
 *
 * @example
 * ```yaml
 * ---
 * name: python-testing
 * description: Best practices for Python testing
 * tags: [python, testing]
 * ---
 * ```
 */
const SkillFrontmatterSchema = z.object({
  /** Skill name (optional - falls back to directory name) */
  name: z.string().min(1).optional(),

  /** Skill description (required) */
  description: z.string().min(1).optional(),

  /** Optional tags for categorization */
  tags: z.array(z.string()).optional(),
});

const frontmatterParser = new FrontmatterParser(SkillFrontmatterSchema, {
  allowEmptyFrontmatter: true,
});

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when skill loading fails.
 */
export class SkillLoadError extends Error {
  /** Name of the skill that failed to load */
  public readonly skillName: string;

  /** Root path of the skill directory */
  public readonly skillPath: string;

  /** Original error that caused this error, if any */
  public readonly cause?: Error;

  constructor(message: string, skillName: string, skillPath: string, cause?: Error) {
    super(message);
    this.name = "SkillLoadError";
    this.skillName = skillName;
    this.skillPath = skillPath;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SkillLoadError);
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extracts the skill name from a directory path.
 *
 * @param dirPath - Path to the skill directory
 * @returns The directory name to use as skill name
 *
 * @example
 * ```typescript
 * extractNameFromDir("/skills/python-testing"); // "python-testing"
 * ```
 */
export function extractNameFromDir(dirPath: string): string {
  return path.basename(dirPath);
}

/**
 * Extracts the first paragraph from markdown content.
 *
 * Used as a fallback for skill description when not specified in frontmatter.
 * Skips leading headings and returns the first non-empty text paragraph.
 *
 * @param content - Markdown content to extract from
 * @returns First paragraph text or empty string if none found
 *
 * @example
 * ```typescript
 * extractFirstParagraph("# Skill Title\n\nThis is the description.\n\nMore text.");
 * // Returns: "This is the description."
 * ```
 */
export function extractFirstParagraph(content: string): string {
  const lines = content.split("\n");
  const paragraphLines: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines before finding content
    if (!inParagraph && trimmed === "") {
      continue;
    }

    // Skip headings
    if (trimmed.startsWith("#")) {
      if (inParagraph) {
        break;
      }
      continue;
    }

    // Skip horizontal rules
    if (/^[-*_]{3,}$/.test(trimmed)) {
      if (inParagraph) {
        break;
      }
      continue;
    }

    // Found content
    if (trimmed !== "") {
      inParagraph = true;
      paragraphLines.push(trimmed);
    } else if (inParagraph) {
      break;
    }
  }

  return paragraphLines.join(" ");
}

/**
 * Checks if a path is a directory.
 *
 * @param dirPath - Path to check
 * @returns True if path is a directory
 */
async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Lists files in a directory with specific extensions.
 *
 * @param dirPath - Directory path to scan
 * @param extensions - Set of allowed file extensions (with dot)
 * @returns Array of absolute file paths
 */
async function listFilesWithExtensions(
  dirPath: string,
  extensions: Set<string>
): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.has(ext)) {
          files.push(path.join(dirPath, entry.name));
        }
      }
    }

    return files.sort();
  } catch {
    return [];
  }
}

/**
 * Lists all files in a directory.
 *
 * @param dirPath - Directory path to scan
 * @returns Array of absolute file paths
 */
async function listAllFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        files.push(path.join(dirPath, entry.name));
      }
    }

    return files.sort();
  } catch {
    return [];
  }
}

/**
 * Scans skill subdirectories for associated files.
 *
 * @param skillDir - Root directory of the skill
 * @returns Object containing arrays of scripts, references, and examples paths
 */
async function scanSubdirectories(skillDir: string): Promise<{
  scripts: string[];
  references: string[];
  examples: string[];
}> {
  const scriptsDir = path.join(skillDir, "scripts");
  const referencesDir = path.join(skillDir, "references");
  const examplesDir = path.join(skillDir, "examples");

  const [scripts, references, examples] = await Promise.all([
    listFilesWithExtensions(scriptsDir, SCRIPT_EXTENSIONS),
    listFilesWithExtensions(referencesDir, REFERENCE_EXTENSIONS),
    listAllFiles(examplesDir),
  ]);

  return { scripts, references, examples };
}

// =============================================================================
// Main Loader Function
// =============================================================================

/**
 * Loads a skill from a directory containing a SKILL.md file.
 *
 * Parses the SKILL.md frontmatter and scans subdirectories for:
 * - scripts/: .py, .sh, .js files
 * - references/: .md files
 * - examples/: all files
 *
 * @param skillDir - Absolute path to the skill directory
 * @param pluginName - Name of the plugin this skill belongs to
 * @returns Parsed PluginSkill object
 * @throws SkillLoadError if SKILL.md is missing or invalid
 *
 * @example
 * ```typescript
 * const skill = await loadSkill("/path/to/plugin/skills/python-testing", "my-plugin");
 * console.log(skill.name);        // "python-testing"
 * console.log(skill.description); // "Best practices for Python testing"
 * console.log(skill.scripts);     // ["/path/to/scripts/run-tests.py"]
 * ```
 */
export async function loadSkill(skillDir: string, _pluginName: string): Promise<PluginSkill> {
  const skillFilePath = path.join(skillDir, SKILL_FILENAME);
  const dirName = extractNameFromDir(skillDir);

  // Validate directory exists
  if (!(await isDirectory(skillDir))) {
    throw new SkillLoadError(`Skill directory does not exist: ${skillDir}`, dirName, skillDir);
  }

  // Read SKILL.md
  let content: string;
  try {
    content = await fs.readFile(skillFilePath, "utf-8");
  } catch (error) {
    throw new SkillLoadError(
      `SKILL.md not found in skill directory: ${skillDir}`,
      dirName,
      skillDir,
      error instanceof Error ? error : undefined
    );
  }

  // Parse frontmatter
  const parseResult = frontmatterParser.parse(content);

  let name: string;
  let description: string;

  if (parseResult.success && parseResult.data) {
    name = parseResult.data.name ?? dirName;
    description = parseResult.data.description ?? extractFirstParagraph(parseResult.body);
  } else {
    // Fallback when frontmatter parsing fails
    name = dirName;
    description = extractFirstParagraph(parseResult.body);
  }

  // Validate we have a description
  if (!description) {
    throw new SkillLoadError(
      `Skill must have a description in frontmatter or body: ${skillDir}`,
      name,
      skillDir
    );
  }

  // Scan subdirectories
  const { scripts, references, examples } = await scanSubdirectories(skillDir);

  // Build the PluginSkill object
  const skill: PluginSkill = {
    name,
    description,
    filePath: skillFilePath,
  };

  // Only include arrays if they have items
  if (scripts.length > 0) {
    skill.scripts = scripts;
  }
  if (references.length > 0) {
    skill.references = references;
  }
  if (examples.length > 0) {
    skill.examples = examples;
  }

  return skill;
}

/**
 * Loads all skills from a plugin's skills directory.
 *
 * Scans the skills directory for subdirectories containing SKILL.md files.
 *
 * @param skillsDir - Absolute path to the plugin's skills directory
 * @param _pluginName - Name of the plugin (reserved for future use)
 * @returns Array of loaded PluginSkill objects
 *
 * @example
 * ```typescript
 * const skills = await loadAllSkills("/path/to/plugin/skills", "my-plugin");
 * console.log(skills.length); // Number of skills loaded
 * ```
 */
export async function loadAllSkills(
  skillsDir: string,
  _pluginName: string
): Promise<PluginSkill[]> {
  // Check if skills directory exists
  if (!(await isDirectory(skillsDir))) {
    return [];
  }

  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const skills: PluginSkill[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillPath = path.join(skillsDir, entry.name);
      const skillFilePath = path.join(skillPath, SKILL_FILENAME);

      // Only process directories that contain SKILL.md
      try {
        await fs.access(skillFilePath);
        const skill = await loadSkill(skillPath, _pluginName);
        skills.push(skill);
      } catch {}
    }
  }

  return skills;
}
