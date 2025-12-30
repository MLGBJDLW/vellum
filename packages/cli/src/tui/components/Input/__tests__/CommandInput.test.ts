/**
 * Tests for CommandInput Component (T010)
 *
 * Tests slash command parsing and message routing.
 */

import { describe, expect, it } from "vitest";
import { parseSlashCommand } from "../CommandInput.js";

describe("parseSlashCommand", () => {
  it("should parse simple command without arguments", () => {
    const result = parseSlashCommand("/help");

    expect(result).toEqual({
      name: "help",
      args: [],
      raw: "/help",
    });
  });

  it("should parse command with single argument", () => {
    const result = parseSlashCommand("/search query");

    expect(result).toEqual({
      name: "search",
      args: ["query"],
      raw: "/search query",
    });
  });

  it("should parse command with multiple arguments", () => {
    const result = parseSlashCommand("/config set value true");

    expect(result).toEqual({
      name: "config",
      args: ["set", "value", "true"],
      raw: "/config set value true",
    });
  });

  it("should handle double-quoted arguments with spaces", () => {
    const result = parseSlashCommand('/search "hello world"');

    expect(result).toEqual({
      name: "search",
      args: ["hello world"],
      raw: '/search "hello world"',
    });
  });

  it("should handle single-quoted arguments with spaces", () => {
    const result = parseSlashCommand("/echo 'hello world'");

    expect(result).toEqual({
      name: "echo",
      args: ["hello world"],
      raw: "/echo 'hello world'",
    });
  });

  it("should handle mixed quoted and unquoted arguments", () => {
    const result = parseSlashCommand('/cmd arg1 "arg two" arg3');

    expect(result).toEqual({
      name: "cmd",
      args: ["arg1", "arg two", "arg3"],
      raw: '/cmd arg1 "arg two" arg3',
    });
  });

  it("should handle escaped quotes within quoted strings", () => {
    const result = parseSlashCommand('/echo "say \\"hello\\""');

    expect(result).toEqual({
      name: "echo",
      args: ['say "hello"'],
      raw: '/echo "say \\"hello\\""',
    });
  });

  it("should trim whitespace from input", () => {
    const result = parseSlashCommand("  /help  ");

    expect(result).toEqual({
      name: "help",
      args: [],
      raw: "/help",
    });
  });

  it("should handle command with flag-style arguments", () => {
    const result = parseSlashCommand("/search --limit 10 --format json");

    expect(result).toEqual({
      name: "search",
      args: ["--limit", "10", "--format", "json"],
      raw: "/search --limit 10 --format json",
    });
  });

  it("should handle multiple spaces between arguments", () => {
    const result = parseSlashCommand("/cmd   arg1    arg2");

    expect(result).toEqual({
      name: "cmd",
      args: ["arg1", "arg2"],
      raw: "/cmd   arg1    arg2",
    });
  });
});
