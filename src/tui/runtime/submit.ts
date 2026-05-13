import { parseTuiInput, type TuiInputCommand } from "../commands";

export type RuntimeSubmitSurface = "composer" | "commandPopup" | "blocked";

export interface RuntimeSubmitHost {
  getSubmitSurface(): RuntimeSubmitSurface;
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
  const surface = host.getSubmitSurface();
  if (surface === "commandPopup") {
    await host.acceptSlashSelection();
    return;
  }
  if (surface === "blocked") return;

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
