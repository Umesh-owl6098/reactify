import type { UsageOperationType } from "@reactify/shared";

export interface TokenEstimateInput {
  operationType: UsageOperationType;
  maxOutputTokens: number;
  instruction?: string;
  selectedFiles?: string[];
  selectedComponentIds?: string[];
  projectContentChars?: number;
  designAnalysisChars?: number;
  planChars?: number;
  validationErrorChars?: number;
  includesImage?: boolean;
}

export interface TokenEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}

const CHARS_PER_TOKEN = 3.5;
const IMAGE_TOKEN_ESTIMATE = 1600;
const PROMPT_OVERHEAD_TOKENS = 256;

function charsToTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function textTokens(text: string | undefined): number {
  if (!text) {
    return 0;
  }
  return charsToTokens(text.length);
}

function fileListTokens(files: string[] | undefined): number {
  if (!files?.length) {
    return 0;
  }
  return charsToTokens(files.join("\n").length + files.length * 32);
}

export function estimateTokens(input: TokenEstimateInput): TokenEstimate {
  let inputChars = PROMPT_OVERHEAD_TOKENS * CHARS_PER_TOKEN;

  switch (input.operationType) {
    case "design_analysis":
      inputChars += 4200;
      break;
    case "generation_plan_creation":
      inputChars += 5200 + (input.designAnalysisChars ?? 6000);
      break;
    case "react_project_generation":
      inputChars += 6800 + (input.planChars ?? 9000);
      break;
    case "automatic_repair":
      inputChars += 5400 + (input.validationErrorChars ?? 5000) + (input.projectContentChars ?? 12000);
      break;
    case "edit_intent_analysis":
      inputChars += 3600 + textTokens(input.instruction) + fileListTokens(input.selectedFiles);
      break;
    case "project_edit_generation":
      inputChars +=
        4800 +
        textTokens(input.instruction) +
        fileListTokens(input.selectedFiles) +
        (input.projectContentChars ?? 18000);
      break;
    case "visual_correction":
      inputChars += 5200 + (input.projectContentChars ?? 8000);
      break;
    default:
      inputChars += 4000;
  }

  let estimatedInputTokens = charsToTokens(inputChars);
  if (input.includesImage !== false && ["design_analysis", "visual_correction"].includes(input.operationType)) {
    estimatedInputTokens += IMAGE_TOKEN_ESTIMATE;
  }

  const estimatedOutputTokens = Math.max(512, input.maxOutputTokens);

  return {
    estimatedInputTokens,
    estimatedOutputTokens,
  };
}
