import { createApp } from "./app.js";

const { messageLog, screen } = createApp();

// Add some test messages
messageLog.add("{cyan-fg}You:{/cyan-fg} Hello!");
messageLog.add("{green-fg}Assistant:{/green-fg} Hi! How can I help you today?");
messageLog.add("{magenta-fg}Tool:{/magenta-fg} search_files completed");
messageLog.add("{yellow-fg}System:{/yellow-fg} Connected to model");

// Test CJK and emoji
messageLog.add("{cyan-fg}You:{/cyan-fg} 请用中文回答 🎉");
messageLog.add("{green-fg}Assistant:{/green-fg} 当然可以！我会用中文回答你的问题。😊");

// Test long content
messageLog.add(
  "{green-fg}Assistant:{/green-fg} " +
    "This is a very long message that should wrap properly in the terminal. ".repeat(5)
);

screen.render();
