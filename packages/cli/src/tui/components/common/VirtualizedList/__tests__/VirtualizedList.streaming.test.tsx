import { PassThrough } from "node:stream";
import { Box, render } from "ink";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import { AnimationProvider } from "../../../../context/AnimationContext.js";
import { ThemeProvider } from "../../../../theme/index.js";
import { MessageList } from "../../../Messages/MessageList.js";

describe("VirtualizedList live renderer scheduling", () => {
  it("settles each asynchronously streamed frame without accumulating nested updates", async () => {
    // ink-testing-library uses debug rendering and act drains work after every
    // update. This exercises the native 30fps scheduler with independent tokens.
    const stdout = Object.assign(new PassThrough(), { columns: 80, rows: 24, isTTY: true });
    stdout.on("data", () => {});
    const stdin = Object.assign(new PassThrough(), {
      isTTY: true,
      setRawMode: () => {},
      ref: () => {},
      unref: () => {},
    });
    const stderr = new PassThrough();
    const errors: unknown[] = [];
    let frame = "";
    let lastLine = 1;
    let paintedFinalLine = false;
    let complete!: () => void;
    const completed = new Promise<void>((resolve) => {
      complete = resolve;
    });
    function Stream() {
      const [count, setCount] = useState(1);
      useEffect(() => {
        let line = 1;
        const timer = setInterval(() => {
          lastLine = ++line;
          try {
            setCount(line);
          } catch (error) {
            errors.push(error);
            clearInterval(timer);
            complete();
          }
          if (line === 140) {
            clearInterval(timer);
          }
        }, 8);
        return () => clearInterval(timer);
      }, []);
      return (
        <ThemeProvider>
          <Box width={80} height={15}>
            <MessageList
              messages={[{ id: "user", role: "user", content: "history", timestamp: new Date(0) }]}
              pendingMessage={{
                id: "response",
                role: "assistant",
                timestamp: new Date(0),
                isStreaming: true,
                thinking:
                  "**Checking mouse and history routing**\nThinking detail: 验证历史位置与中文显示。",
                content: Array.from(
                  { length: count },
                  (_, i) => `History item ${i + 1}: mouse navigation verification 中文 🙂`
                ).join("\n"),
              }}
              isStreaming
            />
          </Box>
        </ThemeProvider>
      );
    }
    const reactTestGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousActEnvironment = reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
    const previousAnimationsDisabled = process.env.VELLUM_TEST_DISABLE_ANIMATION;
    reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = false;
    process.env.VELLUM_TEST_DISABLE_ANIMATION = "0";
    const app = render(
      <AnimationProvider>
        <Stream />
      </AnimationProvider>,
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        alternateBuffer: true,
        incrementalRendering: true,
        patchConsole: false,
        exitOnCtrlC: false,
        onRender: (result) => {
          frame = result.output;
          if (lastLine === 140 && frame.includes("History item 140")) {
            paintedFinalLine = true;
            complete();
          }
        },
      }
    );
    void app.waitUntilExit().then(
      () => {
        if (!paintedFinalLine)
          errors.push(new Error("Renderer exited before the final line was painted"));
        complete();
      },
      (error) => {
        errors.push(error);
        complete();
      }
    );
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let finalFrame = "";
    try {
      await Promise.race([
        completed,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(
            () => reject(new Error(`Stream stopped at line ${lastLine}`)),
            15000
          );
        }),
      ]);
      finalFrame = frame;
    } finally {
      clearTimeout(deadline);
      app.unmount();
      await app.waitUntilExit().catch((error) => errors.push(error));
      app.cleanup();
      reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
      if (previousAnimationsDisabled === undefined)
        delete process.env.VELLUM_TEST_DISABLE_ANIMATION;
      else process.env.VELLUM_TEST_DISABLE_ANIMATION = previousAnimationsDisabled;
    }
    expect(errors).toEqual([]);
    expect(lastLine).toBe(140);
    expect(finalFrame).toContain("History item 140");
    expect(finalFrame).not.toContain("Maximum update depth");
  });
});
