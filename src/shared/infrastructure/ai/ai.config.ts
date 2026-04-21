/**
 * AI Configuration Manager
 *
 * Loads / persists AI provider settings (API key, base URL, model name).
 * Settings are merged from three sources with this priority:
 *
 *   1. KV storage   — user-configured values via /settings page
 *   2. Environment   — KIMI_API_KEY / AI_API_KEY, AI_BASE_URL, AI_MODEL
 *   3. Built-in defaults — Moonshot (moonshot-v1-auto)
 *
 * The settings page calls setAIConfig() to persist changes to KV,
 * so they survive redeployments without env var changes.
 */

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

/** Resolve the effective AI config by merging KV → env → defaults. */
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

/** Merge partial updates into the current config and persist to KV. */
export async function setAIConfig(
  update: Partial<AIConfig>,
): Promise<AIConfig> {
  const current = await getAIConfig();
  const merged = { ...current, ...update };
  await kvPut(CONFIG_KEYS.aiConfig, merged, "config");
  return merged;
}
