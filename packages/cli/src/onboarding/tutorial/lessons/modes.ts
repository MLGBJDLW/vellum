import type { Lesson } from "../types.js";

export const modesLesson: Lesson = {
  id: "modes",
  title: "Working with Your Assistant",
  description: "Let orch choose the workflow while you control the objective and permissions",
  category: "modes",
  difficulty: "beginner",
  prerequisites: ["basics"],
  estimatedMinutes: 3,
  icon: "●",
  tags: ["assistant", "workflow", "delegation"],
  steps: [
    {
      id: "modes-intro",
      title: "One entry point",
      content:
        "Vellum starts in orch. Ask for research, writing, analysis, organization, or coding. The assistant chooses direct execution, a plan, or specialist delegates according to the task. You do not need to choose a coding mode.",
      action: "read",
    },
    {
      id: "modes-check",
      title: "Inspect the workflow",
      content:
        "Use /mode to inspect the active workflow. Existing vibe, plan, and spec workflows remain explicit compatibility overrides. Use /orch to return to the personal assistant.",
      action: "command",
      command: "/mode",
      expectedOutcome: "The active workflow and orch entry point",
    },
    {
      id: "modes-verify",
      title: "Describe the result you need",
      content:
        "Give the assistant your objective, constraints, and a way to check the result. It can plan, delegate independent work, inspect results, and repair failures within the same task. Approval and sandbox settings still apply to all tools and delegates.",
      action: "read",
    },
    {
      id: "modes-complete",
      title: "Ready to work",
      content:
        "Return to orch and describe what you want accomplished. You can interrupt with Esc or Ctrl+C; the assistant must preserve progress and explain any blocker.",
      action: "complete",
    },
  ],
};

export function getModesLesson(): Lesson {
  return modesLesson;
}
