// ============================================
// AGENTS.md Integration Tests
// ============================================

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PromptBuilder } from "../../../prompts/prompt-builder.js";
import {
  AgentsMdIntegration,
  createAgentsMdIntegration,
  injectAgentsMd,
  MAX_AGENTS_MD_LENGTH,
} from "../integration.js";
import { AgentsMdLoader } from "../loader.js";

describe("AgentsMdIntegration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-md-integration-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("injectInstructions", () => {
    it("should inject instructions into PromptBuilder", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Project instructions");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const integration = new AgentsMdIntegration(loader);
      const builder = new PromptBuilder().withBase("Base prompt");

      await integration.injectInstructions(builder, path.join(tempDir, "file.ts"));

      const prompt = builder.build();
      expect(prompt).toContain("Project instructions");
      expect(prompt).toContain("Base prompt");
    });

    it("should include source attribution by default", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Instructions");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const integration = new AgentsMdIntegration(loader);
      const builder = new PromptBuilder();

      await integration.injectInstructions(builder, path.join(tempDir, "file.ts"));

      const prompt = builder.build();
      expect(prompt).toContain("AGENTS.md Sources:");
    });

    it("should skip attribution when disabled", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Instructions");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const integration = new AgentsMdIntegration(loader, { includeAttribution: false });
      const builder = new PromptBuilder();

      await integration.injectInstructions(builder, path.join(tempDir, "file.ts"));

      const prompt = builder.build();
      expect(prompt).not.toContain("AGENTS.md Sources:");
      expect(prompt).toContain("Instructions");
    });

    it("should handle no applicable files gracefully", async () => {
      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const integration = new AgentsMdIntegration(loader);
      const builder = new PromptBuilder().withBase("Base");

      await integration.injectInstructions(builder, path.join(tempDir, "file.ts"));

      const prompt = builder.build();
      expect(prompt).toBe("Base");
    });

    it("should return builder for chaining", async () => {
      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const integration = new AgentsMdIntegration(loader);
      const builder = new PromptBuilder();

      const result = await integration.injectInstructions(builder, path.join(tempDir, "file.ts"));

      expect(result).toBe(builder);
    });

    it("should merge hierarchical instructions", async () => {
      const srcDir = path.join(tempDir, "src");
      await fs.mkdir(srcDir);

      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root instructions");
      await fs.writeFile(path.join(srcDir, "AGENTS.md"), "Src instructions");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const integration = new AgentsMdIntegration(loader);
      const builder = new PromptBuilder();

      await integration.injectInstructions(builder, path.join(srcDir, "file.ts"));

      const prompt = builder.build();
      expect(prompt).toContain("Root instructions");
      expect(prompt).toContain("Src instructions");
    });

    it("should truncate long instructions", async () => {
      const longContent = "x".repeat(MAX_AGENTS_MD_LENGTH + 1000);
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), longContent);

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const integration = new AgentsMdIntegration(loader);
      const builder = new PromptBuilder();

      await integration.injectInstructions(builder, path.join(tempDir, "file.ts"));

      const prompt = builder.build();
      expect(prompt).toContain("<!-- Content truncated -->");
      expect(prompt.length).toBeLessThan(longContent.length);
    });
  });

  describe("getFormattedContent", () => {
    it("should return formatted content", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Instructions");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const integration = new AgentsMdIntegration(loader);

      const content = await integration.getFormattedContent(path.join(tempDir, "file.ts"));

      expect(content).toContain("Instructions");
      expect(content).toContain("AGENTS.md Sources:");
    });

    it("should return empty string when no files", async () => {
      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const integration = new AgentsMdIntegration(loader);

      const content = await integration.getFormattedContent(path.join(tempDir, "file.ts"));

      expect(content).toBe("");
    });
  });

  describe("hasApplicableInstructions", () => {
    it("should return true when files exist", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Instructions");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const integration = new AgentsMdIntegration(loader);

      expect(await integration.hasApplicableInstructions(path.join(tempDir, "file.ts"))).toBe(true);
    });

    it("should return false when no files exist", async () => {
      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const integration = new AgentsMdIntegration(loader);

      expect(await integration.hasApplicableInstructions(path.join(tempDir, "file.ts"))).toBe(
        false
      );
    });
  });
});

describe("createAgentsMdIntegration", () => {
  it("should create integration instance", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-md-factory-"));

    try {
      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const integration = createAgentsMdIntegration(loader);

      expect(integration).toBeInstanceOf(AgentsMdIntegration);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("injectAgentsMd helper", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-md-helper-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should inject instructions using convenience helper", async () => {
    await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Helper test instructions");

    const builder = new PromptBuilder().withBase("Base");
    await injectAgentsMd(builder, tempDir, path.join(tempDir, "file.ts"));

    const prompt = builder.build();
    expect(prompt).toContain("Helper test instructions");
    expect(prompt).toContain("Base");
  });
});
