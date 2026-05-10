import type { ResponseItem } from "../thread/store";

export function responseItemText(item: ResponseItem): string {
  const direct = firstString(item, ["text", "output_text", "message", "summary"]);
  if (direct) return direct;

  if (Array.isArray(item.content)) {
    const parts = item.content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      return firstString(part as Record<string, unknown>, ["text", "output_text", "content"]) || [];
    });
    if (parts.length > 0) return parts.join("");
  }

  if (Array.isArray(item.output)) {
    const parts = item.output.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      return responseItemText(part as Record<string, unknown>) || [];
    });
    if (parts.length > 0) return parts.join("");
  }

  return "";
}

export function responseItemAgentText(item: ResponseItem): string {
  const role = typeof item.role === "string" ? item.role : undefined;
  if (role && role !== "assistant") return "";
  return responseItemText(item);
}

export function shouldDisplayResponseItem(item: ResponseItem): boolean {
  const role = typeof item.role === "string" ? item.role : undefined;
  return role !== "developer" && role !== "user";
}

function firstString(item: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}
