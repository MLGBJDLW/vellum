import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { LanguageClient } from "../../LanguageClient.js";

describe("LanguageClient", () => {
  it("constructs with provided options", () => {
    const rootPath = process.cwd();
    const client = new LanguageClient({
      serverId: "test",
      name: "Test Server",
      command: "node",
      rootPath,
      rootUri: pathToFileURL(rootPath).toString(),
    });

    expect(client.serverId).toBe("test");
    expect(client.initialized).toBe(false);
    expect(client.root).toBe(rootPath);
  });
});
