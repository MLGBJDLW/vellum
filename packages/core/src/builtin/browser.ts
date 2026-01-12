/**
 * Browser Tool (Playwright Integration)
 *
 * Provides browser automation capabilities using Playwright.
 * Lazy-loads Playwright only when needed and gracefully handles
 * cases where Playwright is not installed.
 *
 * @module builtin/browser
 */

import { z } from "zod";
import { CDPConnectionError, CloudMetadataError, PrivateIPError } from "../errors/web.js";
import { defineTool, fail, ok } from "../types/index.js";
import type { ToolResult } from "../types/tool.js";
import { isCloudMetadata, validateUrlWithDNS } from "./security/url-validator.js";

/** Playwright browser instance type (generic for when not installed) */
// biome-ignore lint/suspicious/noExplicitAny: Playwright types unavailable when not installed
type Browser = any;
/** Playwright page instance type (generic for when not installed) */
// biome-ignore lint/suspicious/noExplicitAny: Playwright types unavailable when not installed
type Page = any;
/** Playwright module type */
// biome-ignore lint/suspicious/noExplicitAny: Playwright types unavailable when not installed
type PlaywrightModule = any;

/** Browser action types */
const BrowserActionSchema = z.enum([
  "navigate",
  "screenshot",
  "click",
  "type",
  "evaluate",
  "close",
]);

/**
 * Schema for browser tool parameters
 */
export const browserParamsSchema = z.object({
  /** Action to perform */
  action: BrowserActionSchema.describe("The browser action to perform"),
  /** URL for navigate action */
  url: z.string().url().optional().describe("URL for navigate action"),
  /** CSS selector for click/type actions */
  selector: z.string().optional().describe("CSS selector for click/type actions"),
  /** Text to type for type action */
  text: z.string().optional().describe("Text to type for type action"),
  /** JavaScript code for evaluate action */
  script: z.string().optional().describe("JavaScript code for evaluate action"),
  /** Screenshot options */
  fullPage: z.boolean().optional().default(false).describe("Take full page screenshot"),
  /** Timeout for actions in milliseconds */
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .default(30000)
    .describe("Action timeout in milliseconds"),
});

/** Inferred type for browser parameters */
export type BrowserParams = z.infer<typeof browserParamsSchema>;

/** Output type for browser tool */
export interface BrowserOutput {
  /** Action that was performed */
  action: string;
  /** Whether the action succeeded */
  success: boolean;
  /** Result data (varies by action) */
  data?: {
    /** Current page URL after action */
    url?: string;
    /** Page title after action */
    title?: string;
    /** Screenshot as base64 (for screenshot action) */
    screenshot?: string;
    /** Evaluation result (for evaluate action) */
    result?: unknown;
    /** Element text content (for click action) */
    elementText?: string;
  };
  /** Timing information */
  timing: {
    /** Action duration in milliseconds */
    duration: number;
  };
}

/** Singleton browser instance for session reuse */
let browserInstance: Browser | null = null;
let pageInstance: Page | null = null;
let playwrightModule: PlaywrightModule | null = null;

/**
 * Lazily load Playwright module
 */
async function loadPlaywright(): Promise<PlaywrightModule | null> {
  if (playwrightModule) {
    return playwrightModule;
  }

  try {
    // Dynamic import - will fail if playwright not installed
    // @ts-expect-error playwright is an optional dependency that may not be installed
    playwrightModule = await import("playwright");
    return playwrightModule;
  } catch {
    return null;
  }
}

/**
 * Connect to a remote browser via CDP (Chrome DevTools Protocol)
 */
async function connectViaCDP(endpoint: string): Promise<Browser> {
  try {
    const playwright = await loadPlaywright();
    if (!playwright) {
      throw new Error("Playwright not available");
    }
    return await playwright.chromium.connectOverCDP(endpoint);
  } catch (error) {
    throw new CDPConnectionError(endpoint, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Get or create browser instance
 * @param config - Optional configuration for browser connection
 * @param config.cdpEndpoint - CDP endpoint URL for remote browser connection
 */
async function getBrowser(config?: { cdpEndpoint?: string }): Promise<Browser | null> {
  // CDP remote connection (creates new connection each time)
  if (config?.cdpEndpoint) {
    return connectViaCDP(config.cdpEndpoint);
  }

  // Local browser singleton
  if (browserInstance) {
    return browserInstance;
  }

  const playwright = await loadPlaywright();
  if (!playwright) {
    return null;
  }

  try {
    browserInstance = await playwright.chromium.launch({
      headless: true,
    });
    return browserInstance;
  } catch {
    return null;
  }
}

/**
 * Get or create page instance
 */
async function getPage(): Promise<Page | null> {
  const browser = await getBrowser();
  if (!browser) {
    return null;
  }

  if (pageInstance) {
    return pageInstance;
  }

  try {
    pageInstance = await browser.newPage();
    return pageInstance;
  } catch {
    return null;
  }
}

/**
 * Close browser and clean up resources
 */
async function closeBrowser(): Promise<void> {
  if (pageInstance) {
    try {
      await pageInstance.close();
    } catch {
      // Ignore close errors
    }
    pageInstance = null;
  }

  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      // Ignore close errors
    }
    browserInstance = null;
  }
}

/**
 * Handle navigate action
 */
async function handleNavigate(
  page: Page,
  url: string | undefined,
  startTime: number
): Promise<ToolResult<BrowserOutput>> {
  if (!url) {
    return fail("URL is required for navigate action");
  }

  // Security validation before navigation
  const cloudCheck = isCloudMetadata(url);
  if (cloudCheck.isMetadata) {
    throw new CloudMetadataError(url, cloudCheck.provider);
  }

  const validationResult = await validateUrlWithDNS(url);
  if (!validationResult.valid) {
    throw new PrivateIPError(validationResult.resolvedIPs[0] ?? "unknown", url);
  }

  await page.goto(url, { waitUntil: "domcontentloaded" });

  return ok({
    action: "navigate",
    success: true,
    data: {
      url: page.url(),
      title: await page.title(),
    },
    timing: { duration: Date.now() - startTime },
  });
}

/**
 * Handle screenshot action
 */
async function handleScreenshot(
  page: Page,
  fullPage: boolean,
  startTime: number
): Promise<ToolResult<BrowserOutput>> {
  const buffer = await page.screenshot({
    fullPage,
    type: "png",
  });

  return ok({
    action: "screenshot",
    success: true,
    data: {
      url: page.url(),
      screenshot: buffer.toString("base64"),
    },
    timing: { duration: Date.now() - startTime },
  });
}

/**
 * Handle click action
 */
async function handleClick(
  page: Page,
  selector: string | undefined,
  startTime: number
): Promise<ToolResult<BrowserOutput>> {
  if (!selector) {
    return fail("Selector is required for click action");
  }

  const element = await page.$(selector);
  if (!element) {
    return fail(`Element not found: ${selector}`);
  }

  const elementText = await element.textContent();
  await element.click();

  return ok({
    action: "click",
    success: true,
    data: {
      url: page.url(),
      elementText: elementText ?? undefined,
    },
    timing: { duration: Date.now() - startTime },
  });
}

/**
 * Handle type action
 */
async function handleType(
  page: Page,
  selector: string | undefined,
  text: string | undefined,
  startTime: number
): Promise<ToolResult<BrowserOutput>> {
  if (!selector) {
    return fail("Selector is required for type action");
  }
  if (!text) {
    return fail("Text is required for type action");
  }

  const element = await page.$(selector);
  if (!element) {
    return fail(`Element not found: ${selector}`);
  }

  await element.fill(text);

  return ok({
    action: "type",
    success: true,
    data: {
      url: page.url(),
    },
    timing: { duration: Date.now() - startTime },
  });
}

/**
 * Handle evaluate action
 */
async function handleEvaluate(
  page: Page,
  script: string | undefined,
  startTime: number
): Promise<ToolResult<BrowserOutput>> {
  if (!script) {
    return fail("Script is required for evaluate action");
  }

  const result: unknown = await page.evaluate(script);

  return ok({
    action: "evaluate",
    success: true,
    data: {
      url: page.url(),
      result,
    },
    timing: { duration: Date.now() - startTime },
  });
}

/**
 * Handle browser action errors
 */
function handleBrowserError(error: unknown, action: string): ToolResult<BrowserOutput> {
  if (error instanceof Error) {
    if (error.message.includes("Timeout")) {
      return fail(`Action timed out: ${action}`);
    }
    return fail(`Browser action failed: ${error.message}`);
  }
  return fail("Unknown error occurred during browser action");
}

/**
 * Browser tool implementation
 *
 * Provides browser automation using Playwright.
 * Lazily initializes browser only when first action is requested.
 *
 * @example
 * ```typescript
 * // Navigate to a URL
 * const result = await browserTool.execute(
 *   { action: "navigate", url: "https://example.com" },
 *   ctx
 * );
 *
 * // Take a screenshot
 * const result = await browserTool.execute(
 *   { action: "screenshot", fullPage: true },
 *   ctx
 * );
 *
 * // Click an element
 * const result = await browserTool.execute(
 *   { action: "click", selector: "button.submit" },
 *   ctx
 * );
 * ```
 */
export const browserTool = defineTool({
  name: "browser",
  description:
    "Control a browser for web automation. Supports navigation, screenshots, clicking, typing, and JavaScript evaluation. Requires Playwright to be installed.",
  parameters: browserParamsSchema,
  kind: "agent",
  category: "browser",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Check permission for browser operations
    const hasPermission = await ctx.checkPermission("browser", input.action);
    if (!hasPermission) {
      return fail(`Permission denied: cannot perform browser action '${input.action}'`);
    }

    const startTime = Date.now();

    // Handle close action specially
    if (input.action === "close") {
      await closeBrowser();
      return ok({
        action: "close",
        success: true,
        timing: { duration: Date.now() - startTime },
      });
    }

    // Check if Playwright is available
    const playwright = await loadPlaywright();
    if (!playwright) {
      return fail(
        "Playwright is not installed. Install it with: npm install playwright && npx playwright install chromium"
      );
    }

    // Get page instance
    const page = await getPage();
    if (!page) {
      return fail(
        "Failed to initialize browser. Ensure Playwright browsers are installed: npx playwright install chromium"
      );
    }

    // Set default timeout
    page.setDefaultTimeout(input.timeout ?? 30000);

    try {
      switch (input.action) {
        case "navigate":
          return await handleNavigate(page, input.url, startTime);
        case "screenshot":
          return await handleScreenshot(page, input.fullPage ?? false, startTime);
        case "click":
          return await handleClick(page, input.selector, startTime);
        case "type":
          return await handleType(page, input.selector, input.text, startTime);
        case "evaluate":
          return await handleEvaluate(page, input.script, startTime);
        default:
          return fail(`Unknown action: ${input.action}`);
      }
    } catch (error) {
      return handleBrowserError(error, input.action);
    }
  },

  shouldConfirm(input, _ctx) {
    // Interactive actions should require confirmation
    return input.action !== "close";
  },
});

/**
 * Clean up browser resources
 * Call this when shutting down the application
 */
export async function cleanupBrowser(): Promise<void> {
  await closeBrowser();
}
