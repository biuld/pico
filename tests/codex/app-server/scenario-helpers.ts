import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PicoAppSession,
  type PicoAppSessionEventName,
} from "../../../src/app-session";
import type { MockCodexScenarioStep } from "../../support/codex-app-server/mock-codex-app-server";

export function startupSteps(): MockCodexScenarioStep[] {
  return [
    {
      expectRequest: "initialize",
      params: {
        clientInfo: { name: "pico" },
        capabilities: { experimentalApi: true },
      },
      respond: {
        codexHome: "/tmp/mock-codex-home",
        userAgent: "mock-codex",
      },
    },
    { expectNotification: "initialized" },
  ];
}

export function threadStartResponse(cwd: string): Record<string, unknown> {
  return {
    thread: { id: "thread-1", status: "idle" },
    model: "mock-model",
    modelProvider: "openai",
    cwd,
  };
}

export function assistantMessage(id: string, text: string): Record<string, unknown> {
  return {
    id,
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  };
}

export async function createTempProject(): Promise<{ cwd: string; home: string }> {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  return { cwd, home };
}

export function onceSessionEvent<Name extends PicoAppSessionEventName>(
  session: PicoAppSession,
  event: Name,
): Promise<void> {
  return new Promise((resolve) => {
    session.once(event, () => resolve());
  });
}
