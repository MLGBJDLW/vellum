import type { LspHub } from "../LspHub.js";
import { createIncomingCallsTool, createOutgoingCallsTool } from "./call-hierarchy.js";
import { createCodeActionsTool } from "./code-actions.js";
import { createDefinitionTool } from "./definition.js";
import { createDiagnosticsTool } from "./diagnostics.js";
import { createFormatTool } from "./format.js";
import { createHoverTool } from "./hover.js";
import { createReferencesTool } from "./references.js";
import { createDocumentSymbolsTool, createWorkspaceSymbolsTool } from "./symbols.js";

export function createLspTools(hub: LspHub) {
  return [
    createDiagnosticsTool(hub),
    createHoverTool(hub),
    createDefinitionTool(hub),
    createReferencesTool(hub),
    createDocumentSymbolsTool(hub),
    createWorkspaceSymbolsTool(hub),
    createIncomingCallsTool(hub),
    createOutgoingCallsTool(hub),
    createCodeActionsTool(hub),
    createFormatTool(hub),
  ];
}
