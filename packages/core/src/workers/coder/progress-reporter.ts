export interface ProgressEvent {
  completed: number;
  total: number;
  current?: {
    title: string;
    status: string;
  };
}

export class ProgressReporter {
  emitProgress(event: ProgressEvent): string {
    return this.formatProgress(event);
  }

  formatProgress(event: ProgressEvent): string {
    const { completed, total, current } = event;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const bar = this.progressBar(percent);
    const currentTitle = current?.title ?? "None";
    const currentStatus = current?.status ?? "idle";

    return [
      "IMPLEMENTATION PROGRESS",
      `${bar} ${percent}%`,
      `Tasks: ${completed}/${total}`,
      `Current: ${currentTitle}`,
      `Status: ${currentStatus}`,
    ].join("\n");
  }

  private progressBar(percent: number): string {
    const width = 20;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return `[${"#".repeat(filled)}${".".repeat(empty)}]`;
  }
}
