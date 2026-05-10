// Codex app-server JSON-RPC protocol types
// Based on codex-rs app-server-protocol

export type RequestId = number | string;

export interface JSONRPCRequest {
  id: RequestId;
  method: string;
  params?: unknown;
  trace?: unknown;
}

export interface JSONRPCResponse {
  id: RequestId;
  result: unknown;
}

export interface JSONRPCError {
  id: RequestId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JSONRPCNotification {
  method: string;
  params?: unknown;
}

export type JSONRPCMessage =
  | { type: "request"; value: JSONRPCRequest }
  | { type: "response"; value: JSONRPCResponse }
  | { type: "error"; value: JSONRPCError }
  | { type: "notification"; value: JSONRPCNotification };

// Initialize
export interface InitializeParams {
  clientInfo: {
    name: string;
    title?: string;
    version: string;
  };
  capabilities?: {
    experimentalApi?: boolean;
    requestAttestation?: boolean;
    optOutNotificationMethods?: string[];
  };
}

export interface InitializeResponse {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
}

// Thread
export interface ThreadStartParams {
  model?: string;
  modelProvider?: string;
  cwd?: string;
  ephemeral?: boolean;
  experimentalRawEvents?: boolean;
  approvalPolicy?: string;
  sandbox?: string;
  personality?: string;
  baseInstructions?: string;
  developerInstructions?: string;
}

export interface ThreadStartResponse {
  thread: ThreadInfo;
  model: string;
  modelProvider: string;
  cwd: string;
}

export interface ThreadInfo {
  id: string;
  sessionId: string;
  forkedFromId: string | null;
  preview: string;
  ephemeral: boolean;
  modelProvider: string;
  createdAt: number;
  updatedAt: number;
  status: string;
  path: string | null;
  cwd: string;
  cliVersion: string;
  source: string;
  turns: TurnInfo[];
}

export interface TurnInfo {
  id: string;
  status: string;
  items: unknown[];
  itemsView: string;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
}

// Inject items
export interface ThreadInjectItemsParams {
  threadId: string;
  items: unknown[]; // ResponseItem[]
}

// Turn
export interface TurnStartParams {
  threadId: string;
  input: UserInputItem[];
  model?: string;
  modelProvider?: string;
  cwd?: string;
  approvalPolicy?: string;
  sandbox?: unknown;
  personality?: string;
  developerInstructions?: string;
  outputSchema?: unknown;
  effort?: string;
  collaborationMode?: unknown;
}

export interface UserInputItem {
  type: "text";
  text: string;
  textElements?: TextElement[];
}

export interface TextElement {
  byteRange: { start: number; end: number };
  placeholder?: string;
}

// Turn start response
export interface TurnStartResponse {
  turn: { id: string; status: string };
}

// Turn interrupt
export interface TurnInterruptParams {
  threadId: string;
  turnId: string;
}

// Search
export interface FuzzyFileSearchParams {
  query: string;
  roots: string[];
  cancellationToken?: string;
}

export interface FuzzyFileSearchResult {
  root: string;
  path: string;
  matchType: string;
  fileName: string;
  score: number;
  indices?: number[];
}

export interface FuzzyFileSearchResponse {
  files: FuzzyFileSearchResult[];
}
