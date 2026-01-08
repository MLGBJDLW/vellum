// ============================================
// Worker Executor Tests
// ============================================

import { describe, expect, it } from "vitest";
import {
  getWorkerPrompt,
  getWorkerToolSet,
  WORKER_PROMPTS,
  WORKER_TOOL_SETS,
} from "../worker-executor.js";

describe("Worker Executor", () => {
  describe("WORKER_PROMPTS", () => {
    it("should have prompts for all 8 worker types", () => {
      const expectedWorkers = [
        "analyst",
        "architect",
        "coder",
        "devops",
        "qa",
        "researcher",
        "security",
        "writer",
      ];

      for (const worker of expectedWorkers) {
        expect(WORKER_PROMPTS).toHaveProperty(worker);
        expect(typeof WORKER_PROMPTS[worker as keyof typeof WORKER_PROMPTS]).toBe("string");
        expect(WORKER_PROMPTS[worker as keyof typeof WORKER_PROMPTS].length).toBeGreaterThan(50);
      }
    });

    it("analyst prompt should mention READ-ONLY", () => {
      expect(WORKER_PROMPTS.analyst).toContain("READ-ONLY");
    });

    it("security prompt should mention READ-ONLY", () => {
      expect(WORKER_PROMPTS.security).toContain("READ-ONLY");
    });

    it("coder prompt should mention FULL access", () => {
      expect(WORKER_PROMPTS.coder).toContain("FULL");
    });
  });

  describe("WORKER_TOOL_SETS", () => {
    it("should have tool sets for all 8 worker types", () => {
      const expectedWorkers = [
        "analyst",
        "architect",
        "coder",
        "devops",
        "qa",
        "researcher",
        "security",
        "writer",
      ];

      for (const worker of expectedWorkers) {
        expect(WORKER_TOOL_SETS).toHaveProperty(worker);
        const toolSet = WORKER_TOOL_SETS[worker];
        expect(Array.isArray(toolSet)).toBe(true);
        expect(toolSet?.length).toBeGreaterThan(0);
      }
    });

    it("read-only workers should not have write tools", () => {
      const readOnlyWorkers = ["analyst", "researcher", "security"];
      const writeTools = ["write_file", "bash", "shell", "smart_edit", "apply_diff"];

      for (const worker of readOnlyWorkers) {
        const toolSet = WORKER_TOOL_SETS[worker];
        for (const writeTool of writeTools) {
          expect(toolSet).not.toContain(writeTool);
        }
      }
    });

    it("coder should have comprehensive tool access", () => {
      const coderTools = WORKER_TOOL_SETS.coder;
      expect(coderTools).toContain("read_file");
      expect(coderTools).toContain("write_file");
      expect(coderTools).toContain("bash");
      expect(coderTools).toContain("smart_edit");
      expect(coderTools).toContain("search_files");
    });

    it("all workers should have read_file", () => {
      for (const [_worker, toolSet] of Object.entries(WORKER_TOOL_SETS)) {
        expect(toolSet).toContain("read_file");
      }
    });
  });

  describe("getWorkerPrompt", () => {
    it("should return correct prompt for known workers", () => {
      expect(getWorkerPrompt("analyst")).toBe(WORKER_PROMPTS.analyst);
      expect(getWorkerPrompt("coder")).toBe(WORKER_PROMPTS.coder);
      expect(getWorkerPrompt("qa")).toBe(WORKER_PROMPTS.qa);
    });

    it("should return coder prompt for unknown workers", () => {
      expect(getWorkerPrompt("unknown-worker")).toBe(WORKER_PROMPTS.coder);
      expect(getWorkerPrompt("")).toBe(WORKER_PROMPTS.coder);
    });
  });

  describe("getWorkerToolSet", () => {
    it("should return correct tool set for known workers", () => {
      expect(getWorkerToolSet("analyst")).toEqual(WORKER_TOOL_SETS.analyst);
      expect(getWorkerToolSet("coder")).toEqual(WORKER_TOOL_SETS.coder);
      expect(getWorkerToolSet("security")).toEqual(WORKER_TOOL_SETS.security);
    });

    it("should return coder tool set for unknown workers", () => {
      expect(getWorkerToolSet("unknown-worker")).toEqual(WORKER_TOOL_SETS.coder);
    });
  });
});
