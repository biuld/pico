export interface ManualMockPlaybookContext {
  threadId: string;
  turnId: string;
  turnNumber: number;
  userText?: string;
}

export type ManualMockPlaybookStep =
  | { type: "delay"; ms: number }
  | { type: "notification"; method: string; params?: unknown }
  | { type: "rawItem"; item: Record<string, unknown> }
  | { type: "complete"; status: string; error?: unknown };

export interface ManualMockPlaybook {
  name: string;
  steps: ManualMockPlaybookStep[];
}

interface ToolFixture {
  name: string;
  arguments: Record<string, unknown>;
  output: Record<string, unknown> | string;
}

const REPLIES = [
  "I checked the lamp-lit shelves of this repo. The useful clue is near the protocol boundary, where request, notification, and persistence meet.",
  "A careful pass through the old corridor suggests a small change first: prove the app-server message shape, then let the UI follow.",
  "The mock has enough moonlight to answer this turn: keep the thread ephemeral, store raw items, and make the next assertion visible.",
  "I would start with the narrowest spell: one request, one response, one transcript item, and no hidden state outside Pico.",
  "The map on the desk points to the same place twice. Check the client facade, then confirm the JSONL leaf moved as expected.",
  "There is a draft of an answer in the margin: make the protocol observable, make the timing deterministic, and keep the fixture plain.",
];

const REASONING = [
  "Sketching the protocol path before answering.",
  "Checking whether this turn needs a tool-shaped event.",
  "Separating user-visible text from raw response item storage.",
  "Looking for a compact answer that still exercises the transcript pipeline.",
];

const TOOLS: ToolFixture[] = [
  {
    name: "mock.inspect_repo",
    arguments: { path: "src/codex/app-server", depth: 2 },
    output: { files: 5, finding: "client facade owns app-server calls" },
  },
  {
    name: "mock.read_note",
    arguments: { note: "protocol-boundary" },
    output: "ephemeral threads plus raw response items keep Pico state local",
  },
  {
    name: "mock.search_symbols",
    arguments: { query: "rawResponseItem/completed" },
    output: { matches: ["runTurn", "transcript projection", "thread injection"] },
  },
  {
    name: "mock.roll_dice",
    arguments: { sides: 20, reason: "manual mock variety" },
    output: { value: 13, interpretation: "send a tool call before the answer" },
  },
];

export function createManualMockPlaybook(context: ManualMockPlaybookContext): ManualMockPlaybook {
  const reply = pick(REPLIES);
  const reasoning = pick(REASONING);
  const tool = pick(TOOLS);
  const callId = `manual-call-${context.turnNumber}-${randomInt(1000, 9999)}`;
  const itemPrefix = `manual-${context.turnNumber}-${randomInt(1000, 9999)}`;
  const includeTool = Math.random() < 0.75;
  const includeReasoning = Math.random() < 0.65;
  const includePlan = Math.random() < 0.35;
  const includeWarning = Math.random() < 0.2;

  const steps: ManualMockPlaybookStep[] = [
    { type: "delay", ms: randomInt(250, 900) },
  ];

  if (includeReasoning) {
    steps.push({
      type: "rawItem",
      item: {
        id: `${itemPrefix}-reasoning`,
        type: "reasoning",
        status: "completed",
        summary: [{ type: "summary_text", text: reasoning }],
      },
    });
    steps.push({ type: "delay", ms: randomInt(120, 420) });
  }

  if (includePlan) {
    steps.push({
      type: "rawItem",
      item: {
        id: `${itemPrefix}-plan`,
        type: "function_call",
        name: "update_plan",
        call_id: `${callId}-plan`,
        status: "completed",
        arguments: {
          explanation: "Manual mock sampled a small plan.",
          plan: [
            { step: "Observe the request shape", status: "completed" },
            { step: "Emit a varied response item", status: "in_progress" },
            { step: "Complete the turn", status: "pending" },
          ],
        },
      },
    });
    steps.push({ type: "delay", ms: randomInt(120, 380) });
  }

  if (includeTool) {
    steps.push({
      type: "rawItem",
      item: {
        id: `${itemPrefix}-tool-call`,
        type: "function_call",
        name: tool.name,
        call_id: callId,
        status: "completed",
        arguments: tool.arguments,
      },
    });
    steps.push({ type: "delay", ms: randomInt(160, 520) });
    steps.push({
      type: "rawItem",
      item: {
        id: `${itemPrefix}-tool-output`,
        type: "function_call_output",
        call_id: callId,
        status: "completed",
        output: tool.output,
      },
    });
    steps.push({ type: "delay", ms: randomInt(120, 360) });
  }

  if (includeWarning) {
    steps.push({
      type: "notification",
      method: "warning",
      params: {
        threadId: context.threadId,
        turnId: context.turnId,
        message: "manual mock sampled a warning notification",
      },
    });
    steps.push({ type: "delay", ms: randomInt(80, 240) });
  }

  steps.push({
    type: "notification",
    method: "item/agentMessage/delta",
    params: {
      threadId: context.threadId,
      turnId: context.turnId,
      delta: reply,
    },
  });
  steps.push({
    type: "rawItem",
    item: assistantMessage(`${itemPrefix}-message`, reply),
  });
  steps.push({
    type: "notification",
    method: "thread/tokenUsage/updated",
    params: {
      threadId: context.threadId,
      turnId: context.turnId,
      tokenUsage: {
        inputTokens: randomInt(20, 80),
        outputTokens: randomInt(30, 140),
      },
    },
  });
  steps.push({ type: "delay", ms: randomInt(80, 260) });
  steps.push({ type: "complete", status: "completed" });

  return { name: "default-manual-playbook", steps };
}

function assistantMessage(id: string, text: string): Record<string, unknown> {
  return {
    id,
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  };
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
