/**
 * Local file-based KV storage for development.
 *
 * Storage path: ~/.med-recallix/kv/{namespace}/{key}.json
 * Falls back to in-memory Map if filesystem is unavailable (e.g. Edge Runtime).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

let _fs: any = null;
let _path: any = null;
let _os: any = null;
let _initDone = false;
let _initPromise: Promise<void> | null = null;

async function initModules(): Promise<void> {
  if (_initDone) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      _fs = await import("node:fs");
      _path = await import("node:path");
      _os = await import("node:os");
    } catch {
      // Edge Runtime — no filesystem
    }
    _initDone = true;
  })();
  return _initPromise;
}

function getStorageDir(namespace: string): string | null {
  if (!_fs || !_path || !_os) return null;
  const homedir = typeof _os.homedir === "function" ? _os.homedir() : _os.default?.homedir?.();
  if (!homedir) return null;
  const home = process.env.MED_RECALLIX_HOME || _path.join(homedir, ".med-recallix");
  const dir = _path.join(home, "kv", namespace);
  const existsSync = _fs.existsSync || _fs.default?.existsSync;
  const mkdirSync = _fs.mkdirSync || _fs.default?.mkdirSync;
  if (existsSync && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function safeFileName(key: string): string {
  return encodeURIComponent(key) + ".json";
}

function keyFromFileName(file: string): string {
  return decodeURIComponent(file.replace(/\.json$/, ""));
}

const memoryStores = new Map<string, Map<string, string>>();
function getMemStore(ns: string): Map<string, string> {
  if (!memoryStores.has(ns)) memoryStores.set(ns, new Map());
  return memoryStores.get(ns)!;
}

function fsOp(name: string): any {
  return _fs?.[name] || _fs?.default?.[name];
}

function pathJoin(...args: string[]): string {
  const join = _path?.join || _path?.default?.join;
  return join(...args);
}

export function getFileKV(namespace: string) {
  return {
    async get(key: string): Promise<string | null> {
      await initModules();
      const dir = getStorageDir(namespace);
      if (dir) {
        const filePath = pathJoin(dir, safeFileName(key));
        if (fsOp("existsSync")(filePath)) {
          return fsOp("readFileSync")(filePath, "utf-8");
        }
        return null;
      }
      return getMemStore(namespace).get(key) ?? null;
    },

    async put(key: string, value: string): Promise<void> {
      await initModules();
      const dir = getStorageDir(namespace);
      if (dir) {
        fsOp("writeFileSync")(pathJoin(dir, safeFileName(key)), value, "utf-8");
        return;
      }
      getMemStore(namespace).set(key, value);
    },

    async delete(key: string): Promise<void> {
      await initModules();
      const dir = getStorageDir(namespace);
      if (dir) {
        const filePath = pathJoin(dir, safeFileName(key));
        if (fsOp("existsSync")(filePath)) fsOp("unlinkSync")(filePath);
        return;
      }
      getMemStore(namespace).delete(key);
    },

    async list(options?: { prefix?: string; limit?: number }): Promise<string[]> {
      await initModules();
      const prefix = options?.prefix ?? "";
      const limit = options?.limit ?? 1000;

      const dir = getStorageDir(namespace);
      if (dir) {
        const files = (fsOp("readdirSync")(dir) as string[]).filter((f: string) => f.endsWith(".json"));
        return files
          .map(keyFromFileName)
          .filter((k: string) => k.startsWith(prefix))
          .slice(0, limit);
      }

      return [...getMemStore(namespace).keys()]
        .filter((k) => k.startsWith(prefix))
        .slice(0, limit);
    },
  };
}
