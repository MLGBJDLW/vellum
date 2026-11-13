import { expect, it, vi } from "vitest";

const pending = vi.hoisted(() => [] as Array<Promise<void>>);
vi.mock("@vellum/plugin", () => ({
  getSearchPaths: () => [],
  PluginManager: class {
    initialize() {
      return pending.shift() ?? Promise.resolve();
    }
    getFailedPlugins() {
      return [];
    }
    getPlugins() {
      return [];
    }
    getCommands() {
      return new Map();
    }
    getAgents() {
      return new Map();
    }
  },
}));

import { disposePlugins, getPluginManager, initializePlugins } from "./plugins.js";

it("does not republish plugins from a workspace whose initialization finished late", async () => {
  let finishOld!: () => void;
  pending.push(
    new Promise<void>((resolve) => {
      finishOld = resolve;
    })
  );
  const old = initializePlugins({ projectRoot: "old" });
  disposePlugins();
  const current = await initializePlugins({ projectRoot: "current" });
  finishOld();
  await old;
  expect(getPluginManager()).toBe(current.manager);
  disposePlugins();
});
