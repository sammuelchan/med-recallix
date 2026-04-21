/**
 * AI Client Factory
 *
 * Creates an OpenAI-compatible client using the Vercel AI SDK.
 * Supports any provider with an OpenAI-compatible API (Moonshot/Kimi,
 * DeepSeek, OpenAI, etc.) via baseURL configuration.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AIConfig } from "./ai.config";

/** Build an AI client from the given config; used by chat and quiz services. */
export function createAIClient(config: AIConfig) {
  return createOpenAICompatible({
    name: "med-recallix-ai",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
}
