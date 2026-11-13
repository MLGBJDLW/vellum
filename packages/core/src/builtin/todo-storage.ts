import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/** Canonical task format shared by both task tools and the sidebar. */
export interface StoredSessionTodo {
  id: string | number;
  title: string;
  status: "pending" | "in-progress" | "completed";
  description?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface SessionTodoStorage {
  nextId: number;
  items: StoredSessionTodo[];
}

/** Hash arbitrary session IDs so they cannot become paths on any platform. */
export function getSessionTodoPath(workingDir: string, sessionId: string): string {
  const key = createHash("sha256").update(sessionId).digest("hex");
  return join(workingDir, ".vellum", "todos", `${key}.json`);
}

function parseTodo(value: unknown): StoredSessionTodo | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" && typeof item.id !== "number") return undefined;
  const title = typeof item.title === "string" ? item.title : item.text;
  if (typeof title !== "string") return undefined;
  const status =
    item.status ??
    (typeof item.completed === "boolean" ? (item.completed ? "completed" : "pending") : undefined);
  if (status !== "pending" && status !== "in-progress" && status !== "completed") return undefined;
  const createdAt = typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString();
  return {
    id: item.id,
    title,
    status,
    description: typeof item.description === "string" ? item.description : undefined,
    createdAt,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : createdAt,
    completedAt:
      status === "completed" && typeof item.completedAt === "string" ? item.completedAt : undefined,
  };
}

export async function loadSessionTodos(
  workingDir: string,
  sessionId: string
): Promise<SessionTodoStorage> {
  const filePath = getSessionTodoPath(workingDir, sessionId);
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (error) {
    // Unowned legacy .vellum/todos.json files are deliberately not adopted:
    // there is no reliable way to associate them with one of the saved sessions.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { nextId: 1, items: [] };
    throw error;
  }

  let data: { items?: unknown; nextId?: unknown } | null;
  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid TODO plan at ${filePath}; existing file was preserved`, {
      cause: error,
    });
  }
  if (!data || !Array.isArray(data.items)) {
    throw new Error(`Invalid TODO plan at ${filePath}; existing file was preserved`);
  }
  const items = data.items.map((value: unknown) => {
    const item = parseTodo(value);
    if (!item) throw new Error(`Invalid TODO entry at ${filePath}; existing file was preserved`);
    return item;
  });
  const nextId = items.reduce((next, item) => {
    const id = Number(item.id);
    return Number.isSafeInteger(id) && id >= next ? id + 1 : next;
  }, 1);
  return {
    nextId:
      typeof data.nextId === "number" && Number.isSafeInteger(data.nextId)
        ? Math.max(nextId, data.nextId)
        : nextId,
    items,
  };
}

const mutations = new Map<string, Promise<void>>();

/** Serialize a session's complete read/modify/write operation, across both tools. */
export function withSessionTodoMutation<T>(
  workingDir: string,
  sessionId: string,
  mutate: (storage: SessionTodoStorage) => Promise<T>
): Promise<T> {
  const filePath = resolve(getSessionTodoPath(workingDir, sessionId));
  const key = process.platform === "win32" ? filePath.toLowerCase() : filePath;
  const previous = mutations.get(key) ?? Promise.resolve();
  const operation = previous.then(async () =>
    mutate(await loadSessionTodos(workingDir, sessionId))
  );
  // A failed write releases the queue for a later repaired/retried operation.
  const settled = operation.then(
    () => {},
    () => {}
  );
  mutations.set(key, settled);
  return operation.finally(() => {
    if (mutations.get(key) === settled) mutations.delete(key);
  });
}

/** Atomically publish a complete plan; call within withSessionTodoMutation. */
export async function saveSessionTodos(
  workingDir: string,
  sessionId: string,
  storage: SessionTodoStorage
): Promise<void> {
  const filePath = getSessionTodoPath(workingDir, sessionId);
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  const content = JSON.stringify(storage, null, 2);
  await mkdir(dirname(filePath), { recursive: true });
  let ownsTemporary = false;
  try {
    const file = await open(temporaryPath, "wx", 0o600);
    ownsTemporary = true;
    try {
      await file.writeFile(content, "utf-8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporaryPath, filePath);
  } finally {
    // Never remove the destination on failure; only clean up our own temporary file.
    if (ownsTemporary) {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
}
