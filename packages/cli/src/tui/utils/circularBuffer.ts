/**
 * Circular Buffer - Bounded message history storage
 *
 * Provides FIFO eviction when capacity is reached, supporting
 * immutable operations and eviction callbacks for export/backup.
 *
 * @module circularBuffer
 */

import { useMemo, useState } from "react";

/**
 * 循环缓冲区配置
 */
export interface CircularBufferConfig<T> {
  /** 最大容量 */
  maxSize: number;
  /** 淘汰回调（在移除元素前调用） */
  onEvict?: (items: T[]) => void;
  /** 批量淘汰阈值（默认: maxSize * 0.1） */
  evictBatchSize?: number;
}

/**
 * 不可变循环缓冲区
 *
 * 使用场景：消息历史、日志缓冲等需要有界存储的场景
 *
 * @example
 * const buffer = createCircularBuffer<Message>({ maxSize: 500 });
 * const newBuffer = buffer.push(message);
 * const messages = newBuffer.toArray();
 */
export interface CircularBuffer<T> {
  /** 当前元素数量 */
  readonly size: number;
  /** 最大容量 */
  readonly maxSize: number;
  /** 是否已满 */
  readonly isFull: boolean;
  /** 是否为空 */
  readonly isEmpty: boolean;

  /** 添加元素到末尾（可能触发淘汰） */
  push(item: T): CircularBuffer<T>;

  /** 批量添加元素 */
  pushMany(items: T[]): CircularBuffer<T>;

  /** 获取指定索引的元素（0 = 最老，size-1 = 最新） */
  get(index: number): T | undefined;

  /** 获取第一个元素（最老） */
  first(): T | undefined;

  /** 获取最后一个元素（最新） */
  last(): T | undefined;

  /** 转换为数组（从旧到新排序） */
  toArray(): T[];

  /** 正向遍历（从旧到新） */
  forEach(callback: (item: T, index: number) => void): void;

  /** 查找元素 */
  find(predicate: (item: T) => boolean): T | undefined;

  /** 过滤元素（返回新缓冲区） */
  filter(predicate: (item: T) => boolean): CircularBuffer<T>;

  /** 映射元素 */
  map<U>(mapper: (item: T, index: number) => U): U[];

  /** 清空缓冲区 */
  clear(): CircularBuffer<T>;

  /** 更新最大容量（可能触发淘汰） */
  resize(newMaxSize: number): CircularBuffer<T>;
}

/**
 * 内部实现：从数组创建缓冲区
 */
function createBufferFromArray<T>(
  items: T[],
  maxSize: number,
  onEvict?: (items: T[]) => void,
  evictBatchSize: number = Math.max(1, Math.floor(maxSize * 0.1))
): CircularBuffer<T> {
  // 如果超出容量，触发淘汰
  let currentItems = items;
  if (items.length > maxSize) {
    const evictCount = items.length - maxSize;
    const evictedItems = items.slice(0, evictCount);

    if (onEvict && evictedItems.length > 0) {
      onEvict(evictedItems);
    }

    currentItems = items.slice(evictCount);
  }

  const buffer: CircularBuffer<T> = {
    size: currentItems.length,
    maxSize,
    isFull: currentItems.length >= maxSize,
    isEmpty: currentItems.length === 0,

    push(item: T): CircularBuffer<T> {
      const newItems = [...currentItems, item];
      return createBufferFromArray(newItems, maxSize, onEvict, evictBatchSize);
    },

    pushMany(newItems: T[]): CircularBuffer<T> {
      const combined = [...currentItems, ...newItems];
      return createBufferFromArray(combined, maxSize, onEvict, evictBatchSize);
    },

    get(index: number): T | undefined {
      if (index < 0 || index >= currentItems.length) return undefined;
      return currentItems[index];
    },

    first(): T | undefined {
      return currentItems[0];
    },

    last(): T | undefined {
      return currentItems[currentItems.length - 1];
    },

    toArray(): T[] {
      return [...currentItems];
    },

    forEach(callback: (item: T, index: number) => void): void {
      currentItems.forEach(callback);
    },

    find(predicate: (item: T) => boolean): T | undefined {
      return currentItems.find(predicate);
    },

    filter(predicate: (item: T) => boolean): CircularBuffer<T> {
      const filtered = currentItems.filter(predicate);
      return createBufferFromArray(filtered, maxSize, onEvict, evictBatchSize);
    },

    map<U>(mapper: (item: T, index: number) => U): U[] {
      return currentItems.map(mapper);
    },

    clear(): CircularBuffer<T> {
      return createBufferFromArray([], maxSize, onEvict, evictBatchSize);
    },

    resize(newMaxSize: number): CircularBuffer<T> {
      return createBufferFromArray(
        currentItems,
        newMaxSize,
        onEvict,
        Math.max(1, Math.floor(newMaxSize * 0.1))
      );
    },
  };

  return buffer;
}

/**
 * 创建循环缓冲区
 */
export function createCircularBuffer<T>(config: CircularBufferConfig<T>): CircularBuffer<T> {
  const { maxSize, onEvict, evictBatchSize = Math.max(1, Math.floor(maxSize * 0.1)) } = config;

  return createBufferFromArray([], maxSize, onEvict, evictBatchSize);
}

/**
 * 消息缓冲区配置（预设）
 */
export const MESSAGE_BUFFER_DEFAULTS = {
  maxMessages: 500,
  evictBatchSize: 50,
  warningThreshold: 0.9, // 90% 时警告
} as const;

/**
 * 创建消息专用的循环缓冲区
 */
export function createMessageBuffer<T>(
  options: {
    maxSize?: number;
    onEvict?: (items: T[]) => void;
    onWarning?: (currentSize: number, maxSize: number) => void;
  } = {}
): CircularBuffer<T> {
  const maxSize = options.maxSize ?? MESSAGE_BUFFER_DEFAULTS.maxMessages;

  return createCircularBuffer({
    maxSize,
    onEvict: options.onEvict,
    evictBatchSize: MESSAGE_BUFFER_DEFAULTS.evictBatchSize,
  });
}

/**
 * React Hook 操作接口
 */
export interface CircularBufferActions<T> {
  push: (item: T) => void;
  pushMany: (items: T[]) => void;
  clear: () => void;
  resize: (newMaxSize: number) => void;
}

/**
 * React Hook: 使用循环缓冲区管理状态
 *
 * @example
 * const [buffer, { push, clear }] = useCircularBuffer<Message>({ maxSize: 500 });
 *
 * // 添加消息
 * push(newMessage);
 *
 * // 渲染消息列表
 * buffer.toArray().map(msg => <MessageItem key={msg.id} message={msg} />)
 */
export function useCircularBuffer<T>(
  config: CircularBufferConfig<T>
): [CircularBuffer<T>, CircularBufferActions<T>] {
  const [buffer, setBuffer] = useState(() => createCircularBuffer(config));

  const actions = useMemo(
    () => ({
      push: (item: T) => setBuffer((prev) => prev.push(item)),
      pushMany: (items: T[]) => setBuffer((prev) => prev.pushMany(items)),
      clear: () => setBuffer((prev) => prev.clear()),
      resize: (newMaxSize: number) => setBuffer((prev) => prev.resize(newMaxSize)),
    }),
    []
  );

  return [buffer, actions];
}
