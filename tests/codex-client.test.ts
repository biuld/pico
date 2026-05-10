import { expect, test } from "bun:test";
import { classifyJsonRpcMessage } from "../src/codex/client";

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
