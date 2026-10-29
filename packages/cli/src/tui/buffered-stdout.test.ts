import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BufferedStdout } from "./buffered-stdout.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BufferedStdout Unicode terminal frames", () => {
  it("keeps the original writer when console guards replace stdout.write later", () => {
    const ttyWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const output = new BufferedStdout(0);
    const laterWrite = vi.fn().mockReturnValue(true);
    process.stdout.write = laterWrite;
    try {
      output.write("first");
      output.write(" second");
      output.flush();
      expect(ttyWrite).toHaveBeenCalledTimes(1);
      expect(ttyWrite.mock.calls[0]?.[0]).toContain("first second");
      expect(laterWrite).not.toHaveBeenCalled();
    } finally {
      process.stdout.write = ttyWrite as typeof process.stdout.write;
      output.dispose();
    }
  });
  it("uses Node's TTY writer instead of raw code-page-dependent file-descriptor bytes", () => {
    const ttyWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const rawWrite = vi.spyOn(fs, "writeSync").mockReturnValue(0);
    const output = new BufferedStdout(0);
    try {
      output.write("\x1b[36m│ 中文 🙂\x1b[39m");
      output.flush();
      expect(ttyWrite).toHaveBeenCalledTimes(1);
      expect(ttyWrite.mock.calls[0]?.[0]).toContain("\x1b[36m│ 中文 🙂\x1b[39m");
      expect(rawWrite).not.toHaveBeenCalled();
    } finally {
      output.dispose();
    }
  });

  it("retains a Unicode character divided across byte chunks", () => {
    const frames: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      frames.push(String(chunk));
      return true;
    });
    vi.spyOn(fs, "writeSync").mockImplementation(((_fd: number, data: string | Buffer) => {
      frames.push(data.toString());
      return data.length;
    }) as typeof fs.writeSync);
    const output = new BufferedStdout(0);
    const bytes = Buffer.from("│中文🙂", "utf8");
    try {
      output.write(bytes.subarray(0, 2));
      output.flush();
      output.write(bytes.subarray(2));
      output.flush();
      expect(frames.join("")).toContain("│中文🙂");
      expect(frames.join("")).not.toContain("\ufffd");
    } finally {
      output.dispose();
    }
  });
});
