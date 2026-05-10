import { appendFile } from "node:fs/promises";

export function parseJsonl(content: string): unknown[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function writeJsonl(path: string, values: readonly unknown[]): Promise<void> {
  await Bun.write(path, values.map(jsonlLine).join(""));
}

export async function appendJsonlLine(path: string, value: unknown): Promise<void> {
  await appendFile(path, jsonlLine(value));
}

function jsonlLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}
