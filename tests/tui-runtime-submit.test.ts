import { expect, test } from "bun:test";
import type { TuiInputCommand } from "../src/tui/commands";
import { submitRuntimeInput, type RuntimeSubmitHost } from "../src/tui/runtime/submit";
import type { TuiState } from "../src/tui/state";

function createSubmitHost(overrides: Partial<RuntimeSubmitHost> = {}) {
  const calls = {
    acceptedSlash: 0,
    cleared: 0,
    queued: [] as string[],
    submitted: [] as string[],
    busyStatus: 0,
    localCommands: [] as TuiInputCommand[],
  };
  const host: RuntimeSubmitHost = {
    getOverlay: () => "none" as TuiState["overlay"],
    getInputValue: () => "hello",
    acceptSlashSelection: async () => {
      calls.acceptedSlash += 1;
    },
    handleLocalCommand: async (command) => {
      calls.localCommands.push(command);
      return command.type === "empty";
    },
    clearInput: () => {
      calls.cleared += 1;
    },
    isBusy: () => false,
    isRunning: () => false,
    queueDraft: (text) => {
      calls.queued.push(text);
    },
    submit: (text) => {
      calls.submitted.push(text);
    },
    setBusyStatus: () => {
      calls.busyStatus += 1;
    },
    ...overrides,
  };
  return { calls, host };
}

test("submitRuntimeInput submits non-empty composer input while idle", async () => {
  const { calls, host } = createSubmitHost();

  await submitRuntimeInput(host);

  expect(calls.cleared).toBe(1);
  expect(calls.submitted).toEqual(["hello"]);
  expect(calls.queued).toEqual([]);
});

test("submitRuntimeInput queues non-empty composer input while a turn is running", async () => {
  const { calls, host } = createSubmitHost({
    getInputValue: () => " next prompt ",
    isBusy: () => true,
    isRunning: () => true,
  });

  await submitRuntimeInput(host);

  expect(calls.queued).toEqual(["next prompt"]);
  expect(calls.submitted).toEqual([]);
  expect(calls.busyStatus).toBe(0);
});

test("submitRuntimeInput keeps non-running busy states as busy status", async () => {
  const { calls, host } = createSubmitHost({
    isBusy: () => true,
    isRunning: () => false,
  });

  await submitRuntimeInput(host);

  expect(calls.queued).toEqual([]);
  expect(calls.submitted).toEqual([]);
  expect(calls.busyStatus).toBe(1);
});

test("submitRuntimeInput routes slash overlay to slash selection", async () => {
  const { calls, host } = createSubmitHost({
    getOverlay: () => "slash",
  });

  await submitRuntimeInput(host);

  expect(calls.acceptedSlash).toBe(1);
  expect(calls.submitted).toEqual([]);
});
