import { describe, expect, it } from "vitest";
import {
  APPROVAL_POLICIES,
  ApprovalPolicySchema,
  policyToTrustPreset,
  SANDBOX_POLICIES,
  SandboxPolicySchema,
  sandboxToRestrictions,
} from "../policies.js";

describe("ApprovalPolicySchema", () => {
  describe("valid policies", () => {
    it("should parse 'suggest' successfully", () => {
      expect(ApprovalPolicySchema.parse("suggest")).toBe("suggest");
    });

    it("should parse 'auto-edit' successfully", () => {
      expect(ApprovalPolicySchema.parse("auto-edit")).toBe("auto-edit");
    });

    it("should parse 'on-request' successfully", () => {
      expect(ApprovalPolicySchema.parse("on-request")).toBe("on-request");
    });

    it("should parse 'full-auto' successfully", () => {
      expect(ApprovalPolicySchema.parse("full-auto")).toBe("full-auto");
    });
  });

  describe("invalid policies", () => {
    it("should throw for invalid policy", () => {
      expect(() => ApprovalPolicySchema.parse("invalid")).toThrow();
    });

    it("should throw for empty string", () => {
      expect(() => ApprovalPolicySchema.parse("")).toThrow();
    });
  });
});

describe("APPROVAL_POLICIES constant", () => {
  it("should contain all four policies", () => {
    expect(APPROVAL_POLICIES).toHaveLength(4);
    expect(APPROVAL_POLICIES).toContain("suggest");
    expect(APPROVAL_POLICIES).toContain("auto-edit");
    expect(APPROVAL_POLICIES).toContain("on-request");
    expect(APPROVAL_POLICIES).toContain("full-auto");
  });
});

describe("SandboxPolicySchema", () => {
  describe("valid policies", () => {
    it("should parse 'workspace-read' successfully", () => {
      expect(SandboxPolicySchema.parse("workspace-read")).toBe("workspace-read");
    });

    it("should parse 'workspace-write' successfully", () => {
      expect(SandboxPolicySchema.parse("workspace-write")).toBe("workspace-write");
    });

    it("should parse 'cwd-read' successfully", () => {
      expect(SandboxPolicySchema.parse("cwd-read")).toBe("cwd-read");
    });

    it("should parse 'cwd-write' successfully", () => {
      expect(SandboxPolicySchema.parse("cwd-write")).toBe("cwd-write");
    });

    it("should parse 'full-access' successfully", () => {
      expect(SandboxPolicySchema.parse("full-access")).toBe("full-access");
    });
  });

  describe("invalid policies", () => {
    it("should throw for invalid policy", () => {
      expect(() => SandboxPolicySchema.parse("invalid")).toThrow();
    });
  });
});

describe("SANDBOX_POLICIES constant", () => {
  it("should contain all five policies", () => {
    expect(SANDBOX_POLICIES).toHaveLength(5);
    expect(SANDBOX_POLICIES).toContain("workspace-read");
    expect(SANDBOX_POLICIES).toContain("workspace-write");
    expect(SANDBOX_POLICIES).toContain("cwd-read");
    expect(SANDBOX_POLICIES).toContain("cwd-write");
    expect(SANDBOX_POLICIES).toContain("full-access");
  });
});

describe("policyToTrustPreset", () => {
  it("should map 'suggest' to 'cautious'", () => {
    expect(policyToTrustPreset("suggest")).toBe("cautious");
  });

  it("should map 'auto-edit' to 'default'", () => {
    expect(policyToTrustPreset("auto-edit")).toBe("default");
  });

  it("should map 'on-request' to 'default'", () => {
    expect(policyToTrustPreset("on-request")).toBe("default");
  });

  it("should map 'full-auto' to 'relaxed'", () => {
    expect(policyToTrustPreset("full-auto")).toBe("relaxed");
  });
});

describe("sandboxToRestrictions", () => {
  describe("workspace-read", () => {
    it("should return read-only restriction for all files", () => {
      const restrictions = sandboxToRestrictions("workspace-read");
      expect(restrictions).toHaveLength(1);
      expect(restrictions[0]).toEqual({ pattern: "**/*", access: "read" });
    });
  });

  describe("workspace-write", () => {
    it("should return write restriction for all files", () => {
      const restrictions = sandboxToRestrictions("workspace-write");
      expect(restrictions).toHaveLength(1);
      expect(restrictions[0]).toEqual({ pattern: "**/*", access: "write" });
    });
  });

  describe("cwd-read", () => {
    it("should return read-only restriction for cwd when provided", () => {
      const restrictions = sandboxToRestrictions("cwd-read", "/project/src");
      expect(restrictions).toHaveLength(1);
      expect(restrictions[0]).toEqual({
        pattern: "/project/src/**/*",
        access: "read",
      });
    });

    it("should fallback to workspace read when cwd not provided", () => {
      const restrictions = sandboxToRestrictions("cwd-read");
      expect(restrictions).toHaveLength(1);
      expect(restrictions[0]).toEqual({ pattern: "**/*", access: "read" });
    });
  });

  describe("cwd-write", () => {
    it("should return read everywhere + write in cwd when provided", () => {
      const restrictions = sandboxToRestrictions("cwd-write", "/project/src");
      expect(restrictions).toHaveLength(2);
      expect(restrictions[0]).toEqual({ pattern: "**/*", access: "read" });
      expect(restrictions[1]).toEqual({
        pattern: "/project/src/**/*",
        access: "write",
      });
    });

    it("should fallback to workspace write when cwd not provided", () => {
      const restrictions = sandboxToRestrictions("cwd-write");
      expect(restrictions).toHaveLength(1);
      expect(restrictions[0]).toEqual({ pattern: "**/*", access: "write" });
    });
  });

  describe("full-access", () => {
    it("should return empty array (no restrictions)", () => {
      const restrictions = sandboxToRestrictions("full-access");
      expect(restrictions).toHaveLength(0);
      expect(restrictions).toEqual([]);
    });
  });
});
