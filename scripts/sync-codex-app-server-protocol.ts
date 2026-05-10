import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const gitUrl = Bun.env.CODEX_PROTOCOL_GIT_URL || "https://github.com/openai/codex.git";
const gitRef = Bun.env.CODEX_PROTOCOL_GIT_REF || "main";
const protocolPath =
  Bun.env.CODEX_PROTOCOL_TYPESCRIPT_PATH ||
  "codex-rs/app-server-protocol/schema/typescript";
const targetRoot = "packages/codex-app-server-protocol/src";
const readmePath = "packages/codex-app-server-protocol/README.md";

const checkoutRoot = await mkdtemp(join(tmpdir(), "pico-codex-protocol-"));

try {
  await run("git", [
    "clone",
    "--filter=blob:none",
    "--sparse",
    "--no-checkout",
    gitUrl,
    checkoutRoot,
  ]);
  await run("git", ["-C", checkoutRoot, "sparse-checkout", "set", protocolPath]);
  await run("git", ["-C", checkoutRoot, "fetch", "--depth", "1", "origin", gitRef]);
  await run("git", ["-C", checkoutRoot, "checkout", "--detach", "FETCH_HEAD"]);

  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(dirname(targetRoot), { recursive: true });
  await cp(join(checkoutRoot, protocolPath), targetRoot, { recursive: true });

  const sourceCommit = await capture("git", ["-C", checkoutRoot, "rev-parse", "HEAD"]);
  const readme = await readFile(readmePath, "utf8");
  const nextReadme = readme
    .replace(/Source repository: `[^`]+`./, `Source repository: \`${gitUrl}\`.`)
    .replace(/Source ref: `[^`]+`./, `Source ref: \`${gitRef}\`.`)
    .replace(/Source path: `[^`]+`./, `Source path: \`${protocolPath}\`.`)
    .replace(/Source commit: `[^`]+`./, `Source commit: \`${sourceCommit}\`.`);
  await writeFile(readmePath, nextReadme);
} finally {
  await rm(checkoutRoot, { recursive: true, force: true });
}

async function run(command: string, args: string[]): Promise<void> {
  await capture(command, args);
}

async function capture(command: string, args: string[]): Promise<string> {
  const proc = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${stderr.trim()}`);
  }
  return stdout.trim();
}
