import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import type { LoadedPrompt, LoadPromptFn } from "@reactify/shared";

const PROMPTS_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../prompts");

export function loadPrompt(
  name: "design-analysis" | "generation-plan" | "generation" | "repair",
): LoadedPrompt {
  const raw = readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf8");
  const { data, content } = matter(raw);

  return {
    meta: {
      promptVersion: String(data.promptVersion),
      schemaVersion: String(data.schemaVersion),
    },
    content: content.trim(),
  };
}

export const defaultLoadPrompt: LoadPromptFn = loadPrompt;
