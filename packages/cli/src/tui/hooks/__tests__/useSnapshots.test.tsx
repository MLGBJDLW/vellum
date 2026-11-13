import { Snapshot, type SnapshotInfo } from "@vellum/core";
import { Text } from "ink";
import { cleanup, render } from "ink-testing-library";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useSnapshots } from "../useSnapshots.js";

afterEach(async () => {
  await act(async () => cleanup());
  vi.restoreAllMocks();
});

it("discards snapshot reads from the previous workspace", async () => {
  vi.spyOn(Snapshot, "isInitialized").mockResolvedValue(true);
  let finishOld!: (result: Awaited<ReturnType<typeof Snapshot.listSnapshots>>) => void;
  const oldRead = new Promise<Awaited<ReturnType<typeof Snapshot.listSnapshots>>>((resolve) => {
    finishOld = resolve;
  });
  vi.spyOn(Snapshot, "listSnapshots").mockImplementation((cwd) =>
    cwd === "old" ? oldRead : Promise.resolve({ ok: true, value: [] })
  );
  function Harness({ cwd }: { cwd: string }) {
    const state = useSnapshots(cwd);
    return <Text>{state.snapshots.map((snapshot) => snapshot.hash).join(",") || "empty"}</Text>;
  }
  let screen!: ReturnType<typeof render>;
  await act(async () => {
    screen = render(<Harness cwd="old" />);
  });
  await act(async () => {
    screen.rerender(<Harness cwd="new" />);
  });
  await act(async () => {
    finishOld({ ok: true, value: [{ hash: "old-checkpoint" } as SnapshotInfo] });
  });
  expect(screen.lastFrame()).toBe("empty");
});
