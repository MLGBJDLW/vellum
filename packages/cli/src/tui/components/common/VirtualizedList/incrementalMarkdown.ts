/**
 * Incremental Markdown Parsing
 *
 * 增量解析 Markdown，避免全量重新渲染。
 *
 * 策略:
 * - 块级缓存: 按段落/代码块/列表等块级元素缓存
 * - 差异检测: 只重新解析变化的块
 * - 流式支持: 特殊处理最后一个 "不完整" 块
 *
 * @module tui/components/common/VirtualizedList/incrementalMarkdown
 */

import { useCallback, useMemo, useRef, useState } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Markdown 块类型
 */
export type MarkdownBlockType =
  | "paragraph"
  | "heading"
  | "code"
  | "list"
  | "blockquote"
  | "hr"
  | "table"
  | "incomplete"; // 流式时最后一个未完成的块

/**
 * 解析后的内容 (可用于渲染)
 */
export interface ParsedContent {
  /** 渲染类型 */
  renderType: "text" | "code" | "heading" | "list" | "quote" | "hr" | "table";
  /** 文本内容 */
  text?: string;
  /** 代码块信息 */
  code?: { language: string; content: string };
  /** 标题级别 (1-6) */
  level?: number;
  /** 列表项 */
  items?: string[];
  /** 表格数据 */
  table?: { headers: string[]; rows: string[][] };
}

/**
 * 解析后的块
 */
export interface MarkdownBlock {
  /** 唯一 ID (基于内容 hash 或行号) */
  id: string;
  /** 块类型 */
  type: MarkdownBlockType;
  /** 原始内容 */
  raw: string;
  /** 解析后的内容 (可用于渲染) */
  parsed: ParsedContent;
  /** 行号范围 [start, end] (0-indexed, inclusive) */
  lineRange: [number, number];
}

/**
 * 增量解析配置
 */
export interface IncrementalMarkdownConfig {
  /** 缓存大小限制 (块数) */
  maxCacheSize: number;
  /** 是否启用流式模式 */
  streamingMode: boolean;
  /** 块 ID 使用 hash 还是行号 */
  blockIdStrategy: "hash" | "line";
}

/**
 * 默认配置
 */
export const DEFAULT_INCREMENTAL_MARKDOWN_CONFIG: IncrementalMarkdownConfig = {
  maxCacheSize: 500,
  streamingMode: true,
  blockIdStrategy: "hash",
};

/**
 * 解析结果
 */
export interface ParseResult {
  /** 所有块 */
  blocks: MarkdownBlock[];
  /** 本次变化的块 ID */
  changedBlockIds: string[];
  /** 新增的块 ID */
  addedBlockIds: string[];
  /** 删除的块 ID */
  removedBlockIds: string[];
  /** 缓存命中率 (0-1) */
  cacheHitRate: number;
}

// ============================================================================
// Constants
// ============================================================================

/** 代码块围栏正则 (``` 或 ~~~) */
const CODE_FENCE_REGEX = /^(`{3,}|~{3,})(\w*)?$/;

/** 标题正则 (# to ######) */
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/;

/** 列表项正则 (-, *, +, 或数字.) */
const LIST_ITEM_REGEX = /^(\s*)([-*+]|\d+\.)\s+(.+)$/;

/** 引用正则 */
const BLOCKQUOTE_REGEX = /^>\s?(.*)$/;

/** 水平线正则 */
const HR_REGEX = /^(-{3,}|\*{3,}|_{3,})$/;

/** 表格分隔行正则 */
const TABLE_SEPARATOR_REGEX = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/;

/** 表格行正则 */
const TABLE_ROW_REGEX = /^\|(.+)\|$/;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 生成简单的字符串 hash (djb2 算法)
 *
 * @param str - 输入字符串
 * @returns 32 位 hash 值的十六进制字符串
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + char
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

/**
 * 生成块 ID
 *
 * @param raw - 原始内容
 * @param strategy - ID 策略
 * @param lineStart - 起始行号
 * @returns 唯一 ID
 */
export function generateBlockId(raw: string, strategy: "hash" | "line", lineStart: number): string {
  if (strategy === "line") {
    return `line-${lineStart}`;
  }
  return `hash-${simpleHash(raw)}`;
}

/**
 * 识别块类型
 *
 * @param raw - 原始内容 (可能多行)
 * @returns 块类型
 */
export function identifyBlockType(raw: string): MarkdownBlockType {
  const lines = raw.split("\n");
  const firstLine = lines[0]?.trim() ?? "";

  // 代码块 (以 ``` 或 ~~~ 开头)
  if (CODE_FENCE_REGEX.test(firstLine)) {
    return "code";
  }

  // 标题
  if (HEADING_REGEX.test(firstLine)) {
    return "heading";
  }

  // 水平线
  if (HR_REGEX.test(firstLine) && lines.length === 1) {
    return "hr";
  }

  // 引用
  if (BLOCKQUOTE_REGEX.test(firstLine)) {
    return "blockquote";
  }

  // 列表
  if (LIST_ITEM_REGEX.test(firstLine)) {
    return "list";
  }

  // 表格 (检查是否有分隔行)
  if (lines.length >= 2) {
    const hasTableSeparator = lines.some((line) => TABLE_SEPARATOR_REGEX.test(line.trim()));
    if (hasTableSeparator && TABLE_ROW_REGEX.test(firstLine)) {
      return "table";
    }
  }

  // 默认为段落
  return "paragraph";
}

/**
 * 将内容分割成块级原始字符串
 *
 * 分割规则:
 * - 空行分隔段落
 * - ``` 围栏分隔代码块
 * - 连续的列表项合并为一个块
 * - 连续的引用行合并为一个块
 *
 * @param content - 完整 Markdown 内容
 * @returns 块级原始字符串数组，每项包含 raw 和 lineStart
 */
export function splitIntoBlocks(content: string): Array<{ raw: string; lineStart: number }> {
  const lines = content.split("\n");
  const blocks: Array<{ raw: string; lineStart: number }> = [];

  let currentBlock: string[] = [];
  let currentBlockStart = 0;
  let inCodeFence = false;
  let codeFenceChar = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmedLine = line.trim();

    // 处理代码围栏
    const fenceMatch = trimmedLine.match(CODE_FENCE_REGEX);
    if (fenceMatch) {
      const fenceChar = fenceMatch[1]?.[0] ?? "`";

      if (!inCodeFence) {
        // 进入代码块 - 先保存之前的块
        if (currentBlock.length > 0) {
          const raw = currentBlock.join("\n");
          if (raw.trim()) {
            blocks.push({ raw, lineStart: currentBlockStart });
          }
        }
        currentBlock = [line];
        currentBlockStart = i;
        inCodeFence = true;
        codeFenceChar = fenceChar;
      } else if (fenceChar === codeFenceChar) {
        // 退出代码块
        currentBlock.push(line);
        blocks.push({ raw: currentBlock.join("\n"), lineStart: currentBlockStart });
        currentBlock = [];
        currentBlockStart = i + 1;
        inCodeFence = false;
        codeFenceChar = "";
      } else {
        // 代码块内的其他围栏字符
        currentBlock.push(line);
      }
      continue;
    }

    // 在代码块内，直接添加
    if (inCodeFence) {
      currentBlock.push(line);
      continue;
    }

    // 空行分隔
    if (trimmedLine === "") {
      if (currentBlock.length > 0) {
        const raw = currentBlock.join("\n");
        if (raw.trim()) {
          blocks.push({ raw, lineStart: currentBlockStart });
        }
        currentBlock = [];
      }
      currentBlockStart = i + 1;
      continue;
    }

    // 标题独立成块
    if (HEADING_REGEX.test(trimmedLine)) {
      if (currentBlock.length > 0) {
        const raw = currentBlock.join("\n");
        if (raw.trim()) {
          blocks.push({ raw, lineStart: currentBlockStart });
        }
      }
      blocks.push({ raw: line, lineStart: i });
      currentBlock = [];
      currentBlockStart = i + 1;
      continue;
    }

    // 水平线独立成块
    if (HR_REGEX.test(trimmedLine)) {
      if (currentBlock.length > 0) {
        const raw = currentBlock.join("\n");
        if (raw.trim()) {
          blocks.push({ raw, lineStart: currentBlockStart });
        }
      }
      blocks.push({ raw: line, lineStart: i });
      currentBlock = [];
      currentBlockStart = i + 1;
      continue;
    }

    // 其他行累积到当前块
    if (currentBlock.length === 0) {
      currentBlockStart = i;
    }
    currentBlock.push(line);
  }

  // 处理剩余内容
  if (currentBlock.length > 0) {
    const raw = currentBlock.join("\n");
    if (raw.trim() || inCodeFence) {
      blocks.push({ raw, lineStart: currentBlockStart });
    }
  }

  return blocks;
}

/**
 * 解析代码块
 *
 * @param raw - 原始代码块内容
 * @returns 代码信息
 */
function parseCodeBlock(raw: string): { language: string; content: string } {
  const lines = raw.split("\n");
  const firstLine = lines[0] ?? "";
  const fenceMatch = firstLine.match(CODE_FENCE_REGEX);

  const language = fenceMatch?.[2] ?? "";

  // 移除首尾围栏
  const contentLines = lines.slice(1);
  // 检查最后一行是否是围栏
  const lastLine = contentLines[contentLines.length - 1] ?? "";
  if (CODE_FENCE_REGEX.test(lastLine.trim())) {
    contentLines.pop();
  }

  return {
    language,
    content: contentLines.join("\n"),
  };
}

/**
 * 解析标题
 *
 * @param raw - 原始标题行
 * @returns 标题信息
 */
function parseHeading(raw: string): { level: number; text: string } {
  const match = raw.trim().match(HEADING_REGEX);
  if (match) {
    return {
      level: match[1]?.length ?? 1,
      text: match[2] ?? "",
    };
  }
  return { level: 1, text: raw };
}

/**
 * 解析列表
 *
 * @param raw - 原始列表内容
 * @returns 列表项数组
 */
function parseList(raw: string): string[] {
  const lines = raw.split("\n");
  const items: string[] = [];

  for (const line of lines) {
    const match = line.match(LIST_ITEM_REGEX);
    if (match) {
      items.push(match[3] ?? "");
    } else if (items.length > 0 && line.trim()) {
      // 续行内容追加到最后一项
      items[items.length - 1] += ` ${line.trim()}`;
    }
  }

  return items;
}

/**
 * 解析引用
 *
 * @param raw - 原始引用内容
 * @returns 引用文本
 */
function parseBlockquote(raw: string): string {
  const lines = raw.split("\n");
  return lines
    .map((line) => {
      const match = line.match(BLOCKQUOTE_REGEX);
      return match?.[1] ?? line;
    })
    .join("\n");
}

/**
 * 解析表格
 *
 * @param raw - 原始表格内容
 * @returns 表格数据
 */
function parseTable(raw: string): { headers: string[]; rows: string[][] } {
  const lines = raw.split("\n").filter((line) => line.trim());

  // 解析单行
  const parseRow = (line: string): string[] => {
    // 移除首尾的 |
    const trimmed = line.trim().replace(/^\||\|$/g, "");
    return trimmed.split("|").map((cell) => cell.trim());
  };

  const headers: string[] = [];
  const rows: string[][] = [];
  let headerParsed = false;

  for (const line of lines) {
    // 跳过分隔行
    if (TABLE_SEPARATOR_REGEX.test(line.trim())) {
      headerParsed = true;
      continue;
    }

    const cells = parseRow(line);
    if (!headerParsed) {
      headers.push(...cells);
    } else {
      rows.push(cells);
    }
  }

  return { headers, rows };
}

/**
 * 解析单个块
 *
 * @param raw - 原始内容
 * @param type - 块类型
 * @returns 解析后的内容
 */
export function parseBlock(raw: string, type: MarkdownBlockType): ParsedContent {
  switch (type) {
    case "code": {
      const codeInfo = parseCodeBlock(raw);
      return {
        renderType: "code",
        code: codeInfo,
      };
    }

    case "heading": {
      const headingInfo = parseHeading(raw);
      return {
        renderType: "heading",
        text: headingInfo.text,
        level: headingInfo.level,
      };
    }

    case "list": {
      return {
        renderType: "list",
        items: parseList(raw),
      };
    }

    case "blockquote": {
      return {
        renderType: "quote",
        text: parseBlockquote(raw),
      };
    }

    case "hr": {
      return {
        renderType: "hr",
      };
    }

    case "table": {
      return {
        renderType: "table",
        table: parseTable(raw),
      };
    }

    default: {
      return {
        renderType: "text",
        text: raw,
      };
    }
  }
}

// ============================================================================
// Core Incremental Parsing
// ============================================================================

/**
 * 增量解析 Markdown 内容
 *
 * @param content - 完整 Markdown 内容
 * @param previousBlocks - 上一次解析的块 (用于差异检测)
 * @param config - 解析配置
 * @returns 解析结果
 */
export function parseMarkdownIncrementally(
  content: string,
  previousBlocks: MarkdownBlock[],
  config?: Partial<IncrementalMarkdownConfig>
): ParseResult {
  const mergedConfig = { ...DEFAULT_INCREMENTAL_MARKDOWN_CONFIG, ...config };
  const { streamingMode, blockIdStrategy } = mergedConfig;

  // 构建上一次的块索引 (raw -> block)
  const prevBlockMap = new Map<string, MarkdownBlock>();
  for (const block of previousBlocks) {
    prevBlockMap.set(block.raw, block);
  }

  // 分割内容为块
  const rawBlocks = splitIntoBlocks(content);

  // 解析每个块
  const blocks: MarkdownBlock[] = [];
  const changedBlockIds: string[] = [];
  const addedBlockIds: string[] = [];
  let cacheHits = 0;

  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i];
    if (!block) continue;
    const { raw, lineStart } = block;
    const isLastBlock = i === rawBlocks.length - 1;

    // 检查缓存命中
    const cachedBlock = prevBlockMap.get(raw);

    if (cachedBlock && !(streamingMode && isLastBlock)) {
      // 缓存命中 - 复用解析结果，更新行号
      cacheHits++;
      const block: MarkdownBlock = {
        ...cachedBlock,
        lineRange: [lineStart, lineStart + raw.split("\n").length - 1],
      };
      blocks.push(block);
    } else {
      // 需要解析
      const type = streamingMode && isLastBlock ? "incomplete" : identifyBlockType(raw);
      const parsed = parseBlock(raw, type === "incomplete" ? identifyBlockType(raw) : type);
      const id = generateBlockId(raw, blockIdStrategy, lineStart);
      const lineCount = raw.split("\n").length;

      const block: MarkdownBlock = {
        id,
        type,
        raw,
        parsed,
        lineRange: [lineStart, lineStart + lineCount - 1],
      };

      blocks.push(block);

      // 分类变化
      if (cachedBlock) {
        changedBlockIds.push(id);
      } else {
        addedBlockIds.push(id);
      }
    }
  }

  // 检测删除的块
  const currentRawSet = new Set(rawBlocks.map((b) => b.raw));
  const removedBlockIds = previousBlocks
    .filter((block) => !currentRawSet.has(block.raw))
    .map((block) => block.id);

  // 计算缓存命中率
  const cacheHitRate = rawBlocks.length > 0 ? cacheHits / rawBlocks.length : 1;

  return {
    blocks,
    changedBlockIds,
    addedBlockIds,
    removedBlockIds,
    cacheHitRate,
  };
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * useIncrementalMarkdown 返回值
 */
export interface UseIncrementalMarkdownReturn {
  /** 解析后的块 */
  blocks: MarkdownBlock[];
  /** 本次变化的块 ID Set */
  changedBlockIds: Set<string>;
  /** 是否处于流式模式 (最后一个块不完整) */
  isStreaming: boolean;
  /** 缓存命中率 */
  cacheHitRate: number;
  /** 强制重新解析 (清空缓存) */
  invalidateCache: () => void;
}

/**
 * 增量 Markdown 解析 Hook
 *
 * @param content - Markdown 内容
 * @param config - 解析配置
 * @returns 解析结果和控制函数
 *
 * @example
 * ```tsx
 * function MarkdownRenderer({ content }: { content: string }) {
 *   const { blocks, changedBlockIds, isStreaming } = useIncrementalMarkdown(content, {
 *     streamingMode: true,
 *   });
 *
 *   return (
 *     <>
 *       {blocks.map((block) => (
 *         <BlockRenderer
 *           key={block.id}
 *           block={block}
 *           shouldAnimate={changedBlockIds.has(block.id)}
 *         />
 *       ))}
 *     </>
 *   );
 * }
 * ```
 */
export function useIncrementalMarkdown(
  content: string,
  config?: Partial<IncrementalMarkdownConfig>
): UseIncrementalMarkdownReturn {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_INCREMENTAL_MARKDOWN_CONFIG, ...config }),
    [config]
  );

  // 上一次的块列表
  const prevBlocksRef = useRef<MarkdownBlock[]>([]);

  // 缓存版本号 (用于强制重新解析)
  const [cacheVersion, setCacheVersion] = useState(0);

  // 增量解析
  const parseResult = useMemo(() => {
    // cacheVersion 变化时，传入空数组强制重新解析
    const previousBlocks = cacheVersion > 0 ? [] : prevBlocksRef.current;
    const result = parseMarkdownIncrementally(content, previousBlocks, mergedConfig);

    // 更新缓存
    prevBlocksRef.current = result.blocks;

    return result;
  }, [content, mergedConfig, cacheVersion]);

  // 变化的块 ID Set
  const changedBlockIds = useMemo(
    () => new Set([...parseResult.changedBlockIds, ...parseResult.addedBlockIds]),
    [parseResult.changedBlockIds, parseResult.addedBlockIds]
  );

  // 是否处于流式模式
  const isStreaming = useMemo(
    () =>
      mergedConfig.streamingMode &&
      parseResult.blocks.length > 0 &&
      parseResult.blocks[parseResult.blocks.length - 1]?.type === "incomplete",
    [mergedConfig.streamingMode, parseResult.blocks]
  );

  // 强制重新解析
  const invalidateCache = useCallback(() => {
    prevBlocksRef.current = [];
    setCacheVersion((v) => v + 1);
  }, []);

  return {
    blocks: parseResult.blocks,
    changedBlockIds,
    isStreaming,
    cacheHitRate: parseResult.cacheHitRate,
    invalidateCache,
  };
}

// ============================================================================
// Render Helpers
// ============================================================================

/**
 * 判断块是否需要重新渲染
 *
 * @param blockId - 块 ID
 * @param changedBlockIds - 变化的块 ID Set
 * @param previousRenderTime - 上次渲染时间 (用于防止过于频繁的重渲染)
 * @returns 是否需要重新渲染
 */
export function shouldRerenderBlock(
  blockId: string,
  changedBlockIds: Set<string>,
  previousRenderTime?: number
): boolean {
  // 如果在变化集合中，需要重新渲染
  if (changedBlockIds.has(blockId)) {
    return true;
  }

  // 如果有上次渲染时间，检查是否需要节流
  if (previousRenderTime !== undefined) {
    const MIN_RERENDER_INTERVAL = 16; // ~60fps
    const elapsed = Date.now() - previousRenderTime;
    if (elapsed < MIN_RERENDER_INTERVAL) {
      return false;
    }
  }

  return false;
}
