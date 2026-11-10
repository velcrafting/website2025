import { verifiedIdentity } from "@/consulting/server/auth";
import { briefSnapshot } from "@/consulting/server/brief-persistence";
import { consultingSql } from "@/consulting/server/database";
import { getExplorerSession } from "@/consulting/server/explorer-session";
import { boundedJson, isPublicMutation, json } from "@/consulting/server/request-boundary";

export async function POST(request: Request) {
  if (!isPublicMutation(request)) return json({ error: "Unavailable" }, 403);
  if (process.env.VELCRAFTING_EXPLORER_ENABLED !== "1") return json({ error: "Online saving is unavailable" }, 503);
  try {
    const session = await getExplorerSession(request);
    if (!session) return json({ error: "Start an explorer session first" }, 409);
    const candidate = briefSnapshot.safeParse(await boundedJson(request).catch(() => null));
    if (!candidate.success) return json({ error: "Invalid brief revision" }, 400);
    const sql = await consultingSql();
    const { id, version } = candidate.data;
    const [saved] = await sql<{ sha256: string | null }[]>`select velcrafting_private.save_brief_revision(
      ${session.id}, ${id}, ${version}, ${sql.json(candidate.data)}) as sha256`;
    return saved.sha256 ? json({ id, version, sha256: saved.sha256 }) : json({ error: "This revision conflicts with the stored brief" }, 409);
  } catch { return json({ error: "Online saving is unavailable" }, 503); }
}

export async function GET(request: Request) {
  if (process.env.VELCRAFTING_EXPLORER_ENABLED !== "1") return json({ error: "Online saving is unavailable" }, 503);
  try {
    const session = await getExplorerSession(request);
    const identity = session && await verifiedIdentity("prospect");
    if (!session || !identity) return json({ error: "Not found" }, 404);
    const sql = await consultingSql();
    const [contact] = await sql<{ verified_email: string }[]>`select verified_email from velcrafting_private.prospect_contact
      where session_id=${session.id} and user_id=${identity.id} and verified_email=${identity.email} and revoked_at is null`;
    if (!contact) return json({ error: "Not found" }, 404);
    const [saved] = await sql<{ snapshot: unknown }[]>`select snapshot from velcrafting_private.brief_revision
      where session_id=${session.id} order by created_at desc limit 1`;
    const brief = briefSnapshot.safeParse(saved?.snapshot);
    return json({ brief: brief.success ? brief.data : null, verifiedEmail: contact.verified_email });
  } catch { return json({ error: "Online saving is unavailable" }, 503); }
}
