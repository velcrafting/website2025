// src/lib/storage.ts
import { kv } from "@vercel/kv";

export interface Store {
  increment(key: string, by?: number): Promise<void>;
  hincrby(hash: string, field: string, by: number): Promise<void>;
  getNumber(key: string): Promise<number>;
  getHistogram(hash: string, size: number): Promise<number[]>;
}

// Fallback memory store for local dev (no envs)
class MemoryStore implements Store {
  private nums = new Map<string, number>();
  private hashes = new Map<string, Map<string, number>>();

  async increment(key: string, by = 1) {
    this.nums.set(key, (this.nums.get(key) ?? 0) + by);
  }
  async hincrby(hash: string, field: string, by: number) {
    const h = this.hashes.get(hash) ?? new Map<string, number>();
    h.set(field, (h.get(field) ?? 0) + by);
    this.hashes.set(hash, h);
  }
  async getNumber(key: string) {
    return this.nums.get(key) ?? 0;
  }
  async getHistogram(hash: string, size: number) {
    const h = this.hashes.get(hash) ?? new Map<string, number>();
    return Array.from({ length: size }, (_, i) => h.get(String(i)) ?? 0);
  }
}

// Decide which backend to use
const hasKV = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;

export const store: Store = hasKV
  ? {
      async increment(key, by = 1) {
        await kv.incrby(key, by);
      },
      async hincrby(hash, field, by) {
        await kv.hincrby(hash, field, by);
      },
      async getNumber(key) {
        return Number((await kv.get<number>(key)) ?? 0);
      },
      async getHistogram(hash, size) {
        const h = (await kv.hgetall<Record<string, number>>(hash)) ?? {};
        return Array.from({ length: size }, (_, i) => Number(h[String(i)] ?? 0));
      },
    }
  : new MemoryStore();
