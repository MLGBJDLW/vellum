/**
 * Git Exclusion Patterns
 *
 * Provides comprehensive gitignore-style patterns for excluding
 * files and directories that should not be included in snapshots.
 *
 * @module git/exclusions
 */

// =============================================================================
// T008: Exclusion Patterns (150+ gitignore patterns)
// =============================================================================

/**
 * Returns a comprehensive array of exclusion patterns for git snapshots.
 *
 * These patterns follow gitignore syntax and cover:
 * - Build outputs and artifacts
 * - Package manager directories
 * - IDE and editor configurations
 * - OS-specific files
 * - Language-specific caches and outputs
 * - Security-sensitive files
 *
 * @returns Array of 150+ gitignore-style patterns
 *
 * @example
 * ```typescript
 * const patterns = getExclusionPatterns();
 * const ig = ignore().add(patterns);
 * const shouldIgnore = ig.ignores("node_modules/package/file.js"); // true
 * ```
 */
export function getExclusionPatterns(): string[] {
  return [
    // =========================================================================
    // Version Control
    // =========================================================================
    ".git",
    ".git/**",
    ".svn",
    ".svn/**",
    ".hg",
    ".hg/**",
    ".bzr",
    ".bzr/**",
    "CVS",
    "CVS/**",

    // =========================================================================
    // Node.js / JavaScript / TypeScript
    // =========================================================================
    "node_modules",
    "node_modules/**",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    ".npm",
    ".npm/**",
    ".pnpm-store",
    ".pnpm-store/**",
    ".yarn",
    ".yarn/**",
    ".pnp.*",
    "dist",
    "dist/**",
    "build",
    "build/**",
    "out",
    "out/**",
    ".next",
    ".next/**",
    ".nuxt",
    ".nuxt/**",
    ".output",
    ".output/**",
    ".cache",
    ".cache/**",
    ".parcel-cache",
    ".parcel-cache/**",
    ".turbo",
    ".turbo/**",
    ".vercel",
    ".vercel/**",
    ".netlify",
    ".netlify/**",
    "*.tsbuildinfo",
    ".eslintcache",
    ".stylelintcache",
    ".prettiercache",

    // =========================================================================
    // Python
    // =========================================================================
    "__pycache__",
    "__pycache__/**",
    "*.py[cod]",
    "*$py.class",
    "*.so",
    ".Python",
    ".pytest_cache",
    ".pytest_cache/**",
    ".mypy_cache",
    ".mypy_cache/**",
    ".ruff_cache",
    ".ruff_cache/**",
    ".pytype",
    ".pytype/**",
    ".coverage",
    ".coverage.*",
    "htmlcov",
    "htmlcov/**",
    ".tox",
    ".tox/**",
    ".nox",
    ".nox/**",
    ".hypothesis",
    ".hypothesis/**",
    ".venv",
    ".venv/**",
    "venv",
    "venv/**",
    "ENV",
    "ENV/**",
    "env",
    "env/**",
    ".env",
    ".env.*",
    "*.egg-info",
    "*.egg-info/**",
    ".eggs",
    ".eggs/**",
    "*.egg",
    "pip-log.txt",
    "pip-delete-this-directory.txt",
    "MANIFEST",
    ".pdm.toml",
    ".pdm-python",
    ".pdm-build",
    "__pypackages__",
    "__pypackages__/**",

    // =========================================================================
    // Java / JVM
    // =========================================================================
    "*.class",
    "*.jar",
    "*.war",
    "*.ear",
    "*.nar",
    "target",
    "target/**",
    ".gradle",
    ".gradle/**",
    "gradle-app.setting",
    "!gradle-wrapper.jar",
    ".gradletasknamecache",
    "*.log",
    "hs_err_pid*",
    "replay_pid*",
    ".mvn/timing.properties",
    ".mvn/wrapper/maven-wrapper.jar",

    // =========================================================================
    // Rust
    // =========================================================================
    "target/debug",
    "target/debug/**",
    "target/release",
    "target/release/**",
    "Cargo.lock",
    "*.rlib",
    "*.rmeta",

    // =========================================================================
    // Go
    // =========================================================================
    "*.exe",
    "*.exe~",
    "*.dll",
    "*.dylib",
    "go.sum",
    "vendor",
    "vendor/**",

    // =========================================================================
    // C / C++
    // =========================================================================
    "*.o",
    "*.obj",
    "*.a",
    "*.lib",
    "*.lo",
    "*.la",
    "*.lai",
    "*.dSYM",
    "*.dSYM/**",
    "*.su",
    "*.idb",
    "*.pdb",
    "cmake-build-*",
    "cmake-build-*/**",
    "CMakeFiles",
    "CMakeFiles/**",
    "CMakeCache.txt",
    "compile_commands.json",

    // =========================================================================
    // .NET / C#
    // =========================================================================
    "bin",
    "bin/**",
    "obj",
    "obj/**",
    "*.user",
    "*.suo",
    "*.userosscache",
    "*.sln.docstates",
    "packages",
    "packages/**",
    "*.nupkg",
    "*.snupkg",
    "project.lock.json",
    ".paket/paket.exe",

    // =========================================================================
    // Ruby
    // =========================================================================
    "*.gem",
    ".bundle",
    ".bundle/**",
    "Gemfile.lock",
    ".ruby-version",
    ".ruby-gemset",
    ".rvmrc",

    // =========================================================================
    // PHP
    // =========================================================================
    "composer.lock",

    // =========================================================================
    // Testing & Coverage
    // =========================================================================
    "coverage",
    "coverage/**",
    ".nyc_output",
    ".nyc_output/**",
    "lcov.info",
    "*.lcov",
    "test-results",
    "test-results/**",
    "junit*.xml",
    ".coverage",

    // =========================================================================
    // IDEs & Editors
    // =========================================================================
    ".idea",
    ".idea/**",
    ".vscode",
    ".vscode/**",
    "*.swp",
    "*.swo",
    "*~",
    ".project",
    ".classpath",
    ".settings",
    ".settings/**",
    "*.sublime-workspace",
    "*.sublime-project",
    ".atom",
    ".atom/**",
    "*.code-workspace",
    ".fleet",
    ".fleet/**",
    ".devcontainer",
    ".devcontainer/**",

    // =========================================================================
    // Operating System Files
    // =========================================================================
    ".DS_Store",
    ".DS_Store?",
    "._*",
    ".Spotlight-V100",
    ".Trashes",
    "ehthumbs.db",
    "Thumbs.db",
    "Desktop.ini",
    "$RECYCLE.BIN",
    "$RECYCLE.BIN/**",
    "*.lnk",

    // =========================================================================
    // Logs & Debugging
    // =========================================================================
    "logs",
    "logs/**",
    "*.log",
    "npm-debug.log*",
    "yarn-debug.log*",
    "yarn-error.log*",
    "lerna-debug.log*",
    ".pnpm-debug.log*",
    "debug.log",
    "*.stackdump",

    // =========================================================================
    // Temporary Files
    // =========================================================================
    "tmp",
    "tmp/**",
    "temp",
    "temp/**",
    "*.tmp",
    "*.temp",
    "*.bak",
    "*.backup",
    "*.orig",
    ".sass-cache",
    ".sass-cache/**",

    // =========================================================================
    // Security & Secrets
    // =========================================================================
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.cer",
    "*.crt",
    ".env.local",
    ".env.*.local",
    ".env.development",
    ".env.production",
    ".env.test",
    "secrets.json",
    "secrets.yaml",
    "secrets.yml",
    ".secrets",
    ".secrets/**",
    "*.secret",
    "credentials.json",
    "service-account*.json",

    // =========================================================================
    // Docker
    // =========================================================================
    ".docker",
    ".docker/**",
    "docker-compose.override.yml",
    "*.dockerfile.dockerignore",

    // =========================================================================
    // Terraform / Infrastructure
    // =========================================================================
    ".terraform",
    ".terraform/**",
    "*.tfstate",
    "*.tfstate.*",
    "crash.log",
    "crash.*.log",
    "*.tfvars",
    "*.tfvars.json",
    "override.tf",
    "override.tf.json",
    "*_override.tf",
    "*_override.tf.json",
    ".terraformrc",
    "terraform.rc",

    // =========================================================================
    // Kubernetes
    // =========================================================================
    "kubeconfig",
    ".kube",
    ".kube/**",

    // =========================================================================
    // Mobile Development
    // =========================================================================
    ".expo",
    ".expo/**",
    "*.apk",
    "*.aab",
    "*.ipa",
    "*.dSYM.zip",
    "*.xcuserstate",
    "Pods",
    "Pods/**",
    "DerivedData",
    "DerivedData/**",
    "*.hmap",
    "*.ipa",
    "*.xcworkspace",

    // =========================================================================
    // Databases
    // =========================================================================
    "*.sqlite",
    "*.sqlite3",
    "*.db",
    "*.db-journal",
    "*.db-shm",
    "*.db-wal",
    "*.mdb",
    "*.ldb",

    // =========================================================================
    // Archives & Binaries
    // =========================================================================
    "*.zip",
    "*.tar",
    "*.tar.gz",
    "*.tgz",
    "*.rar",
    "*.7z",
    "*.dmg",
    "*.iso",
    "*.img",

    // =========================================================================
    // Large Media Files (often too large for git)
    // =========================================================================
    "*.mp4",
    "*.mov",
    "*.avi",
    "*.mkv",
    "*.mp3",
    "*.wav",
    "*.flac",
    "*.psd",
    "*.ai",

    // =========================================================================
    // Vellum-Specific
    // =========================================================================
    ".ouroboros",
    ".ouroboros/**",
    ".vellum",
    ".vellum/**",
    ".vellum-snapshots",
    ".vellum-snapshots/**",

    // =========================================================================
    // Miscellaneous
    // =========================================================================
    ".history",
    ".history/**",
    ".ionide",
    ".ionide/**",
    "*.pid",
    "*.seed",
    ".node_repl_history",
    ".yarn-integrity",
    ".fusebox",
    ".fusebox/**",
    ".dynamodb",
    ".dynamodb/**",
    ".serverless",
    ".serverless/**",
    ".webpack",
    ".webpack/**",
  ];
}

/**
 * Returns a minimal set of exclusion patterns for fast snapshots.
 *
 * Use this when performance is critical and you only need to exclude
 * the most common large directories.
 *
 * @returns Array of ~20 essential patterns
 */
export function getMinimalExclusionPatterns(): string[] {
  return [
    // Version control
    ".git",
    ".git/**",

    // Package managers
    "node_modules",
    "node_modules/**",
    ".pnpm-store",
    ".pnpm-store/**",

    // Build outputs
    "dist",
    "dist/**",
    "build",
    "build/**",
    "out",
    "out/**",

    // Python
    "__pycache__",
    "__pycache__/**",
    ".venv",
    ".venv/**",
    "venv",
    "venv/**",

    // Testing
    "coverage",
    "coverage/**",
    ".nyc_output",
    ".nyc_output/**",

    // IDE
    ".idea",
    ".idea/**",
  ];
}
