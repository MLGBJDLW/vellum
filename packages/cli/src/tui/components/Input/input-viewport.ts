import { getVisualWidth } from "../../utils/text-width.js";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export interface InputRow {
  text: string;
  start: number;
}

/** Keep offsets into the original draft while wrapping complete terminal cells. */
export function wrapInputRows(value: string, width: number): InputRow[] {
  const columns = Math.max(1, Math.floor(width));
  const rows: InputRow[] = [];
  let start = 0;
  let text = "";
  let cells = 0;
  for (const part of graphemes.segment(value)) {
    if (part.segment === "\n") {
      rows.push({ text, start });
      if (cells >= columns) rows.push({ text: "", start: part.index });
      start = part.index + 1;
      text = "";
      cells = 0;
      continue;
    }
    // A tab occupies one display cell without changing the draft's offsets.
    const display = part.segment === "\t" ? " " : part.segment;
    const size = getVisualWidth(display);
    if (cells > 0 && cells + size > columns) {
      rows.push({ text, start });
      start = part.index;
      text = "";
      cells = 0;
    }
    text += display;
    cells += size;
  }
  rows.push({ text, start });
  // Reserve an insertion cell when the final line exactly fills its row.
  if (cells >= columns) rows.push({ text: "", start: value.length });
  return rows;
}

export function inputCursorRow(rows: readonly InputRow[], cursor: number): number {
  let low = 0;
  let high = rows.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if ((rows[middle]?.start ?? 0) <= cursor) low = middle;
    else high = middle;
  }
  return low;
}

/** Vertical navigation follows displayed rows and never splits a grapheme. */
export function moveInputCursor(
  rows: readonly InputRow[],
  cursor: number,
  direction: -1 | 1
): number {
  const rowIndex = inputCursorRow(rows, cursor);
  const row = rows[rowIndex];
  const target = rows[rowIndex + direction];
  if (!row) return cursor;
  if (!target) return direction < 0 ? 0 : row.start + row.text.length;
  const column = getVisualWidth(row.text.slice(0, cursor - row.start));
  let cells = 0;
  let offset = 0;
  for (const part of graphemes.segment(target.text)) {
    const size = getVisualWidth(part.segment);
    if (cells + size > column) break;
    cells += size;
    offset = part.index + part.segment.length;
  }
  // At a soft wrap the boundary belongs to the following row. Keep vertical
  // movement on its target row by selecting its final complete grapheme.
  if (
    offset === target.text.length &&
    offset > 0 &&
    rows[rowIndex + direction + 1]?.start === target.start + offset
  ) {
    offset = graphemes.segment(target.text).containing(offset - 1)?.index ?? 0;
  }
  return target.start + offset;
}
