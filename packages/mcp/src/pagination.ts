/** Read every page without publishing a partial inventory or looping on a stale cursor. */
export async function collectPages<Page extends { nextCursor?: string }, Item>(
  request: (params?: { cursor: string }) => Promise<Page>,
  items: (page: Page) => Item[]
): Promise<Item[]> {
  const result: Item[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await request(cursor === undefined ? undefined : { cursor });
    for (const item of items(page)) result.push(item);
    cursor = page.nextCursor;
    if (cursor !== undefined) {
      if (cursors.has(cursor)) throw new Error("MCP server returned a repeated pagination cursor");
      cursors.add(cursor);
    }
  } while (cursor !== undefined);
  return result;
}
