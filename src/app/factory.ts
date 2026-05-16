import { CodexAppServerClient } from "../codex/app-server";
import { picoConfig } from "../config";
import { CodexThreadViewState } from "./codex-thread-view-state";
import "./config";
import type { AppState, DraftAppState } from "./types";

export async function createApp(cwd: string = process.cwd()): Promise<AppState> {
  return ensureAppThread(await createDraftApp(cwd));
}

export async function createDraftApp(cwd: string = process.cwd()): Promise<DraftAppState> {
  const codex = await createCodexClient(cwd);
  return { codex, cwd };
}

export async function ensureAppThread(app: DraftAppState): Promise<AppState> {
  if (app.viewState) return app as AppState;
  const viewState = CodexThreadViewState.create(app.cwd);
  app.viewState = viewState;
  return app as AppState;
}

export async function loadApp(cwd: string, threadId: string): Promise<AppState> {
  const codex = await createCodexClient(cwd);
  const viewState = CodexThreadViewState.create(cwd);

  try {
    const response = await codex.readThread(threadId, true);
    viewState.setThread(threadId, response.thread);
  } catch {
    // Fallback: empty view state with known thread ID
    viewState.codexThreadId = threadId;
  }

  return { viewState, codex, cwd: viewState.cwd };
}

async function createCodexClient(cwd: string): Promise<CodexAppServerClient> {
  const codex = new CodexAppServerClient({ binary: picoConfig.get<string>("codexBinary") });
  await codex.start();
  await seedCodexStatus(codex, cwd);
  return codex;
}

async function seedCodexStatus(
  codex: CodexAppServerClient,
  cwd: string,
): Promise<void> {
  const overrides = codexStatusOverrides();
  if (overrides) codex.applyConfigStatus(overrides);

  try {
    await codex.refreshConfigStatus({ cwd, overrides });
  } catch {
    // Older app-server builds may not expose config/read. Thread start still refreshes status.
  }
}

function codexStatusOverrides() {
  const model = picoConfig.get<string | undefined>("model");
  const modelProvider = picoConfig.get<string | undefined>("modelProvider");
  if (!model && !modelProvider) return undefined;
  return { model, modelProvider };
}
