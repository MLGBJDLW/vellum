import { describe, expect, it } from "vitest";

import { LspError, LspErrorCode, RootNotFoundError } from "../errors.js";

describe("LspError", () => {
  it("serializes to JSON", () => {
    const err = new LspError(LspErrorCode.LSP_REQUEST_TIMEOUT, "timeout", {
      serverId: "tsserver",
    });
    expect(err.toJSON()).toMatchObject({
      name: "LspError",
      code: LspErrorCode.LSP_REQUEST_TIMEOUT,
      message: "timeout",
      serverId: "tsserver",
    });
  });

  it("captures root not found details", () => {
    const err = new RootNotFoundError("/repo", ["package.json"]);
    expect(err.searchedFrom).toBe("/repo");
    expect(err.markers).toEqual(["package.json"]);
  });
});
