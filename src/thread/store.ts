import { mkdir, mkdtemp, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { entryMovesLeaf } from "./entries";
import { now, randomHex, uuidV7 } from "./id";
import { appendJsonlLine, parseJsonl, writeJsonl } from "./jsonl";
import { threadDir, threadPath } from "./paths";
import { summarizeThreadJsonl } from "./summary";
import {
  childrenOf as threadChildrenOf,
  collectResponseItems,
  getPathEntries as threadPathEntries,
  isUserInputEntry,
  linearizeForCodex as threadLinearizeForCodex,
} from "./tree";
import type {
  PicoConfigSnapshot,
  PicoThreadEntry,
  PicoThreadHeader,
  PicoThreadInfo,
  RawResponseItem,
  ResponseItem,
  RolloutEntry,
  RolloutItem,
  TurnOverrides,
  UserInputResponseItem,
} from "./types";
import {
  CURRENT_THREAD_VERSION,
  validateLoadedThreadEntry,
  validatePicoThreadHeader,
} from "./validate";

export type {
  BaseEntry,
  BranchEntry,
  CodexResponseItem,
  ConfigChangeEntry,
  LabelEntry,
  PicoConfigSnapshot,
  RawResponseItem,
  ResponseItem,
  ResponseItemEntry,
  RolloutEntry,
  RolloutItem,
  PicoThreadEntry,
  PicoThreadHeader,
  PicoThreadInfo,
  TurnAbortedEntry,
  TurnCompletedEntry,
  TurnEntry,
  TurnFailedEntry,
  TurnOverrides,
  TurnStatus,
  UserInputResponseItem,
} from "./types";

export class PicoThreadStore {
  private header: PicoThreadHeader;
  private entries: PicoThreadEntry[] = [];
  private entryIds = new Set<string>();
  private _leafId: string;
  private filePath: string;

  private constructor(header: PicoThreadHeader, filePath: string) {
    this.header = header;
    this.filePath = filePath;
    this._leafId = header.id;
    this.entryIds.add(header.id);
  }

  get id(): string {
    return this.header.id;
  }

  get cwd(): string {
    return this.header.cwd;
  }

  get config(): PicoConfigSnapshot {
    return this.header.config;
  }

  get leafId(): string {
    return this._leafId;
  }

  get path(): string {
    return this.filePath;
  }

  get allEntries(): readonly PicoThreadEntry[] {
    return this.entries;
  }

  static async create(
    cwd: string = process.cwd(),
    config: PicoConfigSnapshot = {},
  ): Promise<PicoThreadStore> {
    const header: PicoThreadHeader = {
      type: "thread",
      version: CURRENT_THREAD_VERSION,
      id: uuidV7(),
      createdAt: now(),
      cwd,
      config,
    };
    const dir = threadDir(cwd);
    await mkdir(dir, { recursive: true });
    const path = threadPath(cwd, header.id);
    await writeJsonl(path, [header]);
    return new PicoThreadStore(header, path);
  }

  static async load(cwd: string, threadId: string): Promise<PicoThreadStore> {
    const path = threadPath(cwd, threadId);
    const file = Bun.file(path);
    if (!(await file.exists())) {
      throw new Error(`Thread not found: ${path}`);
    }

    const lines = parseJsonl(await file.text());
    if (lines.length === 0) {
      throw new Error(`Empty thread file: ${path}`);
    }

    const header = validatePicoThreadHeader(lines[0], path);

    const store = new PicoThreadStore(header, path);
    for (const raw of lines.slice(1)) {
      const entry = store.validateLoadedEntry(raw);
      store.addLoadedEntry(entry, entryMovesLeaf(entry));
    }
    return store;
  }

  static async list(cwd: string = process.cwd()): Promise<PicoThreadInfo[]> {
    const dir = threadDir(cwd);
    let filenames: string[];
    try {
      filenames = await readdir(dir);
    } catch (err) {
      if (isMissingDirectory(err)) return [];
      throw err;
    }

    const threads: PicoThreadInfo[] = [];
    for (const filename of filenames.filter((name) => name.endsWith(".jsonl"))) {
      const content = await Bun.file(`${dir}/${filename}`).text();
      const info = summarizeThreadJsonl(parseJsonl(content));
      if (info) threads.push(info);
    }

    return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  backtrack(entryId: string): void {
    if (!this.hasEntry(entryId)) throw new Error(`Entry not found: ${entryId}`);
    this._leafId = entryId;
  }

  async appendRolloutItem(
    parentId: string | null,
    item: RolloutItem,
  ): Promise<RolloutEntry> {
    this.assertParent(parentId);
    const entry: RolloutEntry = {
      id: this.nextEntryId(item.type === "branch_out" ? "branch" : "item"),
      parentId,
      timestamp: now(),
      item,
    };
    await this.appendEntry(entry, true);
    return entry;
  }

  async appendResponseItem(
    parentId: string,
    responseItemOrTurnId: ResponseItem | string,
    maybeResponseItem?: ResponseItem,
  ): Promise<RolloutEntry> {
    const responseItem = maybeResponseItem || responseItemOrTurnId;
    if (typeof responseItem === "string") {
      throw new Error("Invalid response_item payload");
    }
    return this.appendRolloutItem(parentId, { type: "response_item", payload: responseItem });
  }

  async appendTurn(
    parentId: string,
    userInput: string,
    overrides: TurnOverrides = {},
  ): Promise<RolloutEntry> {
    return this.appendUserInput(parentId, userInput, overrides);
  }

  async appendResponseItemForTurn(
    parentId: string,
    _turnId: string,
    responseItem: ResponseItem,
  ): Promise<RolloutEntry> {
    return this.appendResponseItem(parentId, responseItem);
  }

  async appendUserInput(
    parentId: string,
    text: string,
    overrides: TurnOverrides = {},
  ): Promise<RolloutEntry> {
    const timestamp = now();
    return this.appendRolloutItem(parentId, {
      type: "response_item",
      payload: userInputResponseItem(this.nextEntryId("user"), text, timestamp, {
        ...overrides,
        cwd: overrides.cwd || this.cwd,
      }),
    });
  }

  async appendEventMsg(parentId: string, payload: unknown): Promise<RolloutEntry> {
    return this.appendRolloutItem(parentId, { type: "event_msg", payload });
  }

  async appendTurnCompleted(
    parentId: string,
    turnId: string,
    result?: unknown,
  ): Promise<RolloutEntry> {
    return this.appendEventMsg(parentId, {
      type: "turn_completed",
      turnId,
      result,
      completedAt: now(),
    });
  }

  async appendTurnFailed(
    parentId: string,
    turnId: string,
    error: Error | string,
  ): Promise<RolloutEntry> {
    return this.appendEventMsg(parentId, {
      type: "turn_failed",
      turnId,
      error: error instanceof Error ? error.message : error,
      failedAt: now(),
    });
  }

  async appendTurnAborted(
    parentId: string,
    turnId: string,
    reason?: string,
  ): Promise<RolloutEntry> {
    return this.appendEventMsg(parentId, {
      type: "turn_aborted",
      turnId,
      reason,
      abortedAt: now(),
    });
  }

  async ensureBranchForAppend(): Promise<string> {
    const leafId = this.leafId;
    if (leafId === this.header.id) {
      if (this.childrenOf(leafId).length === 0) return leafId;
      const branch = await this.appendRolloutItem(leafId, { type: "branch_out" });
      return branch.id;
    }

    const leaf = this.entryById(leafId);
    if (!leaf) return leafId;
    if (leaf.item.type === "branch_out" && this.childrenOf(leafId).length === 0) return leafId;
    if (this.childrenOf(leafId).length === 0) return leafId;

    const branch = await this.appendRolloutItem(leafId, { type: "branch_out" });
    return branch.id;
  }

  getPathEntries(leafId: string = this.leafId): PicoThreadEntry[] {
    return threadPathEntries(this.header.id, this.entries, leafId);
  }

  linearizeForCodex(leafId: string = this.leafId): unknown[] {
    return threadLinearizeForCodex(this.header.id, this.entries, leafId);
  }

  async writeLinearizedRolloutFile(leafId: string = this.leafId): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "pico-rollout-"));
    const path = join(dir, "thread.jsonl");
    await writeJsonl(path, this.linearizeForCodex(leafId));
    return path;
  }

  childrenOf(parentId: string): PicoThreadEntry[] {
    return threadChildrenOf(this.entries, parentId);
  }

  collectInjectItems(leafId: string = this.leafId): ResponseItem[] {
    return collectResponseItems(this.header.id, this.entries, leafId).filter(
      (item) => item.role !== "user",
    );
  }

  labels(): Map<string, string> {
    return new Map();
  }

  checkout(entryId: string): void {
    this.backtrack(entryId);
  }

  async appendBranch(targetId: string): Promise<RolloutEntry> {
    this.backtrack(targetId);
    return this.appendRolloutItem(targetId, { type: "branch_out" });
  }

  async appendLabel(_targetId: string, _label: string): Promise<never> {
    throw new Error("Labels are out of scope for rollout storage");
  }

  private async appendEntry(entry: PicoThreadEntry, moveLeaf: boolean): Promise<void> {
    this.addLoadedEntry(entry, moveLeaf);
    await appendJsonlLine(this.filePath, entry);
  }

  private addLoadedEntry(entry: PicoThreadEntry, moveLeaf = true): void {
    if (this.entryIds.has(entry.id)) {
      throw new Error(`Duplicate thread entry id: ${entry.id}`);
    }
    this.entryIds.add(entry.id);
    this.entries.push(entry);
    if (moveLeaf) this._leafId = entry.id;
  }

  private hasEntry(id: string): boolean {
    return id === this.header.id || this.entryIds.has(id);
  }

  private entryById(id: string): PicoThreadEntry | undefined {
    return this.entries.find((entry) => entry.id === id);
  }

  private assertParent(parentId: string | null): void {
    if (parentId !== null && !this.hasEntry(parentId)) {
      throw new Error(`Parent entry not found: ${parentId}`);
    }
  }

  private validateLoadedEntry(raw: unknown): PicoThreadEntry {
    return validateLoadedThreadEntry(raw, {
      assertParent: (parentId) => this.assertParent(parentId),
    });
  }

  private nextEntryId(prefix: string): string {
    let id = "";
    do {
      id = `${prefix}_${randomHex(6)}`;
    } while (this.entryIds.has(id));
    return id;
  }
}

export function userInputResponseItem(
  id: string,
  text: string,
  timestamp: string = now(),
  overrides: TurnOverrides = {},
): UserInputResponseItem {
  return {
    id,
    type: "message",
    role: "user",
    content: [{ type: "input_text", text }],
    pico: {
      kind: "user_input",
      status: "started",
      overrides,
      cwd: overrides.cwd,
    },
    created_at: timestamp,
  };
}

export function userTextFromResponseItem(item: ResponseItem): string | undefined {
  if (item.role !== "user") return undefined;
  const content = item.content;
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const value = part as Record<string, unknown>;
      return typeof value.text === "string" ? value.text : "";
    })
    .filter(Boolean);
  return parts.join("\n") || undefined;
}

export function entryUserText(entry: RolloutEntry): string | undefined {
  return isUserInputEntry(entry) && entry.item.type === "response_item"
    ? userTextFromResponseItem(entry.item.payload)
    : undefined;
}

function isMissingDirectory(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as { code?: string }).code === "ENOENT";
}
