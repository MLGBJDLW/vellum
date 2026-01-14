/**
 * Tests for Slash Command Parsing Utilities
 *
 * Tests slash command parsing functionality.
 */

import { describe, expect, it } from "vitest";
import { parseSlashCommand } from "../slash-command-utils.js";

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
    const result = parseSlashCommand("/search 'hello world'");

    expect(result).toEqual({
      name: "search",
      args: ["hello world"],
      raw: "/search 'hello world'",
    });
  });

  it("should handle mixed quoted and unquoted arguments", () => {
    const result = parseSlashCommand('/filter "user name" --type admin');

    expect(result.args).toEqual(["user name", "--type", "admin"]);
  });

  it("should handle escaped quotes within quoted strings", () => {
    const result = parseSlashCommand('/echo "say \\"hello\\""');

    expect(result.args).toEqual(['say "hello"']);
  });

  it("should handle escaped backslash", () => {
    const result = parseSlashCommand("/path C:\\\\Users\\\\test");

    expect(result.args).toEqual(["C:\\Users\\test"]);
  });

  it("should trim whitespace from input", () => {
    const result = parseSlashCommand("  /help  ");

    expect(result.name).toBe("help");
    expect(result.raw).toBe("/help");
  });

  it("should handle multiple spaces between arguments", () => {
    const result = parseSlashCommand("/cmd  arg1   arg2");

    expect(result.args).toEqual(["arg1", "arg2"]);
  });

  it("should handle command with only spaces after name", () => {
    const result = parseSlashCommand("/help   ");

    expect(result.name).toBe("help");
    expect(result.args).toEqual([]);
  });

  it("should handle flag-style arguments", () => {
    const result = parseSlashCommand("/list --all -v --format=json");

    expect(result.args).toEqual(["--all", "-v", "--format=json"]);
  });
});
