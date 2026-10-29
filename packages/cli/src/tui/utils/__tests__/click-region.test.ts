import { describe, expect, it, vi } from "vitest";
import { ClickRegionRegistry } from "../click-region.js";
import { parseMouseEvent } from "../mouse-parser.js";

describe("terminal click gestures", () => {
  it("activates once on primary release, never on press", () => {
    const registry = new ClickRegionRegistry();
    const onClick = vi.fn();
    registry.register({ id: "thinking", top: 2, left: 2, right: 12, bottom: 2, onClick });
    for (const [raw, count] of [
      ["\x1b[<0;6;2M", 0],
      ["\x1b[<0;6;2m", 1],
    ] as const) {
      const event = parseMouseEvent(raw);
      if (!event) throw new Error("Invalid mouse fixture");
      registry.dispatch(event.col, event.row, event);
      expect(onClick).toHaveBeenCalledTimes(count);
    }
  });

  it("does not activate after a drag, release on a different target, or right click", () => {
    const registry = new ClickRegionRegistry();
    const onClick = vi.fn();
    registry.register({ id: "thinking", top: 2, left: 2, right: 12, bottom: 2, onClick });
    for (const raw of [
      "\x1b[<0;6;2M",
      "\x1b[<32;7;2M",
      "\x1b[<0;6;2m",
      "\x1b[<0;6;2M",
      "\x1b[<0;6;3m",
      "\x1b[<2;6;2M",
      "\x1b[<2;6;2m",
    ]) {
      const event = parseMouseEvent(raw);
      if (!event) throw new Error("Invalid mouse fixture");
      registry.dispatch(event.col, event.row, event);
    }
    expect(onClick).not.toHaveBeenCalled();
  });

  it("accepts X10's unspecified-button release only after a primary press", () => {
    const registry = new ClickRegionRegistry();
    const onClick = vi.fn();
    registry.register({ id: "legacy", top: 1, bottom: 1, left: 1, right: 1, onClick });
    for (const raw of ["\x1b[M !!", "\x1b[M#!!", "\x1b[M#!!"]) {
      const event = parseMouseEvent(raw);
      if (!event) throw new Error("Invalid mouse fixture");
      registry.dispatch(event.col, event.row, event);
    }
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
