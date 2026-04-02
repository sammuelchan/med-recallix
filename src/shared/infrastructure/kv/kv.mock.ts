const stores = new Map<string, Map<string, string>>();

function getStore(ns: string): Map<string, string> {
  if (!stores.has(ns)) stores.set(ns, new Map());
  return stores.get(ns)!;
}

export function getDevKV(ns: string): KVNamespace {
  const store = getStore(ns);

  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(options?: { prefix?: string; limit?: number }) {
      const prefix = options?.prefix ?? "";
      const limit = options?.limit ?? 1000;
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .slice(0, limit)
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}
