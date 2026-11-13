import type { AgentLoop, DelegationUpdate } from "@vellum/core";
import { useEffect, useState } from "react";

export function isSubagentActive(entry: DelegationUpdate): boolean {
  return entry.status === "queued" || entry.status === "running" || entry.status === "waiting";
}

/** Subscribe only while the task panel is mounted. The runtime owns the history. */
export function useSubagents(loop: AgentLoop | undefined): readonly DelegationUpdate[] {
  const [snapshot, setSnapshot] = useState<readonly DelegationUpdate[]>(
    () => loop?.getDelegations?.() ?? []
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      setSnapshot(loop?.getDelegations?.() ?? []);
    };
    const update = (entry: DelegationUpdate) => {
      // Stream chunks can arrive hundreds of times per second. Status changes
      // remain prompt; intermediate activity is painted at most ten times/sec.
      if (entry.status !== "running") flush();
      else if (timer === undefined) timer = setTimeout(flush, 100);
    };
    loop?.on("delegationUpdate", update);
    flush();
    return () => {
      loop?.off("delegationUpdate", update);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [loop]);

  return snapshot;
}
