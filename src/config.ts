import { mkdir } from "node:fs/promises";

export interface ConfigItem<T = unknown> {
  key: string;
  default: T;
  validate: (value: unknown) => string | undefined;
  description: string;
}

class PicoConfigRegistry {
  private items = new Map<string, ConfigItem>();
  private values = new Map<string, unknown>();
  private userValues = new Map<string, unknown>();
  private listeners = new Map<string, Set<(v: unknown) => void>>();
  private loaded = false;

  register<T>(item: ConfigItem<T>): void {
    if (this.loaded) throw new Error(`Cannot register "${item.key}" after config loaded`);
    if (this.items.has(item.key)) throw new Error(`Config key "${item.key}" already registered`);
    this.items.set(item.key, item as ConfigItem);
    this.values.set(item.key, item.default);
  }

  async load(homeDir?: string): Promise<void> {
    const home = homeDir || Bun.env.HOME || process.env.HOME || ".";
    const path = `${home}/.pico/config.json`;
    const fileValues = await this.readFile(path);

    for (const [key, item] of this.items) {
      const fileValue = key in fileValues ? fileValues[key] : item.default;
      const error = item.validate(fileValue);
      if (error) {
        this.values.set(key, item.default);
        console.warn(`Config "${key}": ${error} — using default`);
      } else {
        this.values.set(key, fileValue);
      }
      if (key in fileValues) {
        this.userValues.set(key, fileValues[key]);
      }
    }
    this.loaded = true;
  }

  get<T>(key: string): T {
    const item = this.items.get(key);
    if (!item) throw new Error(`Unknown config key: ${key}`);
    return this.values.get(key) as T;
  }

  async set(key: string, value: unknown): Promise<void> {
    const item = this.items.get(key);
    if (!item) throw new Error(`Unknown config key: ${key}`);
    const error = item.validate(value);
    if (error) throw new Error(`Config "${key}": ${error}`);

    this.values.set(key, value);
    this.userValues.set(key, value);
    await this.writeFile();
    this.emit(key, value);
  }

  reset(): void {
    this.values.clear();
    for (const [key, item] of this.items) {
      this.values.set(key, item.default);
    }
    this.userValues.clear();
    this.listeners.clear();
    this.loaded = false;
  }

  onChange(key: string, fn: (value: unknown) => void): () => void {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(fn);
    return () => this.listeners.get(key)?.delete(fn);
  }

  snapshot(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of this.items.keys()) {
      result[key] = this.values.get(key);
    }
    return result;
  }

  private emit(key: string, value: unknown): void {
    const fns = this.listeners.get(key);
    if (!fns) return;
    for (const fn of fns) fn(value);
  }

  private async readFile(path: string): Promise<Record<string, unknown>> {
    const file = Bun.file(path);
    if (!(await file.exists().catch(() => false))) return {};
    try {
      return JSON.parse(await file.text()) as Record<string, unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid Pico config ${path}: ${message}`);
    }
  }

  private async writeFile(): Promise<void> {
    const home = Bun.env.HOME || process.env.HOME || ".";
    const dir = `${home}/.pico`;
    const path = `${dir}/config.json`;
    await mkdir(dir, { recursive: true });
    const obj: Record<string, unknown> = {};
    for (const [key, value] of this.userValues) {
      obj[key] = value;
    }
    await Bun.write(path, `${JSON.stringify(obj, null, 2)}\n`);
  }
}

export const picoConfig = new PicoConfigRegistry();
