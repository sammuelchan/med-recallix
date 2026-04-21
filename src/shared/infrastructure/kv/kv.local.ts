/**
 * Local file-based KV storage — development / testing only.
 *
 * Storage path: $MED_RECALLIX_HOME/kv/{namespace}/{key}.json
 *               (defaults to ~/.med-recallix/kv/...)
 *
 * Falls back to an in-memory Map when the Node.js fs module is unavailable
 * (e.g. when bundled for an Edge Runtime environment).
 *
 * Node built-ins (fs, path, os) are loaded lazily via dynamic import so this
 * file can be safely imported in both Node and Edge contexts without blowing up.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

let _fs: any = null;
let _path: any = null;
let _os: any = null;
let _initDone = false;
let _initPromise: Promise<void> | null = null;

/** Lazy-load Node.js built-ins; silently swallows import errors in Edge Runtime. */
async function initModules(): Promise<void> {
  if (_initDone) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      _fs = await import(/* turbopackIgnore: true */ "node:fs");
      _path = await import(/* turbopackIgnore: true */ "node:path");
      _os = await import(/* turbopackIgnore: true */ "node:os");
    } catch {
      // Edge Runtime — no filesystem
    }
    _initDone = true;
  })();
  return _initPromise;
}

/** Resolve (and ensure) the storage directory for a given namespace; null if fs unavailable. */
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

/** URL-encode keys to make them filesystem-safe. */
function safeFileName(key: string): string {
  return encodeURIComponent(key) + ".json";
}

function keyFromFileName(file: string): string {
  return decodeURIComponent(file.replace(/\.json$/, ""));
}

/** Per-namespace in-memory fallback stores (volatile). */
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

/**
 * Return a KVAdapter backed by the local file system (or in-memory map).
 * Each call returns a fresh adapter closure bound to the given namespace.
 */
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
