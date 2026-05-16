import { CodexAppServerClient } from "../codex/app-server";
import { picoConfig } from "../config";
import { CodexThreadState } from "./codex-thread-state";
import type { AppState, DraftAppState } from "./types";

export async function createApp(cwd: string = process.cwd()): Promise<AppState> {
  return ensureAppThread(await createDraftApp(cwd));
}

export async function createDraftApp(cwd: string = process.cwd()): Promise<DraftAppState> {
  const codex = await createCodexClient(cwd);
  return { codex, cwd };
}

export async function ensureAppThread(app: DraftAppState): Promise<AppState> {
  if (app.store) return app as AppState;
  const store = await CodexThreadState.create(app.cwd, app.codex);
  app.store = store;
  return app as AppState;
}

export async function loadApp(cwd: string, threadId: string): Promise<AppState> {
  const codex = await createCodexClient(cwd);
  const store = await CodexThreadState.load(cwd, threadId, codex);
  return { store, codex, cwd: store.cwd };
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
