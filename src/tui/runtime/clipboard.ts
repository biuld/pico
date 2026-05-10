import type { CliRenderer } from "@opentui/core";

export interface CopySelectionResult {
  message?: string;
}

export async function copyRendererSelection(
  renderer: CliRenderer,
  notifyWhenEmpty = false,
): Promise<CopySelectionResult> {
  const text = renderer.getSelection()?.getSelectedText() || "";
  if (text.trim().length === 0) {
    return notifyWhenEmpty ? { message: "no selection" } : {};
  }

  const copied = await copyTextToClipboard(renderer, text);
  return {
    message: copied
      ? `copied ${formatCopySize(text)}`
      : "clipboard unavailable",
  };
}

async function copyTextToClipboard(renderer: CliRenderer, text: string): Promise<boolean> {
  if (renderer.copyToClipboardOSC52(text)) return true;
  if (process.platform !== "darwin") return false;

  try {
    const proc = Bun.spawn(["pbcopy"], {
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.stdin.write(text);
    proc.stdin.end();
    return await proc.exited === 0;
  } catch {
    return false;
  }
}

function formatCopySize(text: string): string {
  const count = Array.from(text).length;
  return `${count} char${count === 1 ? "" : "s"}`;
}
