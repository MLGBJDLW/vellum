import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

// 获取所有 md 文件
function getMdFiles(dir, files = []) {
  const items = readdirSync(dir);
  for (const item of items) {
    const path = join(dir, item);
    if (item === "node_modules" || item === ".git" || item === ".github") continue;
    if (statSync(path).isDirectory()) {
      getMdFiles(path, files);
    } else if (extname(path) === ".md") {
      files.push(path);
    }
  }
  return files;
}

// 推断代码块语言
function inferLanguage(code) {
  const trimmed = code.trim();
  // JSON
  if (/^\s*[{[]/.test(trimmed) && /"[\w]+"\s*:/.test(trimmed)) return "json";
  // TypeScript/JavaScript
  if (/^(import|export|const|let|var|interface|type|function|class|async)\s/.test(trimmed))
    return "typescript";
  if (/=>\s*{/.test(trimmed) || /\.tsx?['"]/.test(trimmed)) return "typescript";
  // Bash/Shell
  if (/^(npm|pnpm|yarn|bun|vellum|git|cd|mkdir|curl|wget|brew|apt|pip)\s/.test(trimmed))
    return "bash";
  if (/^\$\s/.test(trimmed)) return "bash";
  if (/^#!\//.test(trimmed)) return "bash";
  // YAML
  if (/^[\w-]+:\s/.test(trimmed) && !trimmed.includes("{")) return "yaml";
  // Markdown
  if (/^#+\s/.test(trimmed) || /^\*\*/.test(trimmed)) return "markdown";
  // HTML
  if (/^<[\w!]/.test(trimmed)) return "html";
  // CSS
  if (/^\s*\.\w+\s*\{/.test(trimmed) || /^@(import|media|keyframes)/.test(trimmed)) return "css";
  // Plain text (diagrams, ASCII art)
  if (/^[┌┐└┘│─├┤┬┴┼╭╮╯╰]/.test(trimmed)) return "text";
  // Default
  return "text";
}

// 修复单个文件
function fixFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  let fixed = 0;

  // 匹配没有语言的代码块: ``` followed by newline (possibly with tabs/spaces before)
  // Pattern: ``` at line start or after whitespace, NOT followed by a language identifier
  const newContent = content.replace(
    /^([ \t]*)```[ \t]*\r?\n([\s\S]*?)^([ \t]*)```/gm,
    (_match, indent1, code, indent2) => {
      // Check if this is already a code block with language (would have been ``` followed by non-whitespace)
      const lang = inferLanguage(code);
      fixed++;
      return `${indent1}\`\`\`${lang}\n${code}${indent2}\`\`\``;
    }
  );

  if (fixed > 0) {
    writeFileSync(filePath, newContent);
    console.log(`✓ ${filePath}: ${fixed} code blocks fixed`);
  }
  return fixed;
}

// 主函数
const files = getMdFiles("docs").concat(getMdFiles("packages"));
let totalFixed = 0;
for (const file of files) {
  totalFixed += fixFile(file);
}
console.log(`\nTotal: ${totalFixed} code blocks fixed in ${files.length} files`);
