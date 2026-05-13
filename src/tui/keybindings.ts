import type { CliRenderer } from "@opentui/core";
import { filterSlashCommands } from "./commands";
import { buildApprovalOptions, type ApprovalDecision } from "./widgets/approval-panel";
import type { TuiState } from "./state";
import type { TuiMsg } from "./update";

export interface KeybindingRuntime {
  getState(): TuiState;
  getInputValue(): string;
  hasPendingApproval(): boolean;
  pendingApprovalMethod(): string | undefined;
  isRunning(): boolean;
  dispatch(msg: TuiMsg): void;
  render(): void;
  close(): void;
  focusInput(): void;
  setComposerFocus(): void;
  showHistory(): void;
  showThreads(): void;
  showTheme(): void;
  showStatusLine(): void;
  showTranscript(): void;
  showShortcuts(): void;
  moveHistorySelection(delta: number): void;
  moveThreadSelection(delta: number): void;
  moveThemeSelection(delta: number): void;
  moveStatusLineSelection(delta: number): void;
  restoreSelected(): void;
  resumeSelected(): void;
  selectTheme(): void;
  toggleStatusLineItem(): void;
  queueDraft(text: string): void;
  recallQueuedDraft(): void;
  submitInput?(): void;
  interruptTurn(): void;
  setInputValue(value: string): void;
  acceptSlashSelection(): void;
  resolveApproval(decision: ApprovalDecision): void;
}

export function installOpenTuiKeybindings(
  renderer: CliRenderer,
  runtime: KeybindingRuntime,
): void {
  renderer.addInputHandler((sequence) => {
    if (sequence === "\u0003") {
      if (runtime.isRunning()) {
        runtime.interruptTurn();
        return true;
      }
      runtime.dispatch({
        type: "setTurnStatus",
        status: runtime.getState().bottomPane.turnStatus,
        message: "ctrl+d twice to exit",
      });
      runtime.render();
      return true;
    }

    if (sequence === "\u0004") {
      handleCtrlD(runtime);
      return true;
    }

    if (runtime.hasPendingApproval() && handleApprovalKey(sequence, runtime)) return true;
    return false;
  });

  renderer.addInputHandler((sequence) => {
    const state = runtime.getState();

    if (state.pickerSurface === "history") {
      return handleHistoryKey(sequence, runtime);
    }
    if (state.pickerSurface === "resume") {
      return handleThreadKey(sequence, runtime);
    }
    if (state.pagerOverlay === "transcript") {
      return handleTranscriptKey(sequence, runtime);
    }
    if (state.pagerOverlay === "shortcuts") {
      return handleShortcutKey(sequence, runtime);
    }
    if (state.bottomPane.activeView === "commandPopup") {
      return handleSlashKey(sequence, runtime);
    }
    if (state.bottomPane.activeView === "themePicker") {
      return handleThemeKey(sequence, runtime);
    }
    if (state.bottomPane.activeView === "statuslinePicker") {
      return handleStatusLineKey(sequence, runtime);
    }
    if (sequence === "\u0014") {
      runtime.showTranscript();
      return true;
    }
    if (sequence === "?" && runtime.getInputValue().length === 0) {
      runtime.showShortcuts();
      return true;
    }
    if (isOptionUp(sequence)) {
      runtime.recallQueuedDraft();
      return true;
    }
    if (sequence === "\u001b") {
      handleComposerEsc(runtime);
      return true;
    }
    if (sequence === "\t") {
      const inputValue = runtime.getInputValue();
      if (runtime.isRunning()) {
        if (inputValue.trim().length > 0) runtime.queueDraft(inputValue);
        return true;
      }

      if (inputValue.trim().length > 0 && runtime.submitInput) {
        runtime.submitInput();
      }
      return true;
    }
    return false;
  });
}

let lastComposerEscAt = 0;
let lastCtrlDAt = 0;

function handleApprovalKey(sequence: string, runtime: KeybindingRuntime): boolean {
  const state = runtime.getState();
  const options = buildApprovalOptions(
    runtime.pendingApprovalMethod() || "",
    state.approvalSelection,
  );
  const lower = sequence.toLowerCase();

  if (sequence === "\u001b") {
    runtime.resolveApproval("decline");
    return true;
  }

  if (sequence === "\u001b[A" || lower === "k" || sequence === "\u0010") {
    runtime.dispatch({ type: "moveApproval", total: options.length, delta: -1 });
    runtime.render();
    return true;
  }
  if (sequence === "\u001b[B" || lower === "j" || sequence === "\u000e") {
    runtime.dispatch({ type: "moveApproval", total: options.length, delta: 1 });
    runtime.render();
    return true;
  }
  if (sequence === "\r") {
    runtime.resolveApproval(options[state.approvalSelection]?.decision || "decline");
    return true;
  }
  if (lower === "a" || lower === "s" || lower === "d") {
    const option = options.find((item) => item.shortcut === lower);
    if (option) runtime.resolveApproval(option.decision);
    return true;
  }

  return true;
}

function isOptionUp(sequence: string): boolean {
  return sequence === "\u001b[1;3A" ||
    sequence === "\u001b[1;9A" ||
    sequence === "\u001b\u001b[A";
}

function handleCtrlD(runtime: KeybindingRuntime): void {
  const now = Date.now();
  if (now - lastCtrlDAt <= 700) {
    lastCtrlDAt = 0;
    runtime.close();
    return;
  }

  lastCtrlDAt = now;
  runtime.dispatch({
    type: "setTurnStatus",
    status: runtime.getState().bottomPane.turnStatus,
    message: "ctrl+d again to exit",
  });
  runtime.render();
}

function handleComposerEsc(runtime: KeybindingRuntime): void {
  if (runtime.isRunning()) {
    runtime.interruptTurn();
    return;
  }

  const now = Date.now();
  if (now - lastComposerEscAt <= 700) {
    lastComposerEscAt = 0;
    runtime.showHistory();
    return;
  }

  lastComposerEscAt = now;
  runtime.dispatch({
    type: "setTurnStatus",
    status: runtime.getState().bottomPane.turnStatus,
    message: "esc again for history",
  });
  runtime.render();
}

function handleSlashKey(sequence: string, runtime: KeybindingRuntime): boolean {
  const commands = filterSlashCommands(runtime.getInputValue());
  if (sequence === "\u001b[A" || sequence === "\u0010") {
    runtime.dispatch({ type: "moveSlash", total: commands.length, delta: -1 });
    runtime.render();
    return true;
  }
  if (sequence === "\u001b[B" || sequence === "\u000e") {
    runtime.dispatch({ type: "moveSlash", total: commands.length, delta: 1 });
    runtime.render();
    return true;
  }
  if (sequence === "\u001b") {
    runtime.dispatch({ type: "closeSurface" });
    runtime.render();
    return true;
  }
  if (sequence === "\t" || sequence === "\r") {
    runtime.acceptSlashSelection();
    return true;
  }
  return false;
}

function handleHistoryKey(sequence: string, runtime: KeybindingRuntime): boolean {
  if (sequence === "\u001b[A" || sequence === "k" || sequence === "\u0010") {
    runtime.moveHistorySelection(-1);
    return true;
  }
  if (sequence === "\u001b[B" || sequence === "j" || sequence === "\u000e") {
    runtime.moveHistorySelection(1);
    return true;
  }
  if (sequence === "\r") {
    runtime.restoreSelected();
    return true;
  }
  if (sequence === "/") {
    runtime.setInputValue("/");
    runtime.dispatch({ type: "inputChanged", value: "/" });
    runtime.focusInput();
    runtime.render();
    return true;
  }
  if (sequence === "\u001b") {
    runtime.setComposerFocus();
    return true;
  }
  return true;
}

function handleThreadKey(sequence: string, runtime: KeybindingRuntime): boolean {
  if (sequence === "\u001b[A" || sequence === "k" || sequence === "\u0010") {
    runtime.moveThreadSelection(-1);
    return true;
  }
  if (sequence === "\u001b[B" || sequence === "j" || sequence === "\u000e") {
    runtime.moveThreadSelection(1);
    return true;
  }
  if (sequence === "\r") {
    runtime.resumeSelected();
    return true;
  }
  if (sequence === "\u001b") {
    runtime.setComposerFocus();
    return true;
  }
  return true;
}

function handleThemeKey(sequence: string, runtime: KeybindingRuntime): boolean {
  if (sequence === "\u001b[A" || sequence === "k" || sequence === "\u0010") {
    runtime.moveThemeSelection(-1);
    return true;
  }
  if (sequence === "\u001b[B" || sequence === "j" || sequence === "\u000e") {
    runtime.moveThemeSelection(1);
    return true;
  }
  if (sequence === "\r") {
    runtime.selectTheme();
    return true;
  }
  if (sequence === "\u001b") {
    runtime.setComposerFocus();
    return true;
  }
  return true;
}

function handleStatusLineKey(sequence: string, runtime: KeybindingRuntime): boolean {
  if (sequence === "\u001b[A" || sequence === "k" || sequence === "\u0010") {
    runtime.moveStatusLineSelection(-1);
    return true;
  }
  if (sequence === "\u001b[B" || sequence === "j" || sequence === "\u000e") {
    runtime.moveStatusLineSelection(1);
    return true;
  }
  if (sequence === " ") {
    runtime.toggleStatusLineItem();
    return true;
  }
  if (sequence === "\r") {
    runtime.setComposerFocus();
    return true;
  }
  if (sequence === "\u001b") {
    runtime.setComposerFocus();
    return true;
  }
  return true;
}

function handleTranscriptKey(sequence: string, runtime: KeybindingRuntime): boolean {
  if (sequence === "\u001b" || sequence === "q") {
    runtime.setComposerFocus();
    return true;
  }
  if (sequence === "\u001b[A" || sequence === "k") {
    runtime.dispatch({ type: "scrollTranscript", delta: -1 });
    runtime.render();
    return true;
  }
  if (sequence === "\u001b[B" || sequence === "j") {
    runtime.dispatch({ type: "scrollTranscript", delta: 1 });
    runtime.render();
    return true;
  }
  if (sequence === "\u001b[5~") {
    runtime.dispatch({ type: "scrollTranscript", delta: -8 });
    runtime.render();
    return true;
  }
  if (sequence === "\u001b[6~") {
    runtime.dispatch({ type: "scrollTranscript", delta: 8 });
    runtime.render();
    return true;
  }
  if (sequence === "g") {
    runtime.dispatch({ type: "jumpTranscriptTop" });
    runtime.render();
    return true;
  }
  if (sequence === "G") {
    runtime.dispatch({ type: "jumpTranscriptBottom" });
    runtime.render();
    return true;
  }
  return true;
}

function handleShortcutKey(sequence: string, runtime: KeybindingRuntime): boolean {
  if (sequence === "\u001b" || sequence === "?") {
    runtime.setComposerFocus();
    return true;
  }
  return true;
}
