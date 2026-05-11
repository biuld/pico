import { parseTuiInput, type TuiInputCommand } from "../commands";
import type { TuiState } from "../state";

export interface RuntimeSubmitHost {
  getOverlay(): TuiState["overlay"];
  getInputValue(): string;
  acceptSlashSelection(): Promise<void>;
  handleLocalCommand(command: TuiInputCommand): Promise<boolean>;
  clearInput(): void;
  isBusy(): boolean;
  isRunning(): boolean;
  queueDraft(text: string): void;
  submit(text: string): void;
  setBusyStatus(): void;
}

export async function submitRuntimeInput(host: RuntimeSubmitHost): Promise<void> {
  const overlay = host.getOverlay();
  if (overlay === "slash") {
    await host.acceptSlashSelection();
    return;
  }
  if (overlay !== "none") return;

  const command = parseTuiInput(host.getInputValue());
  const handledLocally = await host.handleLocalCommand(command);
  if (handledLocally) {
    host.clearInput();
    return;
  }

  if (command.type !== "submit") return;
  if (host.isBusy()) {
    if (host.isRunning()) {
      host.queueDraft(command.text);
      return;
    }
    host.setBusyStatus();
    return;
  }

  host.clearInput();
  host.submit(command.text);
}
