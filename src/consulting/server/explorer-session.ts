import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { consultingSql } from "./database";
import { configuredOrigin, isUuid } from "./request-boundary";

const name = "vel-explorer";
const lifetime = 60 * 60 * 24;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function getExplorerSession(request: Request): Promise<{ id: string } | null> {
  const origin = configuredOrigin(process.env.PUBLIC_SITE_ORIGIN);
  if (!origin || new URL(origin).host !== request.headers.get("host")) return null;
  const value = (await cookies()).get(name)?.value;
  const [id, secret, extra] = value?.split(".") ?? [];
  if (!isUuid(id) || !secret || !/^[a-f0-9]{64}$/.test(secret) || extra !== undefined) return null;
  const sql = await consultingSql();
  const [session] = await sql<{ id: string }[]>`select id from velcrafting_private.explorer_session
    where id = ${id} and capability_sha256 = ${hash(secret)} and invalidated_at is null and expires_at > clock_timestamp()`;
  return session ?? null;
}

export async function beginExplorerSession(request: Request) {
  const existing = await getExplorerSession(request);
  if (existing) return existing;
  const id = randomUUID();
  const secret = randomBytes(32).toString("hex");
  const sql = await consultingSql();
  const [rate] = await sql<{ allowed: boolean }[]>`select velcrafting_private.take_auth_allowance(
    'explorer','start',${hash("anonymous-start")},null) as allowed`;
  if (!rate.allowed) throw new Error("Online session limit reached");
  await sql`insert into velcrafting_private.explorer_session (id, notice_version, expires_at, capability_sha256)
    values (${id}, 'not-accepted', now() + interval '1 day', ${hash(secret)})`;
  (await cookies()).set(name, `${id}.${secret}`, {
    httpOnly: true, sameSite: "lax", path: "/", secure: configuredOrigin(process.env.PUBLIC_SITE_ORIGIN)?.startsWith("https:"),
    maxAge: lifetime,
  });
  return { id };
}
