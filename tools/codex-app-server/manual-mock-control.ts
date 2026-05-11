#!/usr/bin/env bun

import { appendFileSync } from "node:fs";

type JsonObject = Record<string, unknown>;

const args = Bun.argv.slice(2);
const controlPath = optionValue("--control") || ".pico/manual-mock-codex-app-server.json";
const command = firstPositional();
const helpRequested = args.includes("--help") || args.includes("-h") || command === "help";

if (!command || helpRequested) {
  printHelp();
  process.exit(helpRequested ? 0 : 1);
}

const control = JSON.parse(await Bun.file(controlPath).text()) as {
  inboxPath: string;
  statePath: string;
};

if (command === "state") {
  console.log(await Bun.file(control.statePath).text());
  process.exit(0);
}

const payload = commandPayload(command);
appendFileSync(control.inboxPath, `${JSON.stringify(payload)}\n`);
console.log(JSON.stringify({ ok: true, enqueued: payload }, null, 2));

function commandPayload(name: string): JsonObject {
  switch (name) {
    case "reply":
      return withTarget({
        type: "reply",
        text: requiredOption("--text", "reply requires --text"),
        itemId: optionValue("--item-id"),
        item: jsonOption("--item"),
        status: optionValue("--status"),
        error: jsonOption("--error"),
      });
    case "delta":
      return withTarget({
        type: "delta",
        text: requiredOption("--text", "delta requires --text"),
      });
    case "raw":
      return withTarget({
        type: "raw",
        text: optionValue("--text"),
        itemId: optionValue("--item-id"),
        item: jsonOption("--item"),
      });
    case "complete":
      return withTarget({
        type: "complete",
        status: optionValue("--status") || "completed",
        error: jsonOption("--error"),
      });
    case "notify":
      return {
        type: "notify",
        method: requiredOption("--method", "notify requires --method"),
        params: jsonOption("--params"),
      };
    case "server-request":
      return {
        type: "serverRequest",
        id: optionValue("--id"),
        method: requiredOption("--method", "server-request requires --method"),
        params: jsonOption("--params"),
      };
    case "playbook":
      return withTarget({ type: "playbook" });
    default:
      throw new Error(`unknown command: ${name}`);
  }
}

function withTarget(payload: JsonObject): JsonObject {
  return pruneUndefined({
    ...payload,
    threadId: optionValue("--thread-id"),
    turnId: optionValue("--turn-id"),
  });
}

function optionValue(name: string): string | undefined {
  const equalsPrefix = `${name}=`;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === name) return args[index + 1];
    if (value.startsWith(equalsPrefix)) return value.slice(equalsPrefix.length);
  }
  return undefined;
}

function requiredOption(name: string, message: string): string {
  const value = optionValue(name);
  if (!value) throw new Error(message);
  return value;
}

function jsonOption(name: string): unknown {
  const value = optionValue(name);
  return value ? JSON.parse(value) as unknown : undefined;
}

function firstPositional(): string | undefined {
  return args.find((arg, index) => {
    if (arg.startsWith("-")) return false;
    const previous = args[index - 1];
    return !previous || !previous.startsWith("-");
  });
}

function pruneUndefined(value: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function printHelp(): void {
  console.log(`Usage:
  manual-mock-control.ts [--control path] state
  manual-mock-control.ts [--control path] reply --text "hello" [--item-id id]
  manual-mock-control.ts [--control path] delta --text "hello"
  manual-mock-control.ts [--control path] raw --text "hello" [--item-id id]
  manual-mock-control.ts [--control path] complete [--status completed]
  manual-mock-control.ts [--control path] notify --method METHOD [--params JSON]
  manual-mock-control.ts [--control path] server-request --method METHOD [--id ID] [--params JSON]
  manual-mock-control.ts [--control path] playbook [--thread-id ID --turn-id ID]

Default control file:
  .pico/manual-mock-codex-app-server.json

Playbook replies first ask Pico for item/permissions/requestApproval.`);
}
