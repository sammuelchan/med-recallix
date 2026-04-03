import { kvGet, kvPut, CONFIG_KEYS } from "@/shared/infrastructure/kv";

export interface AIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

const DEFAULT_CONFIG: AIConfig = {
  apiKey: "",
  baseURL: "https://api.moonshot.cn/v1",
  model: "moonshot-v1-auto",
};

/**
 * AI configuration priority chain:
 *   1. KV storage (EdgeOne production / local file dev)
 *   2. Environment variables (KIMI_API_KEY, AI_BASE_URL, AI_MODEL)
 *   3. Built-in defaults
 */
export async function getAIConfig(): Promise<AIConfig> {
  const stored = await kvGet<AIConfig>(CONFIG_KEYS.aiConfig, "config");

  const config: AIConfig = {
    apiKey:
      stored?.apiKey ||
      process.env.KIMI_API_KEY ||
      process.env.AI_API_KEY ||
      DEFAULT_CONFIG.apiKey,
    baseURL:
      stored?.baseURL ||
      process.env.AI_BASE_URL ||
      DEFAULT_CONFIG.baseURL,
    model:
      stored?.model ||
      process.env.AI_MODEL ||
      DEFAULT_CONFIG.model,
  };

  return config;
}

export async function setAIConfig(
  update: Partial<AIConfig>,
): Promise<AIConfig> {
  const current = await getAIConfig();
  const merged = { ...current, ...update };
  await kvPut(CONFIG_KEYS.aiConfig, merged, "config");
  return merged;
}
