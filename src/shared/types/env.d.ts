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
