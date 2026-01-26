export const lspConfigJsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://vellum.dev/schemas/lsp-config.json",
  title: "Vellum LSP Configuration",
  type: "object",
  properties: {
    version: { type: "string", default: "1.0" },
    servers: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          enabled: { type: "boolean", default: true },
          name: { type: "string" },
          command: { type: "string" },
          args: { type: "array", items: { type: "string" } },
          transport: { type: "string", enum: ["stdio", "socket", "ipc"], default: "stdio" },
          rootPatterns: { type: "array", items: { type: "string" } },
          fileExtensions: { type: "array", items: { type: "string" } },
          filePatterns: { type: "array", items: { type: "string" } },
          languageId: { type: "string" },
          initializationOptions: { type: "object" },
          settings: { type: "object" },
          env: { type: "object", additionalProperties: { type: "string" } },
          cwd: { type: "string" },
          install: {
            type: "object",
            properties: {
              method: { type: "string", enum: ["npm", "pip", "cargo", "system"] },
              package: { type: "string" },
              args: { type: "array", items: { type: "string" } },
            },
            required: ["method", "package"],
          },
        },
        required: ["command"],
      },
    },
    disabled: { type: "array", items: { type: "string" } },
    cache: {
      type: "object",
      properties: {
        maxSize: { type: "number", default: 100 },
        ttlSeconds: { type: "number", default: 300 },
      },
    },
    autoInstall: {
      oneOf: [{ type: "boolean" }, { type: "string", enum: ["auto", "prompt", "never"] }],
      default: "prompt",
    },
    maxConcurrentServers: { type: "number", default: 5 },
    requestTimeoutMs: { type: "number", default: 30000 },
  },
};
