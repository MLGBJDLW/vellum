import { describe, expect, it } from "vitest";
import { getVisualWidth } from "../../../utils/text-width.js";
import { inputCursorRow, moveInputCursor, wrapInputRows } from "../input-viewport.js";

describe("input viewport", () => {
  it("wraps complete CJK, emoji and combining graphemes without changing draft offsets", () => {
    const text = "中文👩‍💻e\u0301\tend";
    const rows = wrapInputRows(text, 4);
    expect(rows.map((row) => row.text).join("")).toBe(text.replace("\t", " "));
    expect(rows.every((row) => getVisualWidth(row.text) <= 4)).toBe(true);
    for (const row of rows)
      expect(text.slice(row.start, row.start + row.text.length).replace("\t", " ")).toBe(row.text);
    expect(rows.some((row) => row.text.includes("👩‍💻"))).toBe(true);
  });

  it("keeps the insertion point visible at full-width lines and trailing newlines", () => {
    const rows = wrapInputRows("abcd\nxy\n", 4);
    expect(rows[inputCursorRow(rows, 4)]).toEqual({ text: "", start: 4 });
    expect(rows[inputCursorRow(rows, 8)]).toEqual({ text: "", start: 8 });
    const end = wrapInputRows("abcd", 4);
    expect(end[inputCursorRow(end, 4)]).toEqual({ text: "", start: 4 });
  });

  it("navigates wrapped visual rows and avoids splitting wide graphemes", () => {
    const rows = wrapInputRows("abcd中文e\u0301z", 4);
    expect(moveInputCursor(rows, 3, 1)).toBe(5);
    expect(moveInputCursor(rows, 5, -1)).toBe(2);
    expect(moveInputCursor(rows, 8, -1)).toBe(4);
  });

  it("moves up onto a short soft-wrapped row instead of staying at the next row's start", () => {
    const rows = wrapInputRows("中文abcde", 3);
    const next = moveInputCursor(rows, 2, -1);
    expect(next).toBe(0);
    expect(inputCursorRow(rows, next)).toBe(0);
  });
});
