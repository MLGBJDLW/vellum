# TUI 鼠标拖拽与 Vellum 路线 — 2026-10-29

支持鼠标拖动滚动条、点击按钮和选择文本的 TUI 框架已经存在。对 Vellum，建议先补齐现有 Ink 分支的事件链和命中测试；若之后要系统升级终端交互，再评估 OpenTUI React。以下保留最初的官方文档、发布包、源码及本地代码调研；后续实现和实机反馈处理见[实施验证记录](tui-mouse-validation-2026-10-29.md)。

## 框架对比

| 方案 | 鼠标事件与滚动条 | 文本选择、Windows | 对 Vellum 的影响 |
| --- | --- | --- | --- |
| **OpenTUI / React** | 有 down/up/move/drag；左键拖动保留源组件归属。`ScrollBox` 管理内置 `ScrollBar`；后者的 `Slider` 源码实现按下记录抓取偏移、拖动更新、释放结束，确实是可拖拽滚动条。[交互](https://opentui.com/docs/core-concepts/interaction/) · [ScrollBox](https://opentui.com/docs/components/scrollbox/) · [Slider 源码](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/Slider.ts) | 有应用内文本拖选、双击词、三击行；原生 Windows x64/arm64 产物，其中 Core 的 Windows x64 有 Bun/Node 测试。[选择](https://opentui.com/docs/core-concepts/interaction/#text-selection) · [平台](https://opentui.com/docs/getting-started/runtime-support/) | 最接近现有 TypeScript/React。仍需替换 Ink renderer、组件、输入/焦点/测量接口与测试夹具，不能直接改包名。 |
| **Textual** | 有 MouseDown/Move/Up、Click 和显式 `capture_mouse()`；`ScrollBar` 自己实现抓取、坐标到位置映射、释放和轨道点击。[输入](https://textual.textualize.io/guide/input/#mouse-input) · [滚动条源码](https://github.com/Textualize/textual/blob/main/src/textual/scrollbar.py) | 多数 widget 支持拖选和 Ctrl+C；不支持的 widget 可回退终端选择。官方支持 Windows 并推荐 Windows Terminal。[FAQ](https://textual.textualize.io/FAQ/#how-can-i-select-and-copy-text-in-a-textual-app) · [平台](https://textual.textualize.io/getting_started/#windows) | 交互完整，但为 Python 框架；需要重写 UI 或另起 Python 前端并维护进程通信。对本次需求成本高。 |
| **Ratatui + crossterm** | crossterm 提供 Down/Up/Drag/Moved；Ratatui 内置 `Scrollbar` 负责绘制，`ScrollbarState` 由应用更新。应用仍要实现命中、抓取、拖动比例和点击语义，不能把“有 Drag 事件”当成开箱即用滚动条。[事件](https://docs.rs/crossterm/latest/crossterm/event/enum.MouseEventKind.html) · [Scrollbar 源码](https://github.com/ratatui/ratatui/blob/main/ratatui-widgets/src/scrollbar.rs) | crossterm 明确支持 Windows，并列出 Console Host / Windows Terminal 测试环境；应用内文本选择仍需额外实现或采用其他 widget，终端选择可作为回退。[平台](https://github.com/crossterm-rs/crossterm#tested-terminals) · [事件职责](https://ratatui.rs/concepts/event-handling/) | 适合 Rust TUI；迁移当前 React UI 的成本最高之一，不能直接复用组件。 |
| **上游 Ink** | 最新文档提供 `contentOffsetX/Y` 和测量能力；`useInput` 会丢弃非按键的鼠标报告，没有文档化的通用鼠标组件事件/现成可拖拽 scrollbar。应用需自行接管鼠标协议与命中。[滚动与测量](https://github.com/vadimdemedes/ink#contentoffsety) · [useInput](https://github.com/vadimdemedes/ink#useinputinputhandler-options) | 不能把框架布局坐标直接当终端屏幕坐标；文本选择与终端能力需要应用单独处理。同一 VT 输入机制可在 Windows Terminal 使用。[测量](https://github.com/vadimdemedes/ink#measureelementref) · [Windows VT 鼠标](https://learn.microsoft.com/en-us/windows/terminal/tips-and-tricks#mouse-interaction) | 单纯升级上游 Ink 不会自动补齐点击或拖拽，而且与 Vellum fork 的原生滚动 API 不等价。 |
| **Vellum 当前 `@jrichman/ink@7.1.0`** | 已有 `overflowY="scroll"`、`scrollTop`、绘制的 scrollbar，并导出 `getVerticalScrollbarBoundingBox`；应用可以使用原生条的真实几何信息，而不用另画一条。[发布类型](https://unpkg.com/@jrichman/ink@7.1.0/build/index.d.ts) · [测量实现](https://github.com/jacob314/ink/blob/master/src/measure-element.ts) | fork 提供选择相关基础设施/示例；这不证明 Vellum 已接入完整鼠标选择。保留当前复制模式，并在 Windows Terminal 提示 Shift+拖选作为终端原生选择回退。[示例](https://github.com/jacob314/ink/tree/master/examples/selection) · [Windows 选择](https://learn.microsoft.com/en-us/windows/terminal/tips-and-tricks#mouse-interaction) | **本次推荐**：复用现有输入解析器、MouseProvider、点击 registry 和 VirtualizedList，改动范围最小。 |

## OpenTUI 的现实迁移边界

官方 0.7.0 文档要求 Bun ≥1.3.14，或 Node ≥26.4.0、ESM 与 `--experimental-ffi`；Windows arm64 的 Bun 要求 ≥1.4.0。React 绑定要求 React ≥19.2.0，但没有专门的 Node CI 通道，Node 的打包/SEA 验证目前限 Linux x64。Vellum 当前 Node 基线为 `^22.22.1 || >=24.11.0`，因此迁移涉及运行时、原生依赖分发和 Windows 包验证，而不只是 React 组件重写。[OpenTUI 平台与验证范围](https://opentui.com/docs/getting-started/runtime-support/) · [React 绑定](https://opentui.com/docs/bindings/react/) · [Vellum package.json](../../packages/cli/package.json)

OpenCode 是实际采用案例，但当前 TUI 用的是 **OpenTUI + Solid**，不是 React。其 `packages/tui` 依赖 `@opentui/core`/`@opentui/solid`，会话页面使用 `ScrollBoxRenderable`、可配置 scrollbar 和鼠标处理。因此能证明框架用于真实复杂 TUI，不能据此推导 Vellum 的 React/Node 路径已被同等验证。[依赖](https://github.com/anomalyco/opencode/blob/726cf096396d5014c3b1845e231cc01efe0421ee/packages/tui/package.json) · [会话实现](https://github.com/anomalyco/opencode/blob/726cf096396d5014c3b1845e231cc01efe0421ee/packages/tui/src/routes/session/index.tsx)

此外，OpenTUI `viewportCulling` 跳过离屏绘制，Yoga 仍计算布局，不能直接认为它等价于 Vellum 的虚拟化长历史列表。迁移原型需专门验证长会话、流式增长时的阅读锚点、中文/emoji、输入草稿与复制行为。[ScrollBox culling](https://opentui.com/docs/components/scrollbox/#viewport-culling)

## Vellum 已定位的缺口

- [`mouse-parser.ts`](../../packages/cli/src/tui/utils/mouse-parser.ts) 已支持 SGR/X10 的 press/release/move，full 模式启用 1002/1003/1006；[`useMouse.ts`](../../packages/cli/src/tui/hooks/useMouse.ts) 已有 `onMove`。但 [`MouseContext.tsx`](../../packages/cli/src/tui/context/MouseContext.tsx) 只分发 wheel/click，没有移动事件订阅和拖动 capture。
- [`app.tsx`](../../packages/cli/src/app.tsx) 将 `enableScroll` 设为 `!alternateBufferEnabled`；[`MessageList.tsx`](../../packages/cli/src/tui/components/Messages/MessageList.tsx) 又用它禁用 `useMouseScroll`。静态路径表明备用屏幕下可能捕获鼠标却没有历史滚轮处理。
- [`commands/mouse.ts`](../../packages/cli/src/commands/mouse.ts) 的 `setMouseModeChangeCallback` 没有调用方；[`RootProvider.tsx`](../../packages/cli/src/tui/context/RootProvider.tsx) 只读取配置。`/mouse` 的运行时切换没有连到 provider 状态。
- `useMouse` 把 press 和 release 都送入 `onClick`，[`click-region.ts`](../../packages/cli/src/tui/utils/click-region.ts) 不区分二者；真实 parser 输出送入 registry 的小型复现中，一次左键按下/释放调用回调两次。[`ThinkingBlock.tsx`](../../packages/cli/src/tui/components/Messages/ThinkingBlock.tsx) 将 `_toggle` 直接作为点击回调，存在展开后立即折叠的路径。此为代码/事件链复现，不是完整实机验收。
- [`VirtualizedList.tsx`](../../packages/cli/src/tui/components/common/VirtualizedList/VirtualizedList.tsx) 已统一管理历史视口并暴露 `scrollTo(offset)`。应保持它为唯一滚动状态来源。

## 建议实施顺序与验收

1. 修复 `/mouse` 到 provider 的状态更新以及备用屏幕的历史滚轮订阅。沿用共享 [`terminal-input.ts`](../../packages/cli/src/tui/utils/terminal-input.ts)，避免另加 stdin 读取器。
2. 在现有 MouseProvider/点击 registry 中定义按下、移动、释放和 capture。单次点击只激活一次；拖拽结束不再触发普通点击；弹窗、失焦、卸载和模式切换要结束 capture。
3. 用 `getVerticalScrollbarBoundingBox` 命中现有原生滚动条，记录 thumb 抓取偏移，把轨道位置映射到当前最大历史偏移，调用 `VirtualizedList.scrollTo`。不新增 `ScrollIndicator` 或第二套位置控制器；拖离滚动条仍由原抓取者处理，直到释放。
4. 接通现有可点击控件；保留键盘操作、复制模式与 Shift+拖选提示。Windows Terminal 官方明确说明：应用启用鼠标模式时，Shift 会恢复终端选择而不发送 VT 鼠标输入，因此应用收不到这段拖拽是预期行为。[微软说明](https://learn.microsoft.com/en-us/windows/terminal/tips-and-tricks#mouse-interaction)
5. 用事件链测试覆盖跨区域拖动、首尾位置、内容增长、释放后停止、单次点击和弹窗遮挡；随后在真实 Windows Terminal 与 VS Code 集成终端中操作长会话，确认滚动条和历史同步、流式输出不抢回阅读位置、中文/emoji 不错位、鼠标协议不进入输入框。只有后一阶段通过，才能宣称实际鼠标交互完成。

若未来要求多窗格拖动、完整应用内选择、丰富控件和统一焦点，再做独立的 OpenTUI React 原型，测量上述行为及 Windows 打包后决定是否迁移。本次需求本身不构成重写 UI 的必要条件。
