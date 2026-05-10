import { appendFile, mkdir, readdir } from "node:fs/promises";

export type PicoConfigSnapshot = Record<string, unknown>;
export type ResponseItem = Record<string, unknown>;

export interface SessionHeader {
  type: "session";
  version: 1;
  id: string;
  createdAt: string;
  cwd: string;
  config: PicoConfigSnapshot;
}

export interface BaseEntry {
  id: string;
  parentId: string | null;
  timestamp: string;
}

export interface TurnEntry extends BaseEntry {
  type: "turn";
  userInput: string;
  cwd: string;
  overrides?: TurnOverrides;
  status: "started" | "completed" | "failed" | "aborted";
  startedAt: string;
}

export interface ResponseItemEntry extends BaseEntry {
  type: "response_item";
  turnId: string;
  responseItem: ResponseItem;
}

export interface TurnCompletedEntry extends BaseEntry {
  type: "turn_completed";
  turnId: string;
  status: "completed";
  completedAt: string;
  result?: unknown;
}

export interface TurnFailedEntry extends BaseEntry {
  type: "turn_failed";
  turnId: string;
  status: "failed";
  failedAt: string;
  error: string;
}

export interface TurnAbortedEntry extends BaseEntry {
  type: "turn_aborted";
  turnId: string;
  status: "aborted";
  abortedAt: string;
  reason?: string;
}

export interface LabelEntry extends BaseEntry {
  type: "label";
  targetId: string;
  label: string;
}

export interface BranchEntry extends BaseEntry {
  type: "branch";
  targetId: string;
  name?: string;
}

export interface ConfigChangeEntry extends BaseEntry {
  type: "config_change";
  config: PicoConfigSnapshot;
}

export type SessionEntry =
  | TurnEntry
  | ResponseItemEntry
  | TurnCompletedEntry
  | TurnFailedEntry
  | TurnAbortedEntry
  | LabelEntry
  | BranchEntry
  | ConfigChangeEntry;

export interface TurnOverrides {
  model?: string;
  modelProvider?: string;
  approvalPolicy?: string;
  sandbox?: unknown;
  cwd?: string;
  personality?: string;
  developerInstructions?: string;
}

export interface SessionInfo {
  id: string;
  leafId: string;
  cwd: string;
  createdAt: string;
  turnCount: number;
  responseItemCount: number;
  label?: string;
}

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

function movesLeaf(entry: SessionEntry): boolean {
  return entry.type !== "label";
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

    const header = lines[0] as SessionHeader;
    if (header.type !== "session" || header.version !== CURRENT_VERSION) {
      throw new Error(`Unsupported session header in ${path}`);
    }

    const store = new SessionStore(header, path);
    for (const raw of lines.slice(1)) {
      const entry = raw as SessionEntry;
      store.addLoadedEntry(entry, movesLeaf(entry));
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
        if (movesLeaf(entry)) leafId = entry.id;
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
    await this.appendEntry(entry, false);
    return entry;
  }

  async appendResponseItem(
    parentId: string,
    turnId: string,
    responseItem: ResponseItem,
  ): Promise<ResponseItemEntry> {
    this.assertParent(parentId);
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
    this.markTurnStatus(turnId, "completed");
    await this.appendEntry(entry, true);
    return entry;
  }

  async appendTurnFailed(
    parentId: string,
    turnId: string,
    error: Error | string,
  ): Promise<TurnFailedEntry> {
    this.assertParent(parentId);
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
    this.markTurnStatus(turnId, "failed");
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

  private nextEntryId(prefix: string): string {
    let id = "";
    do {
      id = `${prefix}_${randomHex(6)}`;
    } while (this.entryIds.has(id));
    return id;
  }

  private markTurnStatus(turnId: string, status: TurnEntry["status"]): void {
    const turn = this.entries.find(
      (entry): entry is TurnEntry => entry.type === "turn" && entry.id === turnId,
    );
    if (turn) turn.status = status;
  }
}

function isMissingDirectory(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as { code?: string }).code === "ENOENT";
}
