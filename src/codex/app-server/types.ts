// Codex app-server JSON-RPC protocol types.
// Based on codex-rs app-server-protocol.

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

export interface ConfigReadParams {
  includeLayers: boolean;
  cwd?: string | null;
}

export interface ConfigReadResponse {
  config: CodexConfig;
  origins?: Record<string, unknown>;
  layers?: unknown[] | null;
}

export interface CodexConfig {
  model?: string | null;
  modelProvider?: string | null;
  model_provider?: string | null;
  approvalPolicy?: string | null;
  approval_policy?: string | null;
  sandbox?: unknown;
  sandboxMode?: unknown;
  sandbox_mode?: unknown;
  [key: string]: unknown;
}

export interface ModelListParams {
  cursor?: string | null;
  limit?: number | null;
  includeHidden?: boolean | null;
}

export interface ModelListResponse {
  data: CodexModel[];
  nextCursor?: string | null;
}

export interface CodexModel {
  id: string;
  model: string;
  displayName?: string;
  hidden?: boolean;
  isDefault?: boolean;
  [key: string]: unknown;
}

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
  status: string;
  [key: string]: unknown;
}

export interface ThreadInjectItemsParams {
  threadId: string;
  items: unknown[];
}

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

export interface TurnStartResponse {
  turn: { id: string; status: string };
}
