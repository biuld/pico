const THREADS_DIR = ".pico/threads";

export function encodeCwd(cwd: string): string {
  return Buffer.from(cwd).toString("base64url");
}

export function threadsRoot(): string {
  const home = Bun.env.HOME || process.env.HOME || ".";
  return `${home}/${THREADS_DIR}`;
}

export function threadDir(cwd: string): string {
  return `${threadsRoot()}/${encodeCwd(cwd)}`;
}

export function threadPath(cwd: string, threadId: string): string {
  return `${threadDir(cwd)}/${threadId}.jsonl`;
}
