# Migration Guide

This guide helps you migrate from the old `@vellum/shared` types to the new `@vellum/core` types.

## Overview

The core package introduces:
- **Part-based messages**: Messages now support multi-part content (text, tools, files, images, reasoning)
- **Zod validation**: All types are validated at runtime with Zod schemas
- **Result pattern**: Error handling uses `Result<T, E>` instead of try/catch
- **Type-safe tools**: Tools are defined with Zod schemas and typed execution
- **Event-driven architecture**: EventBus for decoupled communication
- **Dependency injection**: Container-based DI for testability

## Breaking Changes

### 1. Message Type

The `Message` type has fundamentally changed from string content to part-based content.

**Before (deprecated):**
```typescript
import { Message, MessageRole } from '@vellum/shared';

const message: Message = {
  id: '1',
  role: 'user',
  content: 'Hello, world!',
  timestamp: Date.now(),
};
```

**After:**
```typescript
import { Message, createMessage, Parts, Role } from '@vellum/core';

// Using factory function (recommended)
const message = createMessage('user', [Parts.text('Hello, world!')]);

// Or manual construction
const message: Message = {
  id: crypto.randomUUID(),
  role: 'user',
  content: [{ kind: 'text', text: 'Hello, world!' }],
  createdAt: Date.now(),
};
```

### 2. Message Content

Content is now an array of `MessageContent` parts instead of a string.

**Before:**
```typescript
message.content // string
```

**After:**
```typescript
message.content // MessageContent[]

// Access text content
const textParts = message.content.filter(p => p.kind === 'text');
const text = textParts.map(p => p.text).join('');
```

### 3. Message Roles

The `role` field now includes `'tool_result'` and uses Zod validation.

**Before:**
```typescript
type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
```

**After:**
```typescript
import { Role, RoleSchema } from '@vellum/core';

type Role = 'user' | 'assistant' | 'system' | 'tool_result';

// Runtime validation
RoleSchema.parse('user'); // ✓
RoleSchema.parse('invalid'); // throws ZodError
```

### 4. Tool Definition

Tools are now defined with Zod schemas and typed execution.

**Before:**
```typescript
import { Tool, ToolResult } from '@vellum/shared';

const myTool: Tool = {
  name: 'my_tool',
  description: 'Does something',
  parameters: { input: { type: 'string' } },
  execute: async (params) => {
    return { success: true, output: 'done' };
  },
};
```

**After:**
```typescript
import { defineTool, ok, fail, type ToolContext } from '@vellum/core';
import { z } from 'zod';

const myTool = defineTool({
  name: 'my_tool',
  kind: 'user',
  description: 'Does something',
  parameters: z.object({
    input: z.string(),
  }),
  execute: async ({ input }, ctx: ToolContext) => {
    if (!input) {
      return fail('Input is required');
    }
    return ok({ result: input.toUpperCase() });
  },
});
```

### 5. Tool Results

Tool results now use the `Result<T, E>` pattern.

**Before:**
```typescript
// Success
return { success: true, output: 'data' };

// Failure
return { success: false, output: '', error: 'Something went wrong' };
```

**After:**
```typescript
import { ok, fail, isOk, isErr, unwrap } from '@vellum/core';

// Success
return ok({ data: 'result' });

// Failure
return fail('Something went wrong');

// Handling results
const result = await myTool.execute({ input: 'test' }, ctx);

if (isOk(result)) {
  console.log('Success:', result.value);
} else {
  console.error('Error:', result.error);
}

// Or use pattern matching
import { match } from '@vellum/core';

match(result, {
  ok: (value) => console.log('Success:', value),
  err: (error) => console.error('Error:', error),
});
```

## New Features

### Part Types

The new message system supports various content parts:

```typescript
import { Parts, ToolStates } from '@vellum/core';

// Text content
Parts.text('Hello, world!');

// Tool call (in assistant messages)
Parts.tool('read_file', { path: '/tmp/test.txt' }, 'tool-id-1');

// Tool result (in tool_result messages)
Parts.toolResult('tool-id-1', { content: 'file contents' });

// Reasoning (chain-of-thought)
Parts.reasoning('Let me think about this...');

// File attachment
Parts.file('/path/to/file.txt');

// Image
Parts.image('data:image/png;base64,...', 'image/png');
```

### Tool State Tracking

Track tool execution state:

```typescript
import { ToolStates, type ToolState } from '@vellum/core';

let state: ToolState = ToolStates.pending();
state = ToolStates.running();
state = ToolStates.completed({ result: 'done' });
// or
state = ToolStates.error('Something went wrong');
```

### Result Utilities

Comprehensive Result handling:

```typescript
import { 
  Result, Ok, Err, isOk, isErr,
  unwrap, unwrapOr, map, mapErr, flatMap,
  match, all, tryCatch, tryCatchAsync
} from '@vellum/core';

// Create results
const success: Result<number, string> = Ok(42);
const failure: Result<number, string> = Err('not found');

// Transform
const doubled = map(success, n => n * 2); // Ok(84)
const withDefault = unwrapOr(failure, 0); // 0

// Combine multiple results
const results = all([Ok(1), Ok(2), Ok(3)]); // Ok([1, 2, 3])

// Wrap throwing functions
const result = tryCatch(() => JSON.parse('{"a":1}'));
const asyncResult = await tryCatchAsync(async () => fetch('/api'));
```

### EventBus

Event-driven communication:

```typescript
import { EventBus, Events } from '@vellum/core';

const bus = new EventBus();

// Subscribe to events
const unsub = bus.on(Events.messageCreated, (payload) => {
  console.log('Message created:', payload.message);
});

// Emit events
bus.emit(Events.messageCreated, { message });

// One-time listener
bus.once(Events.sessionEnd, ({ reason }) => {
  console.log('Session ended:', reason);
});

// Cleanup
unsub();
bus.offAll();
```

### Dependency Injection

Container-based DI:

```typescript
import { Container, Token, bootstrap, shutdown, Tokens } from '@vellum/core';

// Define tokens
const MyServiceToken = Token.create<MyService>('MyService');

// Create container
const container = new Container();
container.register(MyServiceToken, () => new MyService());

// Resolve dependencies
const service = container.resolve(MyServiceToken);

// Or use bootstrap for full setup
const container = await bootstrap({
  config: myConfig,
  signal: controller.signal,
});

// Get services
const logger = container.resolve(Tokens.Logger);
const eventBus = container.resolve(Tokens.EventBus);

// Cleanup
await shutdown(container);
```

## Type Reference

| Old Type (`@vellum/shared`) | New Type (`@vellum/core`) |
|---------------------------|--------------------------|
| `MessageRole` | `Role` |
| `Message` | `Message` (with `MessageContent[]`) |
| `Tool` | `Tool<TParams, TResult>` |
| `ToolResult` | `Result<T, E>` |
| N/A | `TextPart` |
| N/A | `ToolPart` |
| N/A | `ToolResultPart` |
| N/A | `ReasoningPart` |
| N/A | `FilePart` |
| N/A | `ImagePart` |
| N/A | `ToolState` |

### TextAccumulator → StreamCollector

The `TextAccumulator` class from `@vellum/provider` is deprecated in favor of `StreamCollector` from `@vellum/core`.

**Key Differences:**

| Feature | TextAccumulator (old) | StreamCollector (new) |
|---------|----------------------|----------------------|
| Processing | `process(event)` returns void | `processEvent(event)` returns `CollectorAction` |
| Output | String properties (`text`, `reasoning`) | Structured `AssistantMessage` with `MessagePart[]` |
| Error handling | Implicit | `Result<T, E>` pattern |
| Citations | Not supported | Full support via `citations` field |
| Actions | None | Discriminated union for UI updates |

**Before (deprecated):**
```typescript
import { TextAccumulator } from '@vellum/provider';

const accumulator = new TextAccumulator();

for await (const event of stream) {
  accumulator.process(event);
}

// Access properties directly
const text = accumulator.text;
const reasoning = accumulator.reasoning;
const usage = accumulator.usage;
const toolCalls = accumulator.toolCalls;
```

**After (recommended):**
```typescript
import { StreamCollector, type CollectorAction } from '@vellum/core';

const collector = new StreamCollector();

for await (const event of stream) {
  const action: CollectorAction = collector.processEvent(event);
  
  // Handle actions for real-time UI updates
  switch (action.type) {
    case 'emit_text':
      process.stdout.write(action.content);
      break;
    case 'tool_call_started':
      console.log(`Tool ${action.name} started`);
      break;
    case 'stream_complete':
      console.log('Done!', action.message);
      break;
  }
}

// Build final message with Result pattern
const result = collector.build();
if (result.ok) {
  const message = result.value;
  // message.parts: MessagePart[] (text, reasoning, tool parts)
  // message.usage: Usage
  // message.stopReason: StopReason
  // message.citations: GroundingChunk[]
}
```

**CollectorAction Types:**

| Action Type | When Emitted | Payload |
|-------------|--------------|---------|
| `none` | No action needed | - |
| `emit_text` | Text delta received | `content`, `index` |
| `emit_reasoning` | Reasoning delta received | `content`, `index` |
| `tool_call_started` | Tool call begins | `id`, `name`, `index` |
| `tool_call_completed` | Tool call ends | `id`, `arguments` |
| `emit_citations` | Citation received | `citations` |
| `stream_complete` | Stream ends | `message` (AssistantMessage) |
| `error` | Error occurred | `code`, `message` |

## Import Changes

```typescript
// Before
import { Message, MessageRole, Tool, ToolResult } from '@vellum/shared';

// After
import {
  // Message types
  Message,
  Role,
  MessageContent,
  createMessage,
  Parts,
  
  // Part types
  TextPart,
  ToolPart,
  ToolResultPart,
  ReasoningPart,
  FilePart,
  ImagePart,
  
  // Tool types
  Tool,
  ToolKind,
  ToolDefinition,
  ToolContext,
  defineTool,
  
  // Result pattern
  Result,
  Ok,
  Err,
  ok,
  fail,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  flatMap,
  match,
  all,
  tryCatch,
  tryCatchAsync,
  
  // Tool state
  ToolState,
  ToolStates,
  
  // Events
  EventBus,
  Events,
  defineEvent,
  
  // DI
  Container,
  Token,
  Tokens,
  bootstrap,
  shutdown,
  
  // Errors
  VellumError,
  ErrorCode,
  ErrorSeverity,
  
  // Config
  Config,
  ConfigManager,
  loadConfig,
  
  // Logger
  Logger,
  LogLevel,
  ConsoleTransport,
  FileTransport,
  JsonTransport,
} from '@vellum/core';
```

## Questions?

If you encounter issues during migration, please:
1. Check the JSDoc comments on deprecated types
2. Review the test files in `packages/core/src/` for usage examples
3. Open an issue on GitHub
