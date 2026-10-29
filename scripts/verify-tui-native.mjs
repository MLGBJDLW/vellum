/** Launch the built CLI against a local deterministic stream in an isolated QA profile.
 * Run inside Windows Terminal: node scripts/verify-tui-native.mjs
 * Enter `history` to fill the transcript, then `stream` for a long live response.
 * This fixture never calls a model service or uses the user's provider credentials.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, ".cache", "tui-mouse-native");
const qaProfile = path.join(output, "profile");
const workspace = path.join(output, "workspace");
const settings = path.join(qaProfile, ".vellum");
fs.mkdirSync(settings, { recursive: true });
fs.mkdirSync(workspace, { recursive: true });
fs.writeFileSync(
  path.join(settings, "onboarding.json"),
  JSON.stringify({
    currentStep: "complete",
    completed: true,
    selectedProvider: "deepseek",
    selectedMode: "orch",
  })
);
fs.writeFileSync(
  path.join(settings, "settings.json"),
  JSON.stringify({
    bannerSeen: true,
    language: "en",
    thinking: {
      enabled: true,
      displayMode: "compact",
      expandedByDefault: false,
      autoCollapse: false,
    },
    noFlicker: { mouseEnabled: true, mouseClicksEnabled: true },
  })
);
const receipts = path.join(output, "stream-receipts.jsonl");
const log = (value) =>
  fs.appendFileSync(
    receipts,
    `${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...value })}\n`
  );
let requestId = 0;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = http.createServer(async (req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        object: "list",
        data: [{ id: "deepseek-flash", object: "model", owned_by: "local-qa" }],
      })
    );
    return;
  }
  if (req.url !== "/v1/chat/completions") {
    res.writeHead(404);
    res.end();
    return;
  }
  let raw = "";
  for await (const data of req) raw += data;
  const body = JSON.parse(raw);
  const latest = body.messages?.findLast((message) => message.role === "user");
  const prompt =
    typeof latest?.content === "string" ? latest.content : JSON.stringify(latest?.content);
  const long = /stream/i.test(prompt ?? "");
  const id = ++requestId;
  log({ event: "request", id, scenario: long ? "stream" : "history" });
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const send = (delta, finish_reason = null) => {
    if (res.destroyed) return false;
    res.write(
      `data: ${JSON.stringify({ id: `mouse-qa-${id}`, object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`
    );
    return true;
  };
  send({ role: "assistant", reasoning_content: "**Checking mouse and history routing**\n" });
  const thinkingLines = long ? 55 : 5;
  for (let line = 1; line <= thinkingLines; line++) {
    if (
      !send({
        reasoning_content: `Thinking detail ${String(line).padStart(3, "0")}: 验证历史位置与中文显示。\n`,
      })
    )
      return;
    if (long && line % 15 === 0)
      send({ reasoning_content: `\n**Verifying reading position ${line}**\n` });
    await wait(long ? 700 : 20);
  }
  const lines = long ? 240 : 140;
  for (let line = 1; line <= lines; line++) {
    if (
      !send({
        content: `${long ? "Live" : "History"} item ${String(line).padStart(3, "0")}: mouse navigation verification 中文 🙂\n`,
      })
    )
      return;
    if (line % 20 === 0) log({ event: "progress", id, line });
    await wait(long ? 350 : 8);
  }
  send({}, "stop");
  res.end("data: [DONE]\n\n");
  log({ event: "complete", id, lines });
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
server.unref();
const address = server.address();
if (!address || typeof address === "string") throw new Error("Missing local fixture port");
// Limit changes to this verification process and its isolated profile.
process.env.USERPROFILE = qaProfile;
process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
process.env.DEEPSEEK_API_KEY = "vellum-local-ui-fixture-only";
process.env.VELLUM_NO_FLICKER = "1";
process.env.VELLUM_DISABLE_MOUSE = "0";
process.env.VELLUM_DISABLE_MOUSE_CLICKS = "0";
process.env.VELLUM_ICONS = "unicode";
process.env.NODE_ENV = process.env.VELLUM_QA_NODE_ENV ?? "production";
if (process.env.VELLUM_QA_NODE_ENV === "development") {
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...args) => {
    fs.appendFileSync(path.join(output, `stderr-${process.pid}.log`), chunk);
    return originalStderrWrite(chunk, ...args);
  };
}
process.chdir(workspace);
const cli = path.join(root, "packages", "cli", "dist", "index.mjs");
process.argv = [
  process.execPath,
  cli,
  "chat",
  "--provider",
  "deepseek",
  "--model",
  "deepseek-flash",
  "--language",
  "en",
];
log({
  event: "launch",
  fixtureUrl: process.env.DEEPSEEK_BASE_URL,
  cli,
  buildSha256: createHash("sha256").update(fs.readFileSync(cli)).digest("hex"),
});
await import(pathToFileURL(cli).href);
