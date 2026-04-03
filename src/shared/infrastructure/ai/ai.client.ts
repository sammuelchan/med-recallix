import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AIConfig } from "./ai.config";

export function createAIClient(config: AIConfig) {
  return createOpenAICompatible({
    name: "med-recallix-ai",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
}
