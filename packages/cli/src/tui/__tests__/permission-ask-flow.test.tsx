/**
 * Permission Ask Flow Integration Tests
 *
 * Verifies that the core permission "ask" flow can be driven by the TUI layer:
 * - A permission prompt creates a pending tool execution in ToolsContext
 * - PermissionDialog can approve (once/always) or reject
 * - Approving resolves the underlying ask promise (allowing execution to resume)
 */

import type { AskContext, PermissionInfo } from "@vellum/core";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { act, useEffect, useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { PermissionDialog, RootProvider, useTools } from "../index.js";

describe("Permission ask flow", () => {
  it("shows PermissionDialog for an ask decision and resumes execution on approve", async () => {
    function TestComponent() {
      const { pendingApproval, permissionAskHandler, respondToPermissionRequest } = useTools();

      const [response, setResponse] = useState<string | null>(null);
      const startedRef = useRef(false);
      const approvedRef = useRef(false);

      useEffect(() => {
        let cancelled = false;

        if (startedRef.current) {
          return;
        }
        startedRef.current = true;

        void (async () => {
          const abortController = new AbortController();

          const createdAt = Date.now();

          const info: PermissionInfo = {
            id: "perm-1",
            type: "tool",
            sessionId: "sess-1",
            messageId: "msg-1",
            title: "Allow shell?",
            callId: "call-1",
            metadata: {
              toolName: "shell",
              params: {
                command: "echo hi",
              },
            },
            time: {
              created: createdAt,
            },
          };

          const ctx: AskContext = {
            timeoutMs: 5_000,
            signal: abortController.signal,
          };

          const result = await permissionAskHandler(info, ctx);

          if (cancelled) {
            return;
          }

          setResponse(result ?? null);
        })();

        return () => {
          cancelled = true;
        };
      }, [permissionAskHandler]);

      const pending = pendingApproval[0];

      useEffect(() => {
        if (!pending) {
          return;
        }

        if (approvedRef.current) {
          return;
        }

        approvedRef.current = true;

        // Delay approval so the dialog has time to render and be asserted against.
        const timer = setTimeout(() => {
          respondToPermissionRequest(pending.id, "once");
        }, 100);

        return () => {
          clearTimeout(timer);
        };
      }, [pending, respondToPermissionRequest]);

      if (pending) {
        return (
          <PermissionDialog
            execution={pending}
            riskLevel="high"
            onApprove={() => respondToPermissionRequest(pending.id, "once")}
            onApproveAlways={() => respondToPermissionRequest(pending.id, "always")}
            onReject={() => respondToPermissionRequest(pending.id, "reject")}
          />
        );
      }

      return <Text>{response ? `response: ${response}` : "waiting"}</Text>;
    }

    const { lastFrame } = render(
      <RootProvider theme="dark">
        <TestComponent />
      </RootProvider>
    );

    // Let the permission prompt surface (before auto-approve fires).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const before = lastFrame() ?? "";
    expect(before).toContain("shell");
    expect(before).toContain("High Risk");
    expect(before).toContain("echo hi");

    // Let approval + ask resolution complete.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    const after = lastFrame() ?? "";
    expect(after).toContain("response: once");
  }, 10_000);
});
