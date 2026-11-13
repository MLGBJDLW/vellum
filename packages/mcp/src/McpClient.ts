import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  type AnySchema,
  type SchemaOutput,
  safeParse,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { type ListToolsResult, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { collectPages } from "./pagination.js";

/** Keep the SDK's tool metadata cache atomic across a complete paginated inventory. */
export class McpClient extends Client {
  override async request<T extends AnySchema>(
    request: Parameters<Client["request"]>[0],
    resultSchema: T,
    options?: RequestOptions
  ): Promise<SchemaOutput<T>> {
    if (request.method !== "tools/list") return super.request(request, resultSchema, options);

    // Client.listTools replaces its output-schema and task caches after request()
    // returns. Gather pages below that public seam so it sees one full result and
    // retains its previous metadata if any page fails.
    let firstPage: ListToolsResult | undefined;
    const tools = await collectPages(
      async (params) => {
        const page = await super.request(
          { ...request, params: { ...request.params, ...params } },
          ListToolsResultSchema,
          options
        );
        firstPage ??= page;
        return page;
      },
      (page) => page.tools
    );
    const result = { ...firstPage, tools };
    delete result.nextCursor;
    const parsed = safeParse(resultSchema, result);
    if (!parsed.success) throw parsed.error;
    return parsed.data;
  }
}
