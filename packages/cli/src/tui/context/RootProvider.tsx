/**
 * Root Provider Composition
 *
 * Composes all context providers in the correct order for the Vellum TUI.
 * This is the single entry point for providing all application contexts.
 *
 * @module tui/context/RootProvider
 */

import type { ToolExecutor, ToolRegistry } from "@vellum/core";
import type { ThemeName, ThemePreset, VellumTheme } from "@vellum/shared";
import type React from "react";
import type { ReactNode } from "react";

import { ThemeProvider } from "../theme/provider.js";
import { AppProvider, type AppState } from "./AppContext.js";
import { McpProvider } from "./McpContext.js";
import { type Message, MessagesProvider } from "./MessagesContext.js";
import { ToolsProvider } from "./ToolsContext.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the RootProvider component
 */
export interface RootProviderProps {
  /**
   * Children to render within all contexts
   */
  readonly children: ReactNode;

  /**
   * Theme configuration - can be a theme name, preset, or VellumTheme object
   *
   * @default "dark"
   */
  readonly theme?: ThemeName | ThemePreset | VellumTheme;

  /**
   * Initial application state overrides
   *
   * Partial state that will be merged with the default initial state
   */
  readonly initialAppState?: Partial<AppState>;

  /**
   * Initial messages to populate the conversation
   */
  readonly initialMessages?: readonly Message[];

  /**
   * Optional tool registry for MCP tool registration
   */
  readonly toolRegistry?: ToolRegistry;

  /**
   * Optional tool executor for MCP tool execution
   */
  readonly toolExecutor?: ToolExecutor;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Root provider component that composes all context providers
 *
 * Provider order (outermost to innermost):
 * 1. ThemeProvider - Theme context for styling
 * 2. AppProvider - Application state (mode, loading, errors)
 * 3. MessagesProvider - Message/conversation state
 * 4. ToolsProvider - Tool execution state
 *
 * @example
 * ```tsx
 * // Basic usage with defaults
 * <RootProvider>
 *   <App />
 * </RootProvider>
 *
 * // With custom theme
 * <RootProvider theme="dracula">
 *   <App />
 * </RootProvider>
 *
 * // With initial state
 * <RootProvider
 *   theme="dark"
 *   initialAppState={{ vimMode: true }}
 *   initialMessages={[]}
 * >
 *   <App />
 * </RootProvider>
 * ```
 */
export function RootProvider({
  children,
  theme = "dark",
  initialAppState,
  initialMessages,
  toolRegistry,
  toolExecutor,
}: RootProviderProps): React.JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <AppProvider initialState={initialAppState}>
        <McpProvider toolRegistry={toolRegistry} toolExecutor={toolExecutor}>
          <MessagesProvider initialMessages={initialMessages}>
            <ToolsProvider>{children}</ToolsProvider>
          </MessagesProvider>
        </McpProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
