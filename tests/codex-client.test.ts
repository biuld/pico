import { expect, test } from "bun:test";
import {
  classifyJsonRpcMessage,
  createCodexStatusSnapshot,
  formatCodexStatusText,
  updateCodexStatusFromConfig,
  updateCodexStatusFromConfigRead,
  updateCodexStatusFromModelList,
  updateCodexStatusFromNotification,
  updateCodexStatusFromThreadStart,
  updateCodexStatusFromTurnStart,
} from "../src/codex/app-server";

test("classifies server requests before notifications", () => {
  const message = {
    jsonrpc: "2.0",
    id: 7,
    method: "item/commandExecution/requestApproval",
    params: { command: "echo hi" },
  };

  expect(classifyJsonRpcMessage(message).type).toBe("request");
});

test("classifies JSON-RPC responses and errors", () => {
  expect(classifyJsonRpcMessage({ jsonrpc: "2.0", id: 1, result: { ok: true } }).type).toBe(
    "response",
  );
  expect(
    classifyJsonRpcMessage({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "nope" },
    }).type,
  ).toBe("error");
});

test("rejects malformed JSON-RPC objects", () => {
  expect(() => classifyJsonRpcMessage({ jsonrpc: "2.0", id: 1 })).toThrow(
    "Malformed JSON-RPC message",
  );
});

test("projects app-server status from SDK responses and notifications", () => {
  let status = createCodexStatusSnapshot({ userAgent: "codex-test" });

  status = updateCodexStatusFromThreadStart(status, {
    thread: { id: "thread-1", status: { type: "idle" } },
    model: "gpt-test",
    modelProvider: "openai",
    cwd: "/tmp/project",
  });
  status = updateCodexStatusFromTurnStart(status, "thread-1", {
    turn: { id: "turn-1", status: "inProgress" },
  });
  status = updateCodexStatusFromNotification(status, {
    method: "thread/tokenUsage/updated",
    params: { tokenUsage: { inputTokens: 12, outputTokens: 4 } },
  });
  status = updateCodexStatusFromNotification(status, {
    method: "model/rerouted",
    params: { fromModel: "gpt-test", toModel: "gpt-next" },
  });

  const text = formatCodexStatusText(status);
  expect(text).toContain("codex running");
  expect(text).toContain("model gpt-next");
  expect(text).toContain("16 used");
});

test("projects startup config and default model into status before a turn starts", () => {
  let status = createCodexStatusSnapshot({ userAgent: "codex-test" });

  status = updateCodexStatusFromConfigRead(status, {
    config: {
      model: null,
      model_provider: "openai",
      model_reasoning_effort: "xhigh",
      service_tier: "fast",
    },
  });
  status = updateCodexStatusFromModelList(status, {
    data: [
      { id: "gpt-other", model: "gpt-other", isDefault: false },
      { id: "gpt-default", model: "gpt-default", isDefault: true },
    ],
  });

  expect(status.model).toBe("gpt-default");
  expect(status.modelProvider).toBe("openai");
  expect(status.modelReasoningEffort).toBe("xhigh");
  expect(status.serviceTier).toBe("fast");
});

test("pico config overrides app-server startup status", () => {
  let status = createCodexStatusSnapshot({ userAgent: "codex-test" });

  status = updateCodexStatusFromConfigRead(status, {
    config: { model: "codex-config-model", model_provider: "openai" },
  });
  status = updateCodexStatusFromConfig(status, {
    model: "pico-model",
    modelProvider: "pico-provider",
  });
  status = updateCodexStatusFromModelList(status, {
    data: [
      { id: "pico-model", model: "pico-model", isDefault: false, defaultReasoningEffort: "high" },
      { id: "other-model", model: "other-model", isDefault: true, defaultReasoningEffort: "low" },
    ],
  });

  expect(status.model).toBe("pico-model");
  expect(status.modelProvider).toBe("pico-provider");
  expect(status.modelReasoningEffort).toBe("high");
});
