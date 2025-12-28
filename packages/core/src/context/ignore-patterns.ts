/**
 * Default Ignore Patterns for Context Management
 *
 * Patterns for excluding files from context gathering.
 * Uses gitignore-style syntax:
 * - Trailing `/` matches directories
 * - `*` matches any characters except `/`
 * - `**` matches any characters including `/`
 * - `!` prefix negates a pattern
 *
 * @module @vellum/core/context
 */

/**
 * Default patterns to exclude from context (similar to .gitignore).
 *
 * These patterns filter out files that are typically not useful for
 * LLM context: dependencies, build outputs, binaries, etc.
 *
 * @example
 * ```typescript
 * import { DEFAULT_IGNORE_PATTERNS } from './ignore-patterns';
 *
 * const manager = new IgnoreManager({
 *   customPatterns: [...DEFAULT_IGNORE_PATTERNS, 'my-custom-dir/'],
 * });
 * ```
 */
export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  // === Version Control ===
  ".git/",
  ".svn/",
  ".hg/",

  // === Dependencies ===
  "node_modules/",
  "vendor/",
  ".pnpm/",
  ".pnpm-store/",
  "bower_components/",

  // === Build Outputs ===
  "dist/",
  "build/",
  "out/",
  ".next/",
  ".nuxt/",
  ".output/",
  "target/", // Rust/Java
  "__pycache__/", // Python
  "*.pyc",
  ".pytest_cache/",

  // === IDE/Editor ===
  ".idea/",
  ".vscode/",
  "*.swp",
  "*.swo",
  "*~",
  ".DS_Store",
  "Thumbs.db",

  // === Logs & Cache ===
  "*.log",
  "logs/",
  ".cache/",
  ".temp/",
  ".tmp/",

  // === Sensitive Files ===
  ".env",
  ".env.*",
  ".env.local",
  ".env.*.local",
  "*.pem",
  "*.key",
  "*.crt",
  ".npmrc",
  ".yarnrc",

  // === Lock Files (low readability) ===
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Cargo.lock",
  "poetry.lock",
  "Gemfile.lock",

  // === Binary & Media ===
  "*.exe",
  "*.dll",
  "*.so",
  "*.dylib",
  "*.bin",
  "*.jpg",
  "*.jpeg",
  "*.png",
  "*.gif",
  "*.ico",
  "*.svg",
  "*.mp3",
  "*.mp4",
  "*.mov",
  "*.avi",
  "*.pdf",
  "*.zip",
  "*.tar",
  "*.gz",
  "*.tar.gz",
  "*.rar",

  // === Minified/Bundled Code ===
  "*.min.js",
  "*.min.css",
  "*.bundle.js",
  "*.chunk.js",
  "*.map",

  // === Test Coverage ===
  "coverage/",
  ".nyc_output/",
  "htmlcov/",
] as const;

/**
 * Commonly used patterns for specific project types.
 * These can be added to customPatterns when needed.
 */
export const PROJECT_TYPE_PATTERNS = {
  /** Additional patterns for Node.js projects */
  node: [".npm/", ".yarn/", ".node_modules.cache/"],

  /** Additional patterns for Python projects */
  python: ["*.egg-info/", ".eggs/", ".tox/", ".venv/", "venv/", ".mypy_cache/"],

  /** Additional patterns for Rust projects */
  rust: ["target/", "Cargo.lock"],

  /** Additional patterns for Go projects */
  go: ["go.sum", "vendor/"],

  /** Additional patterns for Java projects */
  java: ["*.class", "*.jar", ".gradle/", ".mvn/"],
} as const;
