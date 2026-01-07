/**
 * Documentation Lookup Tool
 *
 * Provides documentation lookup from MDN, npm, PyPI, and GitHub.
 * Supports structured queries for specific documentation sources.
 *
 * @module builtin/doc-lookup
 */

import { z } from "zod";
import { CloudMetadataError, PrivateIPError } from "../errors/web.js";
import { defineTool, fail, ok } from "../types/index.js";
import type { ToolResult } from "../types/tool.js";
import { isCloudMetadata, validateUrlWithDNS } from "./security/url-validator.js";

/**
 * Documentation sources supported by doc_lookup
 */
export const DocSourceSchema = z.enum(["mdn", "npm", "pypi", "github"]);
export type DocSource = z.infer<typeof DocSourceSchema>;

/**
 * Parameters for doc_lookup tool
 */
export const docLookupParamsSchema = z
  .object({
    /** Documentation source */
    source: DocSourceSchema.describe("Documentation source: mdn, npm, pypi, or github"),
    /** Search query (for MDN) */
    query: z.string().optional().describe("Search query (required for MDN)"),
    /** Package name (for npm, pypi, github) */
    package: z.string().optional().describe("Package name (required for npm/pypi)"),
    /** GitHub repository in owner/repo format */
    repo: z
      .string()
      .optional()
      .describe("GitHub repository in owner/repo format (required for github)"),
    /** Maximum length of returned content */
    maxLength: z
      .number()
      .int()
      .positive()
      .default(10000)
      .describe("Maximum length of returned content (default: 10000)"),
  })
  .refine(
    (data) => {
      // MDN requires query
      if (data.source === "mdn" && !data.query) return false;
      // npm/pypi require package
      if ((data.source === "npm" || data.source === "pypi") && !data.package) return false;
      // github requires repo
      if (data.source === "github" && !data.repo) return false;
      return true;
    },
    {
      message:
        "Required field missing: MDN needs 'query', npm/pypi need 'package', github needs 'repo'",
    }
  );

export type DocLookupParams = z.infer<typeof docLookupParamsSchema>;

/**
 * Output structure for doc_lookup
 */
export interface DocLookupOutput {
  source: DocSource;
  title: string;
  url: string;
  content: string;
  truncated: boolean;
  metadata?: {
    version?: string;
    description?: string;
    author?: string;
    license?: string;
  };
}

/**
 * Validate and fetch URL with security checks
 */
async function secureFetch(url: string): Promise<Response> {
  const cloudCheck = isCloudMetadata(url);
  if (cloudCheck.isMetadata) {
    throw new CloudMetadataError(url, cloudCheck.provider);
  }

  const validation = await validateUrlWithDNS(url);
  if (!validation.valid) {
    throw new PrivateIPError(validation.resolvedIPs[0] ?? "unknown", url);
  }

  return fetch(url, {
    headers: {
      "User-Agent": "Vellum-DocLookup/1.0",
      Accept: "application/json",
    },
  });
}

/**
 * Truncate content to maxLength with marker
 */
function truncateContent(content: string, maxLength: number): { text: string; truncated: boolean } {
  if (content.length <= maxLength) {
    return { text: content, truncated: false };
  }
  return {
    text: `${content.slice(0, maxLength)}\n\n[... content truncated ...]`,
    truncated: true,
  };
}

// Source implementations will be added in T025-T028

/**
 * Look up documentation from MDN Web Docs
 */
async function lookupMDN(query: string, maxLength: number): Promise<DocLookupOutput> {
  // Search MDN API
  const searchUrl = `https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(query)}&locale=en-US`;
  const searchResponse = await secureFetch(searchUrl);

  if (!searchResponse.ok) {
    throw new Error(`MDN search failed: ${searchResponse.status}`);
  }

  const searchData = (await searchResponse.json()) as {
    documents: Array<{
      title: string;
      slug: string;
      summary: string;
    }>;
  };

  if (!searchData.documents || searchData.documents.length === 0) {
    throw new Error(`No MDN documentation found for: ${query}`);
  }

  // Get the first (most relevant) result - safe after length check
  const [doc] = searchData.documents;
  if (!doc) {
    throw new Error(`No MDN documentation found for: ${query}`);
  }
  const docUrl = `https://developer.mozilla.org/en-US/docs/${doc.slug}`;

  // Fetch the full document content
  const docResponse = await secureFetch(
    `https://developer.mozilla.org/api/v1/doc/en-US/${doc.slug}`
  );

  let content = doc.summary;
  if (docResponse.ok) {
    const docData = (await docResponse.json()) as {
      doc: {
        body: Array<{ type: string; value: { content: string } }>;
      };
    };

    // Extract prose content from the document
    if (docData.doc?.body) {
      const prose = docData.doc.body
        .filter((section) => section.type === "prose")
        .map((section) => section.value?.content ?? "")
        .join("\n\n");

      if (prose) {
        // Strip HTML tags for cleaner output
        content = prose.replace(/<[^>]*>/g, "").trim();
      }
    }
  }

  const { text, truncated } = truncateContent(content, maxLength);

  return {
    source: "mdn",
    title: doc.title,
    url: docUrl,
    content: text,
    truncated,
    metadata: {
      description: doc.summary,
    },
  };
}

/**
 * Look up package info from npm registry
 */
async function lookupNPM(packageName: string, maxLength: number): Promise<DocLookupOutput> {
  const apiUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
  const response = await secureFetch(apiUrl);

  if (response.status === 404) {
    throw new Error(`npm package not found: ${packageName}`);
  }

  if (!response.ok) {
    throw new Error(`npm registry error: ${response.status}`);
  }

  const data = (await response.json()) as {
    name: string;
    description?: string;
    "dist-tags"?: { latest?: string };
    versions?: Record<
      string,
      {
        readme?: string;
        author?: string | { name: string };
        license?: string;
      }
    >;
    readme?: string;
    author?: string | { name: string };
    license?: string;
  };

  const latestVersion = data["dist-tags"]?.latest;
  const versionData = latestVersion ? data.versions?.[latestVersion] : undefined;

  // Build content from package info
  let content = "";

  // README content (prioritize version-specific, then root)
  const readme = versionData?.readme ?? data.readme;
  if (readme) {
    content = readme;
  } else {
    content = data.description ?? "No description available.";
  }

  const { text, truncated } = truncateContent(content, maxLength);

  // Extract author name
  const authorRaw = versionData?.author ?? data.author;
  const author = typeof authorRaw === "string" ? authorRaw : authorRaw?.name;

  return {
    source: "npm",
    title: data.name,
    url: `https://www.npmjs.com/package/${packageName}`,
    content: text,
    truncated,
    metadata: {
      version: latestVersion,
      description: data.description,
      author,
      license: versionData?.license ?? data.license,
    },
  };
}

/**
 * Look up package info from PyPI
 */
async function lookupPyPI(packageName: string, maxLength: number): Promise<DocLookupOutput> {
  const apiUrl = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
  const response = await secureFetch(apiUrl);

  if (response.status === 404) {
    throw new Error(`PyPI package not found: ${packageName}`);
  }

  if (!response.ok) {
    throw new Error(`PyPI API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    info: {
      name: string;
      version: string;
      summary?: string;
      description?: string;
      description_content_type?: string;
      author?: string;
      author_email?: string;
      license?: string;
      home_page?: string;
      project_urls?: Record<string, string>;
    };
  };

  const info = data.info;

  // Build content - prefer full description, fall back to summary
  const content = info.description ?? info.summary ?? "No description available.";

  // If description is in reStructuredText or Markdown, it's likely the full README
  const { text, truncated } = truncateContent(content, maxLength);

  return {
    source: "pypi",
    title: info.name,
    url: `https://pypi.org/project/${packageName}/`,
    content: text,
    truncated,
    metadata: {
      version: info.version,
      description: info.summary,
      author: info.author ?? info.author_email,
      license: info.license,
    },
  };
}

/**
 * Look up README from GitHub repository
 */
async function lookupGitHub(repo: string, maxLength: number): Promise<DocLookupOutput> {
  // Validate repo format (owner/repo)
  if (!repo.includes("/") || repo.split("/").length !== 2) {
    throw new Error(`Invalid GitHub repo format. Expected 'owner/repo', got: ${repo}`);
  }

  // Try to get README via GitHub API
  const apiUrl = `https://api.github.com/repos/${repo}/readme`;
  const response = await secureFetch(apiUrl);

  if (response.status === 404) {
    throw new Error(`GitHub repository or README not found: ${repo}`);
  }

  if (response.status === 403) {
    // Rate limited - provide helpful error
    const resetHeader = response.headers.get("X-RateLimit-Reset");
    const resetTime = resetHeader
      ? new Date(parseInt(resetHeader, 10) * 1000).toISOString()
      : "unknown";
    throw new Error(`GitHub API rate limited. Resets at: ${resetTime}`);
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    name: string;
    path: string;
    content: string;
    encoding: string;
    html_url: string;
  };

  // Decode base64 content
  let content: string;
  if (data.encoding === "base64") {
    content = Buffer.from(data.content, "base64").toString("utf-8");
  } else {
    content = data.content;
  }

  const { text, truncated } = truncateContent(content, maxLength);

  // Get repo info for metadata
  let description: string | undefined;
  try {
    const repoResponse = await secureFetch(`https://api.github.com/repos/${repo}`);
    if (repoResponse.ok) {
      const repoData = (await repoResponse.json()) as {
        description?: string;
        license?: { name: string };
      };
      description = repoData.description ?? undefined;
    }
  } catch {
    // Ignore metadata fetch errors
  }

  return {
    source: "github",
    title: `${repo} - README`,
    url: data.html_url ?? `https://github.com/${repo}`,
    content: text,
    truncated,
    metadata: {
      description,
    },
  };
}

/**
 * doc_lookup tool - Look up documentation from various sources
 *
 * Supports MDN Web Docs, npm registry, PyPI, and GitHub repositories.
 * Each source has specific parameter requirements.
 *
 * @example
 * ```typescript
 * // MDN documentation lookup
 * const result = await docLookupTool.execute(
 *   { source: "mdn", query: "Array.map" },
 *   ctx
 * );
 *
 * // npm package lookup
 * const result = await docLookupTool.execute(
 *   { source: "npm", package: "zod" },
 *   ctx
 * );
 * ```
 */
export const docLookupTool = defineTool({
  name: "doc_lookup",
  description: `Look up documentation from MDN, npm, PyPI, or GitHub.
  
Examples:
- source: "mdn", query: "Array.map" - Look up MDN docs for Array.map
- source: "npm", package: "zod" - Look up npm package info for zod
- source: "pypi", package: "requests" - Look up PyPI package info
- source: "github", repo: "microsoft/vscode" - Look up GitHub repo README`,
  parameters: docLookupParamsSchema,
  kind: "read",
  category: "documentation",

  async execute(input, ctx): Promise<ToolResult<DocLookupOutput>> {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const { source, query, package: packageName, repo, maxLength } = input;

    // Check permission for network access
    const hasPermission = await ctx.checkPermission("network:read", source);
    if (!hasPermission) {
      return fail(`Permission denied: cannot access ${source} documentation`);
    }

    try {
      let result: DocLookupOutput;

      switch (source) {
        case "mdn":
          result = await lookupMDN(query ?? "", maxLength);
          break;
        case "npm":
          result = await lookupNPM(packageName ?? "", maxLength);
          break;
        case "pypi":
          result = await lookupPyPI(packageName ?? "", maxLength);
          break;
        case "github":
          result = await lookupGitHub(repo ?? "", maxLength);
          break;
      }

      const output = [
        `# ${result.title}`,
        `Source: ${result.source} | URL: ${result.url}`,
        result.metadata?.version ? `Version: ${result.metadata.version}` : "",
        result.metadata?.description ? `Description: ${result.metadata.description}` : "",
        "",
        result.content,
        result.truncated ? "\n⚠️ Content was truncated to fit maxLength" : "",
      ]
        .filter(Boolean)
        .join("\n");

      return ok({
        ...result,
        content: output,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(`doc_lookup failed: ${message}`);
    }
  },
});

// Export helper functions for use by source implementations
export { secureFetch, truncateContent };
