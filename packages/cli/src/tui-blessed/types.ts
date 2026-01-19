import type { Widgets } from "blessed";

export interface AppComponents {
  screen: Widgets.Screen;
  header: Widgets.BoxElement;
  messageLog: Widgets.Log;
  input: Widgets.TextboxElement;
  statusBar: Widgets.BoxElement;
}

export interface MessageOptions {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}
