import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { RootNotFoundError } from "./errors.js";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function findNearestRoot(startPath: string, markers: string[]): Promise<string> {
  const resolved = resolve(startPath);
  let current = resolved;

  while (true) {
    for (const marker of markers) {
      if (await fileExists(join(current, marker))) {
        return current;
      }
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new RootNotFoundError(resolved, markers);
}

export async function findRootForFile(filePath: string, markers: string[]): Promise<string> {
  return findNearestRoot(dirname(resolve(filePath)), markers);
}
