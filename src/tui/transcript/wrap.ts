export function wrapTranscriptText(text: string, width: number): string[] {
  if (text.length === 0) return [];
  return text.split(/\r?\n/).flatMap((line) => wrapLine(line, width));
}

export function displayWidth(value: string): number {
  return Array.from(value).reduce((width, char) => width + (isWideChar(char) ? 2 : 1), 0);
}

function wrapLine(line: string, width: number): string[] {
  if (line.length === 0) return [""];

  const words = line.match(/\S+\s*/g) || [line];
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const trimmedWord = word.trimEnd();
    const separator = current.length > 0 && !current.endsWith(" ") ? " " : "";
    const candidate = `${current}${separator}${trimmedWord}`;

    if (displayWidth(candidate) <= width) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      lines.push(current);
      current = "";
    }

    if (displayWidth(trimmedWord) <= width) {
      current = trimmedWord;
      continue;
    }

    const chunks = breakLongWord(trimmedWord, width);
    lines.push(...chunks.slice(0, -1));
    current = chunks[chunks.length - 1] || "";
  }

  if (current.length > 0 || lines.length === 0) {
    lines.push(current);
  }

  return lines;
}

function breakLongWord(word: string, width: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const char of Array.from(word)) {
    if (current.length > 0 && displayWidth(`${current}${char}`) > width) {
      chunks.push(current);
      current = char;
    } else {
      current += char;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function isWideChar(char: string): boolean {
  const codePoint = char.codePointAt(0) || 0;
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  );
}
