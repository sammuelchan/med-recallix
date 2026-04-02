function getNamespace(ns: "config" | "data"): KVNamespace {
  const binding =
    ns === "config"
      ? (globalThis as Record<string, unknown>).MY_KV_NAMESPACE
      : (globalThis as Record<string, unknown>).MY_KV_NAMESPACE_DATA;

  if (!binding) {
    if (process.env.NODE_ENV === "development") {
      const { getDevKV } = require("./kv.mock") as typeof import("./kv.mock");
      return getDevKV(ns);
    }
    throw new Error(`KV namespace "${ns}" not bound. Check edgeone.json.`);
  }

  return binding as KVNamespace;
}

export async function kvGet<T>(
  key: string,
  ns: "config" | "data" = "data",
): Promise<T | null> {
  const raw = await getNamespace(ns).get(key);
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

export async function kvPut<T>(
  key: string,
  value: T,
  ns: "config" | "data" = "data",
): Promise<void> {
  await getNamespace(ns).put(key, JSON.stringify(value));
}

export async function kvDelete(
  key: string,
  ns: "config" | "data" = "data",
): Promise<void> {
  await getNamespace(ns).delete(key);
}

export async function kvList(
  prefix: string,
  ns: "config" | "data" = "data",
): Promise<string[]> {
  const result = await getNamespace(ns).list({ prefix });
  return result.keys.map((k) => k.name);
}
