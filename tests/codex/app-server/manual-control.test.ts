import { expect, test } from "bun:test";
import type { JSONRPCRequest } from "../../../src/codex/app-server";
import {
  readManualMockState,
  sendManualMockCommand,
  startManualMockCodexClient,
} from "../../../tools/codex-app-server/test-client";
import {
  assistantMessage,
  createTempProject,
} from "./scenario-helpers";

test("manual mock control API can drive an active turn to completion", async () => {
  const { cwd } = await createTempProject();
  const fixture = await startManualMockCodexClient();

  try {
    const deltas: string[] = [];
    const rawItems: unknown[] = [];
    fixture.client.on("item/agentMessage/delta", (params) => {
      const value = params as Record<string, unknown>;
      if (typeof value.delta === "string") deltas.push(value.delta);
    });
    fixture.client.on("rawResponseItem/completed", (params) => {
      const value = params as Record<string, unknown>;
      rawItems.push(value.item);
    });

    const thread = await fixture.client.startEphemeralThread({ cwd });
    const turn = await fixture.client.startTurn(thread.thread.id, "manual");
    const completed = fixture.client.waitForTurnCompleted(thread.thread.id, turn.turn.id);

    await sendManualMockCommand(fixture.control, {
      type: "reply",
      text: "manual hello",
      itemId: "manual-output",
    });

    expect(await completed).toMatchObject({
      threadId: thread.thread.id,
      turnId: turn.turn.id,
      status: "completed",
    });
    expect(deltas).toEqual(["manual hello"]);
    expect(rawItems).toEqual([assistantMessage("manual-output", "manual hello")]);
  } finally {
    await fixture.client.shutdown();
  }
});

test("manual mock control API can issue server requests and record client responses", async () => {
  const fixture = await startManualMockCodexClient();

  try {
    const requests: JSONRPCRequest[] = [];
    fixture.client.on("serverRequest", (request: JSONRPCRequest) => {
      requests.push(request);
      fixture.client.resolveServerRequest(request.id, { decision: "approve" });
    });

    await sendManualMockCommand(fixture.control, {
      type: "serverRequest",
      id: "manual-approval",
      method: "item/permissions/requestApproval",
      params: { reason: "manual test" },
    });

    await waitFor(() => requests.length === 1);
    expect(requests[0]).toMatchObject({
      id: "manual-approval",
      method: "item/permissions/requestApproval",
      params: { reason: "manual test" },
    });

    await waitFor(async () => {
      const state = await readManualMockState(fixture.control);
      const serverRequest = state.serverRequests.find(
        (entry: Record<string, unknown>) => entry.id === "manual-approval",
      );
      const response = serverRequest?.response as Record<string, unknown> | undefined;
      const result = response?.result as Record<string, unknown> | undefined;
      return result?.decision === "approve";
    });
  } finally {
    await fixture.client.shutdown();
  }
});

test("manual mock playbook can auto-complete a turn with sampled response items", async () => {
  const { cwd } = await createTempProject();
  const fixture = await startManualMockCodexClient({ playbook: true });

  try {
    const events: string[] = [];
    const deltas: string[] = [];
    const rawItems: Array<Record<string, unknown>> = [];
    const approvalRequests: JSONRPCRequest[] = [];
    fixture.client.on("serverRequest", (request: JSONRPCRequest) => {
      events.push("approval");
      approvalRequests.push(request);
      fixture.client.resolveServerRequest(request.id, { decision: "approve" });
    });
    fixture.client.on("item/agentMessage/delta", (params) => {
      events.push("delta");
      const value = params as Record<string, unknown>;
      if (typeof value.delta === "string") deltas.push(value.delta);
    });
    fixture.client.on("rawResponseItem/completed", (params) => {
      events.push("raw");
      const value = params as Record<string, unknown>;
      if (value.item && typeof value.item === "object") {
        rawItems.push(value.item as Record<string, unknown>);
      }
    });

    const thread = await fixture.client.startEphemeralThread({ cwd });
    const turn = await fixture.client.startTurn(thread.thread.id, "sample a mock answer");
    await expect(fixture.client.waitForTurnCompleted(thread.thread.id, turn.turn.id))
      .resolves.toMatchObject({ status: "completed" });

    expect(events[0]).toBe("approval");
    expect(approvalRequests[0]).toMatchObject({
      method: "item/permissions/requestApproval",
      params: {
        threadId: thread.thread.id,
        turnId: turn.turn.id,
        action: "manualMockPlaybook",
        source: "auto",
      },
    });
    expect(deltas.join("").length).toBeGreaterThan(0);
    expect(rawItems.some((item) => item.type === "message")).toBe(true);

    await waitFor(async () => {
      const state = await readManualMockState(fixture.control);
      const thread = (state.threads as Array<Record<string, unknown>>)[0];
      const turns = thread?.turns as Array<Record<string, unknown>> | undefined;
      return Boolean(turns?.[0]?.playbook);
    });
  } finally {
    await fixture.client.shutdown();
  }
});

test("manual mock playbook stops when approval is declined", async () => {
  const { cwd } = await createTempProject();
  const fixture = await startManualMockCodexClient({ playbook: true });

  try {
    const events: string[] = [];
    fixture.client.on("serverRequest", (request: JSONRPCRequest) => {
      events.push("approval");
      fixture.client.resolveServerRequest(request.id, { decision: "deny" });
    });
    fixture.client.on("item/agentMessage/delta", () => {
      events.push("delta");
    });
    fixture.client.on("rawResponseItem/completed", () => {
      events.push("raw");
    });

    const thread = await fixture.client.startEphemeralThread({ cwd });
    const turn = await fixture.client.startTurn(thread.thread.id, "sample a mock answer");
    await expect(fixture.client.waitForTurnCompleted(thread.thread.id, turn.turn.id))
      .resolves.toMatchObject({
        threadId: thread.thread.id,
        turnId: turn.turn.id,
        status: "interrupted",
      });

    expect(events).toEqual(["approval"]);
  } finally {
    await fixture.client.shutdown();
  }
});

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for condition");
}
