const DEFAULT_MAX_LINES = 200;

export function createUnifiedDiff(
  before: string,
  after: string,
  path: string,
  maxLines = DEFAULT_MAX_LINES,
): { diff: string; truncated: boolean } {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const output: string[] = [`--- ${path}`, `+++ ${path}`];
  let truncated = false;

  const maxLength = Math.max(beforeLines.length, afterLines.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (output.length >= maxLines) {
      truncated = true;
      break;
    }

    const left = beforeLines[index];
    const right = afterLines[index];

    if (left === right) {
      if (left !== undefined) {
        output.push(` ${left}`);
      }
      continue;
    }

    if (left !== undefined) {
      output.push(`-${left}`);
    }
    if (right !== undefined) {
      output.push(`+${right}`);
    }
  }

  if (truncated) {
    output.push("… diff truncated for display");
  }

  return { diff: output.join("\n"), truncated };
}
