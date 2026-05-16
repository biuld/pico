/**
 * @deprecated Legacy Codex JSONL import/export adapter.
 * Preserved for one-off import/export use outside the runtime hot path.
 * Not used in the main TUI → Codex app-server flow.
 * See docs/pico-product-direction.md for current architecture.
 */
import { mkdir } from "node:fs/promises";

import {
  CodexAppServerClient,
  type CodexPersistentThread,
  type ThreadListParams,
  type ThreadListResponse,
} from "../codex/app-server";
import { picoConfig } from "../config";
import { now } from "../thread/id";
import { parseJsonl, writeJsonl } from "../thread/jsonl";
import { threadDir, threadPath } from "../thread/paths";
import { userInputResponseItem } from "../thread/store";
import type {
  PicoConfigSnapshot,
  TurnOverrides,
} from "../thread/types";

// Local types for the Codex import pipeline (uses legacy flat-entry format).
interface PicoThreadEntry {
  id: string;
  parentId: string;
  timestamp: string;
  item: { type: string; payload?: unknown };
}

interface PicoThreadHeader {
  type: "thread";
  version: number;
  id: string;
  createdAt: string;
  cwd: string;
  config: PicoConfigSnapshot;
}

type RawResponseItem = Record<string, unknown>;

export interface ImportCodexThreadsOptions {
  cwd?: string;
  allCwd?: boolean;
  dryRun?: boolean;
  client?: CodexImportClient;
  config?: Record<string, unknown>;
  codexHome?: string;
}

export interface CodexImportClient {
  codexHome: string;
  start(): Promise<void>;
  listThreads(params?: ThreadListParams): Promise<ThreadListResponse>;
  shutdown(): Promise<void>;
}

export type ImportCodexThreadStatus = "imported" | "would_import" | "skipped" | "failed";

export interface ImportCodexThreadItem {
  status: ImportCodexThreadStatus;
  codexThreadId: string;
  picoThreadId?: string;
  cwd?: string;
  path?: string;
  turnCount?: number;
  responseItemCount?: number;
  reason?: string;
}

export interface ImportCodexThreadsResult {
  dryRun: boolean;
  imported: number;
  wouldImport: number;
  skipped: number;
  failed: number;
  threads: ImportCodexThreadItem[];
}

export interface ConvertCodexRolloutOptions {
  codexThread: CodexPersistentThread;
  path: string;
  fallbackCwd: string;
  archived?: boolean;
}

export interface ConvertedCodexThread {
  header: PicoThreadHeader;
  entries: PicoThreadEntry[];
  cwd: string;
  codexThreadId: string;
  picoThreadId: string;
  turnCount: number;
  responseItemCount: number;
}

interface RolloutLine {
  timestamp?: string;
  type?: string;
  payload?: unknown;
}

interface ActiveTurn {
  entry: PicoThreadEntry;
  userInput: string;
  overrides: TurnOverrides;
  codexTurnId?: string;
  itemCount: number;
  failedReason?: string;
}

interface CodexSessionMeta {
  id?: string;
  timestamp?: string;
  cwd?: string;
  source?: unknown;
  originator?: unknown;
  cli_version?: string;
  model_provider?: string;
  modelProvider?: string;
}

const IMPORT_PAGE_LIMIT = 100;
const ALL_CODEX_SOURCE_KINDS = [
  "cli",
  "vscode",
  "exec",
  "appServer",
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther",
  "unknown",
];

export async function importCodexThreads(
  options: ImportCodexThreadsOptions = {},
): Promise<ImportCodexThreadsResult> {
  const inputCwd = options.cwd || process.cwd();
  const config = options.config || picoConfig.snapshot();
  const client = options.client || new CodexAppServerClient({ binary: (config.codexBinary as string) || picoConfig.get<string>("codexBinary") });
  const ownsClient = !options.client;
  const dryRun = options.dryRun === true;
  const items: ImportCodexThreadItem[] = [];

  let pathIndex: Map<string, string> | undefined;

  try {
    await client.start();
    const codexHome = options.codexHome || client.codexHome || defaultCodexHome();
    const threads = await listAllCodexThreads(client, options.allCwd ? undefined : inputCwd);

    for (const thread of threads) {
      const codexThreadId = thread.id;
      const fallbackCwd = options.allCwd ? stringValue(thread.cwd) || inputCwd : inputCwd;

      try {
        if (thread.ephemeral === true) {
          items.push({
            status: "skipped",
            codexThreadId,
            cwd: fallbackCwd,
            reason: "ephemeral Codex thread has no durable rollout",
          });
          continue;
        }

        let rolloutPath = await existingThreadPath(thread.path);
        if (!rolloutPath) {
          pathIndex ??= await buildCodexRolloutPathIndex(codexHome);
          rolloutPath = pathIndex.get(codexThreadId);
        }
        if (!rolloutPath) {
          items.push({
            status: "skipped",
            codexThreadId,
            cwd: fallbackCwd,
            reason: "no Codex rollout JSONL path found",
          });
          continue;
        }

        const converted = await convertCodexRolloutFile(rolloutPath, {
          codexThread: thread,
          path: rolloutPath,
          fallbackCwd,
          archived: Boolean((thread as Record<string, unknown>).archived),
        });

        const destination = threadPath(converted.cwd, converted.picoThreadId);
        if (await Bun.file(destination).exists().catch(() => false)) {
          items.push({
            status: "skipped",
            codexThreadId,
            picoThreadId: converted.picoThreadId,
            cwd: converted.cwd,
            path: destination,
            turnCount: converted.turnCount,
            responseItemCount: converted.responseItemCount,
            reason: "already imported",
          });
          continue;
        }

        if (dryRun) {
          items.push({
            status: "would_import",
            codexThreadId,
            picoThreadId: converted.picoThreadId,
            cwd: converted.cwd,
            path: destination,
            turnCount: converted.turnCount,
            responseItemCount: converted.responseItemCount,
          });
          continue;
        }

        await mkdir(threadDir(converted.cwd), { recursive: true });
        await writeJsonl(destination, [converted.header, ...converted.entries]);
        items.push({
          status: "imported",
          codexThreadId,
          picoThreadId: converted.picoThreadId,
          cwd: converted.cwd,
          path: destination,
          turnCount: converted.turnCount,
          responseItemCount: converted.responseItemCount,
        });
      } catch (err) {
        items.push({
          status: "failed",
          codexThreadId,
          cwd: fallbackCwd,
          reason: errorMessage(err),
        });
      }
    }
  } finally {
    if (ownsClient) await client.shutdown();
  }

  return {
    dryRun,
    imported: items.filter((item) => item.status === "imported").length,
    wouldImport: items.filter((item) => item.status === "would_import").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    failed: items.filter((item) => item.status === "failed").length,
    threads: items,
  };
}

export async function convertCodexRolloutFile(
  path: string,
  options: ConvertCodexRolloutOptions,
): Promise<ConvertedCodexThread> {
  const lines = parseJsonl(await Bun.file(path).text()) as RolloutLine[];
  return convertCodexRollout(lines, options);
}

export function convertCodexRollout(
  lines: readonly RolloutLine[],
  options: ConvertCodexRolloutOptions,
): ConvertedCodexThread {
  const sessionMeta = findSessionMeta(lines);
  const codexThreadId = sessionMeta.id || options.codexThread.id;
  if (!codexThreadId) throw new Error("Codex thread id is missing");

  const picoThreadId = importedPicoThreadId(codexThreadId);
  const firstTimestamp = lines.find((line) => typeof line.timestamp === "string")?.timestamp;
  const cwd = sessionMeta.cwd || stringValue(options.codexThread.cwd) || options.fallbackCwd;
  const createdAt = isoTimestamp(sessionMeta.timestamp) ||
    secondsTimestamp(options.codexThread.createdAt) ||
    isoTimestamp(firstTimestamp) ||
    now();
  const updatedAt = secondsTimestamp(options.codexThread.updatedAt) ||
    isoTimestamp(lines.toReversed().find((line) => typeof line.timestamp === "string")?.timestamp) ||
    createdAt;
  const header: PicoThreadHeader = {
    type: "thread",
    version: 1,
    id: picoThreadId,
    createdAt,
    cwd,
    config: compactRecord({
      runtime: "codex import",
      storage: "pico-jsonl-v1",
      importedFrom: "codex",
      codexThreadId,
      codexPath: options.path,
      codexSource: sessionMeta.source ?? options.codexThread.source,
      codexOriginator: sessionMeta.originator,
      codexCliVersion: sessionMeta.cli_version,
      codexArchived: options.archived,
      codexThreadName: options.codexThread.name,
      codexPreview: options.codexThread.preview,
      codexCreatedAt: secondsTimestamp(options.codexThread.createdAt),
      codexUpdatedAt: updatedAt,
      modelProvider: sessionMeta.model_provider || sessionMeta.modelProvider || options.codexThread.modelProvider,
    }),
  };

  const entries: PicoThreadEntry[] = [];
  const ids = createEntryIdFactory();
  let parentId: string = header.id;
  let active: ActiveTurn | undefined;

  const closeActiveTurn = (timestamp: string) => {
    if (!active) return;
    if (active.failedReason) {
      const failed: PicoThreadEntry = {
        id: ids("fail"),
        parentId,
        timestamp,
        item: {
          type: "event_msg",
          payload: {
            type: "turn_failed",
            turnId: active.entry.id,
            status: "failed",
            failedAt: timestamp,
            error: active.failedReason,
          },
        },
      };
      entries.push(failed);
      parentId = failed.id;
      active = undefined;
      return;
    }

    const completed: PicoThreadEntry = {
      id: ids("done"),
      parentId,
      timestamp,
      item: {
        type: "event_msg",
        payload: {
          type: "turn_completed",
          turnId: active.entry.id,
          status: "completed",
          completedAt: timestamp,
          result: compactRecord({
            importedFrom: "codex",
            codexThreadId,
            codexTurnId: active.codexTurnId,
          }),
        },
      },
    };
    entries.push(completed);
    parentId = completed.id;
    active = undefined;
  };

  const openTurn = (userInput: string, timestamp: string, overrides: TurnOverrides = {}) => {
    const entry: PicoThreadEntry = {
      id: ids("turn"),
      parentId,
      timestamp,
      item: {
        type: "response_item",
        payload: userInputResponseItem(ids("user"), userInput, timestamp, {
          ...overrides,
          cwd,
        }),
      },
    };
    entries.push(entry);
    parentId = entry.id;
    active = { entry, userInput, overrides: { ...overrides, cwd }, itemCount: 0 };
  };

  for (const line of lines) {
    const timestamp = isoTimestamp(line.timestamp) || updatedAt;
    const payload = line.payload;

    if (line.type === "event_msg") {
      const userInput = eventUserText(payload);
      if (userInput) {
        if (active && sameText(active.userInput, userInput) && active.itemCount <= 1) {
          continue;
        }
        closeActiveTurn(timestamp);
        openTurn(userInput, timestamp);
        continue;
      }
      const failure = eventFailureText(payload);
      if (failure && active) active.failedReason = failure;
      continue;
    }

    if (line.type === "turn_context") {
      const context = asRecord(payload);
      if (active && context) {
        active.codexTurnId = stringValue(context.turn_id) || stringValue(context.turnId) || active.codexTurnId;
        active.overrides = compactTurnOverrides({
          ...active.overrides,
          model: stringValue(context.model),
          modelProvider: stringValue(context.model_provider) || stringValue(context.modelProvider),
          approvalPolicy: stringValue(context.approval_policy) || stringValue(context.approvalPolicy),
          sandbox: context.sandbox_policy ?? context.sandbox,
          cwd: stringValue(context.cwd),
          personality: stringValue(context.personality),
        });
        applyUserInputOverrides(active.entry, active.overrides);
      }
      continue;
    }

    if (line.type !== "response_item") continue;
    const item = asRecord(payload);
    if (!item) continue;

    const userInput = responseItemUserText(item);
    if (userInput) {
      if (!active || !sameText(active.userInput, userInput) || active.itemCount > 1) {
        closeActiveTurn(timestamp);
        openTurn(userInput, timestamp);
      }
    } else if (!active) {
      if (isPreUserContextItem(item)) continue;
      openTurn("Imported Codex turn", timestamp);
    }

    const responseItem: PicoThreadEntry = {
      id: ids("item"),
      parentId,
      timestamp,
      item: {
        type: "response_item",
        payload: item as RawResponseItem,
      },
    };
    entries.push(responseItem);
    parentId = responseItem.id;
    active!.itemCount += 1;
  }

  closeActiveTurn(updatedAt);
  if (!entries.some(isImportedUserTurn)) {
    throw new Error("Codex rollout has no importable user turns");
  }

  return {
    header,
    entries,
    cwd,
    codexThreadId,
    picoThreadId,
    turnCount: entries.filter(isImportedUserTurn).length,
    responseItemCount: entries.filter((entry) => entry.item.type === "response_item").length,
  };
}

function isImportedUserTurn(entry: PicoThreadEntry): boolean {
  if (entry.item.type !== "response_item") return false;
  return (entry.item.payload as Record<string, unknown>)?.role === "user";
}

function applyUserInputOverrides(entry: PicoThreadEntry, overrides: TurnOverrides): void {
  if (entry.item.type !== "response_item") return;
  const payload = entry.item.payload as Record<string, unknown>;
  const pico = payload.pico;
  if (!pico || typeof pico !== "object" || Array.isArray(pico)) return;
  (pico as Record<string, unknown>).overrides = overrides;
  (pico as Record<string, unknown>).cwd = overrides.cwd;
}

export function importedPicoThreadId(codexThreadId: string): string {
  return `codex_${codexThreadId.replace(/[^A-Za-z0-9_.-]/g, "_")}`;
}

async function listAllCodexThreads(
  client: CodexImportClient,
  cwd?: string,
): Promise<CodexPersistentThread[]> {
  const byId = new Map<string, CodexPersistentThread>();
  for (const archived of [false, true]) {
    let cursor: string | null | undefined;
    do {
      const response = await client.listThreads({
        cursor,
        limit: IMPORT_PAGE_LIMIT,
        sortKey: "updated_at",
        sortDirection: "desc",
        archived,
        cwd,
        sourceKinds: ALL_CODEX_SOURCE_KINDS as ThreadListParams["sourceKinds"],
      });
      for (const thread of response.data) {
        byId.set(thread.id, { ...thread, archived });
      }
      cursor = response.nextCursor;
    } while (cursor);
  }
  return [...byId.values()];
}

async function existingThreadPath(path: unknown): Promise<string | undefined> {
  const value = stringValue(path);
  if (!value) return undefined;
  return await Bun.file(value).exists().catch(() => false) ? value : undefined;
}

async function buildCodexRolloutPathIndex(codexHome: string): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  for (const relativePath of await codexRolloutRelativePaths(codexHome)) {
    const path = `${codexHome}/${relativePath}`;
    try {
      const firstLine = await readFirstLine(path);
      if (!firstLine) continue;
      const parsed = JSON.parse(firstLine) as RolloutLine;
      const meta = asRecord(parsed.payload);
      const id = parsed.type === "session_meta" ? stringValue(meta?.id) : undefined;
      if (id) index.set(id, path);
    } catch {
      // Ignore unreadable historical rollouts; the importer reports missing paths per thread.
    }
  }
  return index;
}

async function codexRolloutRelativePaths(codexHome: string): Promise<string[]> {
  const paths: string[] = [];
  for await (const path of new Bun.Glob("sessions/**/*.jsonl").scan(codexHome)) {
    paths.push(path);
  }
  for await (const path of new Bun.Glob("archived_sessions/*.jsonl").scan(codexHome)) {
    paths.push(path);
  }
  return paths;
}

async function readFirstLine(path: string): Promise<string | undefined> {
  const reader = Bun.file(path).stream().getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text.trim() || undefined;
      text += decoder.decode(value, { stream: true });
      const newline = text.indexOf("\n");
      if (newline >= 0) return text.slice(0, newline);
      if (text.length > 1_000_000) return undefined;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function findSessionMeta(lines: readonly RolloutLine[]): CodexSessionMeta {
  for (const line of lines) {
    if (line.type !== "session_meta") continue;
    const payload = asRecord(line.payload);
    if (!payload) continue;
    return {
      id: stringValue(payload.id),
      timestamp: stringValue(payload.timestamp),
      cwd: stringValue(payload.cwd),
      source: payload.source,
      originator: payload.originator,
      cli_version: stringValue(payload.cli_version),
      model_provider: stringValue(payload.model_provider),
      modelProvider: stringValue(payload.modelProvider),
    };
  }
  return {};
}

function responseItemUserText(item: Record<string, unknown>): string | undefined {
  if (item.type !== "message" || item.role !== "user") return undefined;
  return messageContentText(item) || undefined;
}

function eventUserText(payload: unknown): string | undefined {
  const event = asRecord(payload);
  if (!event || event.type !== "user_message") return undefined;
  return stringValue(event.message) || stringValue(event.text);
}

function eventFailureText(payload: unknown): string | undefined {
  const event = asRecord(payload);
  if (!event) return undefined;
  const type = stringValue(event.type);
  if (type !== "turn_failed" && type !== "turn_error" && type !== "turn_aborted") {
    return undefined;
  }
  return stringValue(event.message) || stringValue(event.error) || type;
}

function messageContentText(item: Record<string, unknown>): string {
  const content = item.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      const value = asRecord(part);
      return stringValue(value?.text);
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function isPreUserContextItem(item: Record<string, unknown>): boolean {
  return item.type === "message" && (item.role === "developer" || item.role === "system");
}

function createEntryIdFactory(): (prefix: string) => string {
  const counts = new Map<string, number>();
  return (prefix: string) => {
    const next = (counts.get(prefix) || 0) + 1;
    counts.set(prefix, next);
    return `${prefix}_${next.toString(36).padStart(4, "0")}`;
  };
}

function compactRecord<T extends Record<string, unknown>>(record: T): PicoConfigSnapshot {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null),
  );
}

function compactTurnOverrides(overrides: TurnOverrides): TurnOverrides {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined && value !== null),
  ) as TurnOverrides;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : value;
}

function secondsTimestamp(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Date(value * 1000).toISOString();
}

function sameText(left: string, right: string): boolean {
  return left.replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();
}

function defaultCodexHome(): string {
  const home = Bun.env.HOME || process.env.HOME || ".";
  return `${home}/.codex`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
