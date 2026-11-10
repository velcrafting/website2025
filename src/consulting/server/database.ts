import postgres from "postgres";
import type { TransactionSql } from "postgres";
import { isUuid } from "./request-boundary";

let pool: ReturnType<typeof postgres> | undefined;

export async function consultingSql() {
  const dsn = process.env.VELCRAFTING_RUNTIME_DATABASE_URL;
  if (!dsn || new URL(dsn).username !== "velcrafting_runtime") throw new Error("Restricted consulting database is unavailable");
  if (!pool) pool = postgres(dsn, { max: 4, prepare: false, connect_timeout: 5, idle_timeout: 20 });
  const [role] = await pool<{ usable: boolean }[]>`
    select current_user = 'velcrafting_runtime' and session_user = current_user and
      not (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolinherit)
      and not exists (select 1 from pg_roles elevated where elevated.oid <> r.oid
        and (elevated.rolsuper or elevated.rolbypassrls or elevated.rolname in ('pg_read_all_data','pg_write_all_data'))
        and pg_has_role(r.oid,elevated.oid,'MEMBER'))
      and not exists (select 1 from pg_namespace n where n.nspname = 'velcrafting_private' and n.nspowner = r.oid)
      and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'velcrafting_private' and c.relowner = r.oid) as usable
    from pg_roles r where r.rolname = current_user`;
  if (!role?.usable) throw new Error("Restricted consulting database is unavailable");
  return pool;
}

export async function asStakeholder<T>(userId: string, work: (tx: TransactionSql) => Promise<T>): Promise<T> {
  if (!isUuid(userId)) throw new Error("Invalid verified subject");
  return (await consultingSql()).begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
    return await work(tx);
  }) as Promise<T>;
}
