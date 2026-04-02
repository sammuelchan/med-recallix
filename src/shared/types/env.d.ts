declare namespace NodeJS {
  interface ProcessEnv {
    JWT_SECRET: string;
    NEXT_PUBLIC_APP_URL?: string;
  }
}

declare const MY_KV_NAMESPACE: KVNamespace | undefined;
declare const MY_KV_NAMESPACE_DATA: KVNamespace | undefined;

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    cursor?: string;
    list_complete: boolean;
  }>;
}
