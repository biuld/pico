import { expect, test } from "bun:test";
import { startMockCodexClient } from "../../../tools/codex-app-server/test-client";
import {
  createTempProject,
  startupSteps,
  threadStartResponse,
} from "./scenario-helpers";

test("startup handshake reads config, lists models, and starts a thread", async () => {
  const { cwd } = await createTempProject();
  const fixture = await startMockCodexClient([
    ...startupSteps(),
    {
      expectRequest: "config/read",
      params: { cwd, includeLayers: false },
      respond: {
        config: { model: "mock-model", model_provider: "openai" },
      },
    },
    {
      expectRequest: "model/list",
      params: { limit: 100, includeHidden: false },
      respond: {
        data: [{ id: "mock-model", model: "mock-model", isDefault: true }],
      },
    },
    {
      expectRequest: "thread/start",
      params: { cwd },
      respond: threadStartResponse(cwd),
    },
  ]);

  try {
    await fixture.client.refreshConfigStatus({ cwd });
    const thread = await fixture.client.startThread({ cwd });

    expect(thread.thread.id).toBe("thread-1");
    expect(fixture.client.statusSnapshot.model).toBe("mock-model");

    const received = (await fixture.readLog())
      .filter((entry) => entry.type === "received")
      .map((entry) => (entry.message as Record<string, unknown>).method);
    expect(received).toEqual([
      "initialize",
      "initialized",
      "config/read",
      "model/list",
      "thread/start",
    ]);
  } finally {
    await fixture.client.shutdown();
  }
});
