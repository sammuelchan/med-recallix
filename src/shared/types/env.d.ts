/**
 * Global Type Declarations — EdgeOne KV bindings and environment variables.
 *
 * MED_CONFIG / MED_DATA are KV namespace bindings injected by EdgeOne Pages
 * into the global scope of Edge Functions. They are undefined in Next.js
 * API routes (Node.js runtime), which is why the HTTP proxy pattern exists.
 *
 * EdgeOneKV defines the KV binding interface provided by Tencent EdgeOne.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    JWT_SECRET?: string;
    NEXT_PUBLIC_APP_URL?: string;
    MED_RECALLIX_HOME?: string;
  }
}

declare const MED_CONFIG: EdgeOneKV | undefined;
declare const MED_DATA: EdgeOneKV | undefined;

interface EdgeOneKV {
  get(key: string): Promise<string | null>;
  get(key: string, type: "json"): Promise<unknown | null>;
  get(key: string, options: { type: string }): Promise<unknown | null>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { key: string }[];
    cursor: string | null;
    complete: boolean;
  }>;
}
