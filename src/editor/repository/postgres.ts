import { AsyncLocalStorage } from "node:async_hooks";
import postgres, { type Sql, type TransactionSql } from "postgres";

type Row = Record<string, unknown>;

const transactionContext = new AsyncLocalStorage<{
  database: PostgresEditorDatabase;
  transaction: TransactionSql;
}>();

export function postgresTarget(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("POSTGRES_URL is invalid");
  }
  const direct = parsed.hostname === "db.eeddvwszyhcrjbvmcpow.supabase.co" && parsed.username === "website_editor";
  const pooled = parsed.hostname === "aws-0-us-east-1.pooler.supabase.com" && parsed.username === "website_editor.eeddvwszyhcrjbvmcpow";
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("POSTGRES_URL must use the PostgreSQL protocol");
  }
  if (!direct && !pooled) throw new Error("POSTGRES_URL is not bound to the approved Supabase project");
}

export class PostgresEditorDatabase {
  private readonly client: Sql;

  constructor(url: string) {
    postgresTarget(url);
    this.client = postgres(url, {
      ssl: "require",
      max: 1,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 5,
      onnotice: () => {},
    });
  }

  prepare(text: string) {
    const query = (values: unknown[]) => {
      const active = transactionContext.getStore();
      const client = active?.database === this ? active.transaction : this.client;
      return client.unsafe<Row[]>(postgresPlaceholders(text), values as never[], { prepare: false });
    };
    return {
      get: async (...values: unknown[]) => (await query(values))[0],
      all: (...values: unknown[]) => query(values),
      run: async (...values: unknown[]) => ({ changes: Number((await query(values)).count) }),
    };
  }

  async exec(text: string): Promise<void> {
    const active = transactionContext.getStore();
    const client = active?.database === this ? active.transaction : this.client;
    await client.unsafe(text, [], { prepare: false });
  }

  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.inTransaction()) throw new Error("Nested editor transactions are not supported");
    return await this.client.begin(async (tx) =>
      transactionContext.run({ database: this, transaction: tx }, fn),
    ) as unknown as T;
  }

  inTransaction(): boolean {
    return transactionContext.getStore()?.database === this;
  }

  close(): Promise<void> {
    return this.client.end({ timeout: 5 });
  }
}

export function postgresPlaceholders(text: string): string {
  let out = "";
  let index = 0;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      out += char;
      if (char === quote) {
        if (text[i + 1] === quote) out += text[++i];
        else quote = null;
      } else if (char === "\\" && quote === "'" && text[i + 1]) out += text[++i];
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      out += char;
    } else if (char === "?") {
      out += `$${++index}`;
    } else {
      out += char;
    }
  }
  if (index === 0 && text.includes("?")) {
    // A question mark in a SQL string is not a bind parameter.
    return text;
  }
  return out;
}
