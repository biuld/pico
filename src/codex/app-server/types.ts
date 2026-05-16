import type {
  InitializeParams,
  InitializeResponse,
  ServerNotification,
  ServerRequest,
} from "@pico/codex-app-server-protocol";
import type { JsonValue } from "@pico/codex-app-server-protocol/serde_json";
import type {
  Config as ProtocolConfig,
  ConfigReadParams,
  ConfigReadResponse as ProtocolConfigReadResponse,
  Model as ProtocolModel,
  ModelListParams,
  ModelListResponse as ProtocolModelListResponse,
  TextElement as ProtocolTextElement,
  Thread as ProtocolThread,
  ThreadInjectItemsParams as ProtocolThreadInjectItemsParams,
  ThreadListParams as ProtocolThreadListParams,
  ThreadListResponse as ProtocolThreadListResponse,
  ThreadReadParams as ProtocolThreadReadParams,
  ThreadReadResponse as ProtocolThreadReadResponse,
  ThreadStartParams as ProtocolThreadStartParams,
  ThreadStartResponse as ProtocolThreadStartResponse,
  TurnInterruptParams as ProtocolTurnInterruptParams,
  TurnInterruptResponse as ProtocolTurnInterruptResponse,
  TurnStartParams as ProtocolTurnStartParams,
  TurnStartResponse as ProtocolTurnStartResponse,
  UserInput as ProtocolUserInput,
  // P0 - Config
  ConfigValueWriteParams,
  ConfigWriteResponse,
  ConfigBatchWriteParams,
  // P0 - Thread
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadRollbackParams,
  ThreadRollbackResponse,
  ThreadCompactStartParams,
  ThreadCompactStartResponse,
  ThreadArchiveParams,
  ThreadArchiveResponse,
  ThreadUnarchiveParams,
  ThreadUnarchiveResponse,
  ThreadSetNameParams,
  ThreadSetNameResponse,
  ThreadMetadataUpdateParams,
  ThreadMetadataUpdateResponse,
  // P0 - Turn
  TurnSteerParams,
  TurnSteerResponse,
  // P1 - Command
  CommandExecParams,
  CommandExecResponse,
  CommandExecWriteParams,
  CommandExecWriteResponse,
  CommandExecResizeParams,
  CommandExecResizeResponse,
  CommandExecTerminateParams,
  CommandExecTerminateResponse,
  // P1 - FS
  FsReadFileParams,
  FsReadFileResponse,
  FsReadDirectoryParams,
  FsReadDirectoryResponse,
  FsGetMetadataParams,
  FsGetMetadataResponse,
  FsWatchParams,
  FsWatchResponse,
  FsUnwatchParams,
  FsUnwatchResponse,
  // P1 - Review
  ReviewStartParams,
  ReviewStartResponse,
  // P1 - Model
  ModelProviderCapabilitiesReadParams,
  ModelProviderCapabilitiesReadResponse,
  // P1 - Account
  GetAccountParams,
  GetAccountResponse,
  GetAccountRateLimitsResponse,
  LoginAccountParams,
  LoginAccountResponse,
  LogoutAccountResponse,
} from "@pico/codex-app-server-protocol/v2";

export type {
  // Existing
  ConfigReadParams,
  InitializeParams,
  InitializeResponse,
  ModelListParams,
  ServerNotification,
  ServerRequest,
  // P0 - Config
  ConfigValueWriteParams,
  ConfigWriteResponse,
  ConfigBatchWriteParams,
  // P0 - Thread
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadRollbackParams,
  ThreadRollbackResponse,
  ThreadCompactStartParams,
  ThreadCompactStartResponse,
  ThreadArchiveParams,
  ThreadArchiveResponse,
  ThreadUnarchiveParams,
  ThreadUnarchiveResponse,
  ThreadSetNameParams,
  ThreadSetNameResponse,
  ThreadMetadataUpdateParams,
  ThreadMetadataUpdateResponse,
  // P0 - Turn
  TurnSteerParams,
  TurnSteerResponse,
  // P1 - Command
  CommandExecParams,
  CommandExecResponse,
  CommandExecWriteParams,
  CommandExecWriteResponse,
  CommandExecResizeParams,
  CommandExecResizeResponse,
  CommandExecTerminateParams,
  CommandExecTerminateResponse,
  // P1 - FS
  FsReadFileParams,
  FsReadFileResponse,
  FsReadDirectoryParams,
  FsReadDirectoryResponse,
  FsGetMetadataParams,
  FsGetMetadataResponse,
  FsWatchParams,
  FsWatchResponse,
  FsUnwatchParams,
  FsUnwatchResponse,
  // P1 - Review
  ReviewStartParams,
  ReviewStartResponse,
  // P1 - Model
  ModelProviderCapabilitiesReadParams,
  ModelProviderCapabilitiesReadResponse,
  // P1 - Account
  GetAccountParams,
  GetAccountResponse,
  GetAccountRateLimitsResponse,
  LoginAccountParams,
  LoginAccountResponse,
  LogoutAccountResponse,
};

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

export type ConfigReadResponse = Omit<
  Partial<ProtocolConfigReadResponse>,
  "config" | "origins" | "layers"
> & {
  config: CodexConfig;
  origins?: Record<string, unknown>;
  layers?: unknown[] | null;
};

export type CodexConfig = Partial<ProtocolConfig> & {
  model?: string | null;
  modelProvider?: string | null;
  model_provider?: string | null;
  approvalPolicy?: string | null;
  approval_policy?: string | null;
  sandbox?: unknown;
  sandboxMode?: unknown;
  sandbox_mode?: unknown;
  [key: string]: unknown;
};

export type ModelListResponse = Omit<ProtocolModelListResponse, "data" | "nextCursor"> & {
  data: CodexModel[];
  nextCursor?: string | null;
};

export type CodexModel = Partial<ProtocolModel> & {
  id: string;
  model: string;
  displayName?: string;
  hidden?: boolean;
  isDefault?: boolean;
  [key: string]: unknown;
};

export type ThreadStartParams = Omit<
  Partial<ProtocolThreadStartParams>,
  "approvalPolicy" | "sandbox" | "personality"
> & {
  approvalPolicy?: ProtocolThreadStartParams["approvalPolicy"] | string | null;
  sandbox?: ProtocolThreadStartParams["sandbox"] | string | null;
  personality?: ProtocolThreadStartParams["personality"] | string | null;
  experimentalRawEvents?: boolean | null;
};

export type ThreadStartResponse = Partial<Omit<ProtocolThreadStartResponse, "thread" | "cwd">> & {
  thread: ThreadInfo;
  model: string;
  modelProvider: string;
  cwd: string;
};

export type ThreadInfo = Partial<ProtocolThread> & {
  id: string;
  status?: unknown;
  [key: string]: unknown;
};

export type CodexPersistentThread = Partial<ProtocolThread> & {
  id: string;
  cwd?: string;
  path?: string | null;
  createdAt?: number;
  updatedAt?: number;
  preview?: string;
  name?: string | null;
  modelProvider?: string;
  source?: unknown;
  threadSource?: unknown;
  forkedFromId?: string | null;
  ephemeral?: boolean;
  [key: string]: unknown;
};

export type ThreadListParams = Partial<ProtocolThreadListParams>;

export type ThreadListResponse = Omit<Partial<ProtocolThreadListResponse>, "data"> & {
  data: CodexPersistentThread[];
  nextCursor?: string | null;
  backwardsCursor?: string | null;
};

export type ThreadReadParams = ProtocolThreadReadParams;

export type ThreadReadResponse = Omit<ProtocolThreadReadResponse, "thread"> & {
  thread: CodexPersistentThread;
};

export type ThreadInjectItemsParams = Omit<ProtocolThreadInjectItemsParams, "items"> & {
  items: JsonValue[] | unknown[];
};

export type TurnStartParams = Omit<
  Partial<ProtocolTurnStartParams>,
  "threadId" | "input" | "approvalPolicy" | "personality"
> & {
  threadId: string;
  input: UserInputItem[];
  approvalPolicy?: ProtocolTurnStartParams["approvalPolicy"] | string | null;
  personality?: ProtocolTurnStartParams["personality"] | string | null;
  model?: string | null;
  modelProvider?: string;
  cwd?: string;
  sandbox?: unknown;
  developerInstructions?: string;
  outputSchema?: unknown;
  effort?: string;
  collaborationMode?: unknown;
};

export type UserInputItem = Extract<ProtocolUserInput, { type: "text" }> | {
  type: "text";
  text: string;
  text_elements?: TextElement[];
  textElements?: TextElement[];
};

export type TextElement = ProtocolTextElement;

export type TurnStartResponse = Omit<ProtocolTurnStartResponse, "turn"> & {
  turn: { id: string; status?: unknown };
};

export type TurnInterruptParams = ProtocolTurnInterruptParams;

export type TurnInterruptResponse = ProtocolTurnInterruptResponse;
