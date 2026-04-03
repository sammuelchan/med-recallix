/**
 * KV Storage Abstraction Layer
 *
 * Priority chain:
 *   1. EdgeOne KV binding (production)  — global vars MED_CONFIG / MED_DATA
 *   2. Local file storage (dev)         — ~/.med-recallix/kv/{namespace}/{key}.json
 *   3. In-memory Map (dev fallback)     — volatile, lost on restart
 */

import { getFileKV } from "./kv.local";

interface KVAdapter {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<string[]>;
}

function wrapEdgeOneKV(binding: EdgeOneKV): KVAdapter {
  return {
    get: (key) => binding.get(key),
    put: (key, value) => binding.put(key, value),
    delete: (key) => binding.delete(key),
    async list(options) {
      const result = await binding.list({
        prefix: options?.prefix,
        limit: options?.limit ?? 256,
      });
      return result.keys.map((k) => k.key);
    },
  };
}

function getAdapter(ns: "config" | "data"): KVAdapter {
  const binding =
    ns === "config"
      ? (globalThis as Record<string, unknown>).MED_CONFIG
      : (globalThis as Record<string, unknown>).MED_DATA;

  if (binding) {
    return wrapEdgeOneKV(binding as EdgeOneKV);
  }

  return getFileKV(ns === "config" ? "med_config" : "med_data");
}

export async function kvGet<T>(
  key: string,
  ns: "config" | "data" = "data",
): Promise<T | null> {
  const raw = await getAdapter(ns).get(key);
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

export async function kvPut<T>(
  key: string,
  value: T,
  ns: "config" | "data" = "data",
): Promise<void> {
  await getAdapter(ns).put(key, JSON.stringify(value));
}

export async function kvDelete(
  key: string,
  ns: "config" | "data" = "data",
): Promise<void> {
  await getAdapter(ns).delete(key);
}

export async function kvList(
  prefix: string,
  ns: "config" | "data" = "data",
): Promise<string[]> {
  return getAdapter(ns).list({ prefix });
}
