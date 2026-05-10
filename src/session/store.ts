import { appendFile, mkdir, readdir } from "node:fs/promises";

import type {
  BranchEntry,
  ConfigChangeEntry,
  LabelEntry,
  PicoConfigSnapshot,
  ResponseItem,
  ResponseItemEntry,
  SessionEntry,
  SessionHeader,
  SessionInfo,
  TurnAbortedEntry,
  TurnCompletedEntry,
  TurnEntry,
  TurnFailedEntry,
  TurnOverrides,
} from "./types";

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
  SessionEntry,
  SessionHeader,
  SessionInfo,
  TurnAbortedEntry,
  TurnCompletedEntry,
  TurnEntry,
  TurnFailedEntry,
  TurnOverrides,
} from "./types";

const SESSIONS_DIR = ".pico/sessions";
const CURRENT_VERSION = 1;

function encodeCwd(cwd: string): string {
  return Buffer.from(cwd).toString("base64url");
}

function sessionsRoot(): string {
  const home = Bun.env.HOME || process.env.HOME || ".";
  return `${home}/${SESSIONS_DIR}`;
}

function sessionDir(cwd: string): string {
  return `${sessionsRoot()}/${encodeCwd(cwd)}`;
}

function sessionPath(cwd: string, sessionId: string): string {
  return `${sessionDir(cwd)}/${sessionId}.jsonl`;
}

function now(): string {
  return new Date().toISOString();
}

function randomHex(bytesLength: number): string {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function uuidV7(): string {
  const ms = BigInt(Date.now());
  const rand = new Uint8Array(10);
  crypto.getRandomValues(rand);

  const bytes = new Uint8Array(16);
  const timestamp = Number(ms & 0xffffffffffffn);
  bytes[0] = (timestamp / 0x10000000000) & 0xff;
  bytes[1] = (timestamp / 0x100000000) & 0xff;
  bytes[2] = (timestamp / 0x1000000) & 0xff;
  bytes[3] = (timestamp / 0x10000) & 0xff;
  bytes[4] = (timestamp / 0x100) & 0xff;
  bytes[5] = timestamp & 0xff;
  bytes.set(rand, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseJsonl(content: string): unknown[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function entryMovesLeaf(entry: SessionEntry): boolean {
  return entry.type !== "label";
}

function validateSessionHeader(raw: unknown, path: string): SessionHeader {
  if (!isRecord(raw)) throw new Error(`Invalid session header in ${path}`);

  const header = raw as unknown as SessionHeader;
  if (header.type !== "session" || header.version !== CURRENT_VERSION) {
    throw new Error(`Unsupported session header in ${path}`);
  }
  if (typeof header.id !== "string" || header.id.length === 0) {
    throw new Error(`Invalid session header id in ${path}`);
  }
  if (typeof header.createdAt !== "string") {
    throw new Error(`Invalid session header createdAt in ${path}`);
  }
  if (typeof header.cwd !== "string") {
    throw new Error(`Invalid session header cwd in ${path}`);
  }
  if (!isRecord(header.config)) {
    throw new Error(`Invalid session header config in ${path}`);
  }

  return header;
}

export class SessionStore {
  private header: SessionHeader;
  private entries: SessionEntry[] = [];
  private entryIds = new Set<string>();
  private _leafId: string;
  private filePath: string;

  private constructor(header: SessionHeader, filePath: string) {
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

  get allEntries(): readonly SessionEntry[] {
    return this.entries;
  }

  static async create(
    cwd: string = process.cwd(),
    config: PicoConfigSnapshot = {},
  ): Promise<SessionStore> {
    const header: SessionHeader = {
      type: "session",
      version: CURRENT_VERSION,
      id: uuidV7(),
      createdAt: now(),
      cwd,
      config,
    };
    const dir = sessionDir(cwd);
    await mkdir(dir, { recursive: true });
    const path = sessionPath(cwd, header.id);
    await Bun.write(path, `${JSON.stringify(header)}\n`);
    return new SessionStore(header, path);
  }

  static async load(cwd: string, sessionId: string): Promise<SessionStore> {
    const path = sessionPath(cwd, sessionId);
    const file = Bun.file(path);
    if (!(await file.exists())) {
      throw new Error(`Session not found: ${path}`);
    }

    const lines = parseJsonl(await file.text());
    if (lines.length === 0) {
      throw new Error(`Empty session file: ${path}`);
    }

    const header = validateSessionHeader(lines[0], path);

    const store = new SessionStore(header, path);
    for (const raw of lines.slice(1)) {
      const entry = store.validateLoadedEntry(raw);
      store.addLoadedEntry(entry, entryMovesLeaf(entry));
    }
    return store;
  }

  static async list(cwd: string = process.cwd()): Promise<SessionInfo[]> {
    const dir = sessionDir(cwd);
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

    const sessions: SessionInfo[] = [];
    for (const filename of jsonlFiles) {
      const content = await Bun.file(`${dir}/${filename}`).text();
      const lines = parseJsonl(content);
      if (lines.length === 0) continue;

      const header = lines[0] as SessionHeader;
      let leafId = header.id;
      let turnCount = 0;
      let responseItemCount = 0;
      let label: string | undefined;

      for (const raw of lines.slice(1)) {
        const entry = raw as SessionEntry;
        if (entryMovesLeaf(entry)) leafId = entry.id;
        if (entry.type === "turn") turnCount++;
        if (entry.type === "response_item") responseItemCount++;
        if (entry.type === "label") label = entry.label;
      }

      sessions.push({
        id: header.id,
        leafId,
        cwd: header.cwd,
        createdAt: header.createdAt,
        turnCount,
        responseItemCount,
        label,
      });
    }

    return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

  getPathEntries(leafId: string = this.leafId): SessionEntry[] {
    if (leafId === this.header.id) return [];
    const byId = new Map(this.entries.map((entry) => [entry.id, entry]));
    const path: SessionEntry[] = [];
    const seen = new Set<string>();
    let current: string | null = leafId;

    while (current && current !== this.header.id) {
      if (seen.has(current)) {
        throw new Error(`Cycle detected in session path at ${current}`);
      }
      seen.add(current);

      const entry = byId.get(current);
      if (!entry) {
        throw new Error(`Broken session path, missing parent entry: ${current}`);
      }
      path.unshift(entry);
      current = entry.parentId;
    }

    return path;
  }

  collectInjectItems(leafId: string = this.leafId): ResponseItem[] {
    return this.getPathEntries(leafId)
      .filter((entry): entry is ResponseItemEntry => entry.type === "response_item")
      .map((entry) => entry.responseItem);
  }

  childrenOf(parentId: string): SessionEntry[] {
    return this.entries.filter((entry) => entry.parentId === parentId);
  }

  labels(): Map<string, string> {
    const labels = new Map<string, string>();
    for (const entry of this.entries) {
      if (entry.type === "label") labels.set(entry.targetId, entry.label);
    }
    return labels;
  }

  private async appendEntry(entry: SessionEntry, moveLeaf: boolean): Promise<void> {
    this.addLoadedEntry(entry, moveLeaf);
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`);
  }

  private addLoadedEntry(entry: SessionEntry, moveLeaf = true): void {
    if (this.entryIds.has(entry.id)) {
      throw new Error(`Duplicate session entry id: ${entry.id}`);
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

  private validateLoadedEntry(raw: unknown): SessionEntry {
    if (!isRecord(raw)) throw new Error("Invalid session entry: expected object");

    const type = raw.type;
    if (typeof type !== "string") throw new Error("Invalid session entry: missing type");
    const entry = raw as unknown as SessionEntry;

    this.validateBaseEntry(entry);
    this.assertParent(entry.parentId);

    if (entry.type === "turn") {
      if (typeof entry.userInput !== "string") throw new Error("Invalid turn entry: userInput");
      if (typeof entry.cwd !== "string") throw new Error("Invalid turn entry: cwd");
      if (!isTurnStatus(entry.status)) throw new Error("Invalid turn entry: status");
      if (typeof entry.startedAt !== "string") throw new Error("Invalid turn entry: startedAt");
      if (entry.overrides !== undefined && !isRecord(entry.overrides)) {
        throw new Error("Invalid turn entry: overrides");
      }
      return entry;
    }

    if (entry.type === "response_item") {
      if (typeof entry.turnId !== "string") throw new Error("Invalid response_item entry: turnId");
      this.assertTurn(entry.turnId);
      if (!isRecord(entry.responseItem)) throw new Error("Invalid response_item entry: responseItem");
      return entry;
    }

    if (entry.type === "turn_completed") {
      this.validateTerminalTurnEntry(entry, "completed");
      if (typeof entry.completedAt !== "string") throw new Error("Invalid turn_completed entry: completedAt");
      return entry;
    }

    if (entry.type === "turn_failed") {
      this.validateTerminalTurnEntry(entry, "failed");
      if (typeof entry.failedAt !== "string") throw new Error("Invalid turn_failed entry: failedAt");
      if (typeof entry.error !== "string") throw new Error("Invalid turn_failed entry: error");
      return entry;
    }

    if (entry.type === "turn_aborted") {
      this.validateTerminalTurnEntry(entry, "aborted");
      if (typeof entry.abortedAt !== "string") throw new Error("Invalid turn_aborted entry: abortedAt");
      if (entry.reason !== undefined && typeof entry.reason !== "string") {
        throw new Error("Invalid turn_aborted entry: reason");
      }
      return entry;
    }

    if (entry.type === "label") {
      if (typeof entry.targetId !== "string" || !this.hasEntry(entry.targetId)) {
        throw new Error(`Label target entry not found: ${entry.targetId}`);
      }
      if (typeof entry.label !== "string") throw new Error("Invalid label entry: label");
      return entry;
    }

    if (entry.type === "branch") {
      if (typeof entry.targetId !== "string" || !this.hasEntry(entry.targetId)) {
        throw new Error(`Branch target entry not found: ${entry.targetId}`);
      }
      if (entry.name !== undefined && typeof entry.name !== "string") {
        throw new Error("Invalid branch entry: name");
      }
      return entry;
    }

    if (entry.type === "config_change") {
      if (!isRecord(entry.config)) throw new Error("Invalid config_change entry: config");
      return entry;
    }

    throw new Error(`Unsupported session entry type: ${type}`);
  }

  private validateBaseEntry(entry: SessionEntry): void {
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      throw new Error("Invalid session entry: id");
    }
    if (entry.parentId !== null && typeof entry.parentId !== "string") {
      throw new Error("Invalid session entry: parentId");
    }
    if (typeof entry.timestamp !== "string") {
      throw new Error("Invalid session entry: timestamp");
    }
  }

  private validateTerminalTurnEntry(
    entry: TurnCompletedEntry | TurnFailedEntry | TurnAbortedEntry,
    status: TurnCompletedEntry["status"] | TurnFailedEntry["status"] | TurnAbortedEntry["status"],
  ): void {
    if (typeof entry.turnId !== "string") throw new Error(`Invalid ${entry.type} entry: turnId`);
    this.assertTurn(entry.turnId);
    this.assertTurnHasNoTerminalEntry(entry.turnId);
    if (entry.status !== status) throw new Error(`Invalid ${entry.type} entry: status`);
  }

  private nextEntryId(prefix: string): string {
    let id = "";
    do {
      id = `${prefix}_${randomHex(6)}`;
    } while (this.entryIds.has(id));
    return id;
  }

  private applyEntryDerivedState(entry: SessionEntry): void {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTurnStatus(value: unknown): value is TurnEntry["status"] {
  return value === "started" || value === "completed" || value === "failed" || value === "aborted";
}

function isTerminalTurnEntry(
  entry: SessionEntry,
): entry is TurnCompletedEntry | TurnFailedEntry | TurnAbortedEntry {
  return entry.type === "turn_completed" || entry.type === "turn_failed" || entry.type === "turn_aborted";
}
