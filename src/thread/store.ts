import { mkdir, readdir } from "node:fs/promises";

import { entryMovesLeaf, isTerminalTurnEntry } from "./entries";
import { now, randomHex, uuidV7 } from "./id";
import { appendJsonlLine, parseJsonl, writeJsonl } from "./jsonl";
import { threadDir, threadPath } from "./paths";
import { summarizeThreadJsonl } from "./summary";
import {
  childrenOf as threadChildrenOf,
  collectInjectItems as threadCollectInjectItems,
  getPathEntries as threadPathEntries,
  labels as threadLabels,
} from "./tree";
import type {
  BranchEntry,
  ConfigChangeEntry,
  LabelEntry,
  PicoConfigSnapshot,
  ResponseItem,
  ResponseItemEntry,
  PicoThreadEntry,
  PicoThreadHeader,
  PicoThreadInfo,
  TurnAbortedEntry,
  TurnCompletedEntry,
  TurnEntry,
  TurnFailedEntry,
  TurnOverrides,
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
  PicoThreadEntry,
  PicoThreadHeader,
  PicoThreadInfo,
  TurnAbortedEntry,
  TurnCompletedEntry,
  TurnEntry,
  TurnFailedEntry,
  TurnOverrides,
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
      if (isMissingDirectory(err)) {
        return [];
      }
      throw err;
    }

    const jsonlFiles = filenames.filter((filename) => filename.endsWith(".jsonl"));
    if (jsonlFiles.length === 0) {
      return [];
    }

    const threads: PicoThreadInfo[] = [];
    for (const filename of jsonlFiles) {
      const content = await Bun.file(`${dir}/${filename}`).text();
      const lines = parseJsonl(content);
      const info = summarizeThreadJsonl(lines);
      if (info) threads.push(info);
    }

    return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async appendTurn(
    parentId: string | null,
    userInput: string,
    overrides: TurnOverrides = {},
  ): Promise<TurnEntry> {
    this.assertParent(parentId);
    const id = this.nextEntryId("turn");
    const timestamp = now();
    const entry: TurnEntry = {
      type: "turn",
      id,
      parentId,
      timestamp,
      userInput,
      cwd: overrides.cwd || this.cwd,
      overrides,
      status: "started",
      startedAt: timestamp,
    };
    await this.appendEntry(entry, true);
    return entry;
  }

  async appendResponseItem(
    parentId: string,
    turnId: string,
    responseItem: ResponseItem,
  ): Promise<ResponseItemEntry> {
    this.assertParent(parentId);
    this.assertTurn(turnId);
    const entry: ResponseItemEntry = {
      type: "response_item",
      id: this.nextEntryId("item"),
      parentId,
      timestamp: now(),
      turnId,
      responseItem,
    };
    await this.appendEntry(entry, true);
    return entry;
  }

  async appendTurnCompleted(
    parentId: string,
    turnId: string,
    result?: unknown,
  ): Promise<TurnCompletedEntry> {
    this.assertParent(parentId);
    this.assertTurn(turnId);
    this.assertTurnHasNoTerminalEntry(turnId);
    const timestamp = now();
    const entry: TurnCompletedEntry = {
      type: "turn_completed",
      id: this.nextEntryId("done"),
      parentId,
      timestamp,
      turnId,
      status: "completed",
      completedAt: timestamp,
      result,
    };
    await this.appendEntry(entry, true);
    return entry;
  }

  async appendTurnFailed(
    parentId: string,
    turnId: string,
    error: Error | string,
  ): Promise<TurnFailedEntry> {
    this.assertParent(parentId);
    this.assertTurn(turnId);
    this.assertTurnHasNoTerminalEntry(turnId);
    const timestamp = now();
    const entry: TurnFailedEntry = {
      type: "turn_failed",
      id: this.nextEntryId("fail"),
      parentId,
      timestamp,
      turnId,
      status: "failed",
      failedAt: timestamp,
      error: error instanceof Error ? error.message : error,
    };
    await this.appendEntry(entry, true);
    return entry;
  }

  async appendTurnAborted(
    parentId: string,
    turnId: string,
    reason?: string,
  ): Promise<TurnAbortedEntry> {
    this.assertParent(parentId);
    this.assertTurn(turnId);
    this.assertTurnHasNoTerminalEntry(turnId);
    const timestamp = now();
    const entry: TurnAbortedEntry = {
      type: "turn_aborted",
      id: this.nextEntryId("abort"),
      parentId,
      timestamp,
      turnId,
      status: "aborted",
      abortedAt: timestamp,
      reason,
    };
    await this.appendEntry(entry, true);
    return entry;
  }

  async appendLabel(targetId: string, label: string): Promise<LabelEntry> {
    this.assertParent(targetId);
    const entry: LabelEntry = {
      type: "label",
      id: this.nextEntryId("label"),
      parentId: targetId,
      timestamp: now(),
      targetId,
      label,
    };
    await this.appendEntry(entry, false);
    return entry;
  }

  async appendBranch(targetId: string, name?: string): Promise<BranchEntry> {
    this.assertParent(targetId);
    const entry: BranchEntry = {
      type: "branch",
      id: this.nextEntryId("branch"),
      parentId: targetId,
      timestamp: now(),
      targetId,
      name,
    };
    await this.appendEntry(entry, true);
    return entry;
  }

  async appendConfigChange(config: PicoConfigSnapshot): Promise<ConfigChangeEntry> {
    const entry: ConfigChangeEntry = {
      type: "config_change",
      id: this.nextEntryId("config"),
      parentId: this.leafId,
      timestamp: now(),
      config,
    };
    await this.appendEntry(entry, true);
    return entry;
  }

  checkout(entryId: string): void {
    if (!this.hasEntry(entryId)) {
      throw new Error(`Entry not found: ${entryId}`);
    }
    this._leafId = entryId;
  }

  getPathEntries(leafId: string = this.leafId): PicoThreadEntry[] {
    return threadPathEntries(this.header.id, this.entries, leafId);
  }

  collectInjectItems(leafId: string = this.leafId): ResponseItem[] {
    return threadCollectInjectItems(this.header.id, this.entries, leafId);
  }

  childrenOf(parentId: string): PicoThreadEntry[] {
    return threadChildrenOf(this.entries, parentId);
  }

  labels(): Map<string, string> {
    return threadLabels(this.entries);
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
    this.applyEntryDerivedState(entry);
    if (moveLeaf) this._leafId = entry.id;
  }

  private hasEntry(id: string): boolean {
    return id === this.header.id || this.entryIds.has(id);
  }

  private assertParent(parentId: string | null): void {
    if (parentId !== null && !this.hasEntry(parentId)) {
      throw new Error(`Parent entry not found: ${parentId}`);
    }
  }

  private assertTurn(turnId: string): void {
    if (!this.entries.some((entry) => entry.type === "turn" && entry.id === turnId)) {
      throw new Error(`Turn entry not found: ${turnId}`);
    }
  }

  private assertTurnHasNoTerminalEntry(turnId: string): void {
    if (this.entries.some((entry) => isTerminalTurnEntry(entry) && entry.turnId === turnId)) {
      throw new Error(`Turn already has a terminal entry: ${turnId}`);
    }
  }

  private validateLoadedEntry(raw: unknown): PicoThreadEntry {
    return validateLoadedThreadEntry(raw, {
      assertParent: (parentId) => this.assertParent(parentId),
      assertTurn: (turnId) => this.assertTurn(turnId),
      assertTurnHasNoTerminalEntry: (turnId) => this.assertTurnHasNoTerminalEntry(turnId),
      hasEntry: (id) => this.hasEntry(id),
    });
  }

  private nextEntryId(prefix: string): string {
    let id = "";
    do {
      id = `${prefix}_${randomHex(6)}`;
    } while (this.entryIds.has(id));
    return id;
  }

  private applyEntryDerivedState(entry: PicoThreadEntry): void {
    if (entry.type === "turn_completed") {
      this.setTurnStatus(entry.turnId, "completed");
    } else if (entry.type === "turn_failed") {
      this.setTurnStatus(entry.turnId, "failed");
    } else if (entry.type === "turn_aborted") {
      this.setTurnStatus(entry.turnId, "aborted");
    }
  }

  private setTurnStatus(turnId: string, status: TurnEntry["status"]): void {
    const turn = this.entries.find(
      (entry): entry is TurnEntry => entry.type === "turn" && entry.id === turnId,
    );
    if (turn) turn.status = status;
  }
}

function isMissingDirectory(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as { code?: string }).code === "ENOENT";
}
