import type { Message } from "./types/index.js";

export class ContextManager {
  private messages: Message[] = [];
  private _maxTokens: number;

  constructor(maxTokens = 100000) {
    this._maxTokens = maxTokens;
  }

  get maxTokens(): number {
    return this._maxTokens;
  }

  add(message: Message): void {
    this.messages.push(message);
    this.prune();
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  private prune(): void {
    // TODO: Implement token-based pruning
  }

  clear(): void {
    this.messages = [];
  }
}
