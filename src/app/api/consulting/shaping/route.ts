import { z } from "zod";
import { aiSettings, commandCodeTransport, instructions, instructionVersion, postgresAttemptStore } from "@/consulting/server/ai-runtime";
import { briefSnapshot } from "@/consulting/server/brief-persistence";
import { consultingSql } from "@/consulting/server/database";
import { getExplorerSession } from "@/consulting/server/explorer-session";
import { boundedJson, isPublicMutation, json } from "@/consulting/server/request-boundary";
import { runRecordedAttempt } from "@/consulting/server/recorded-attempt";
import { aiNoticeVersion, parseShapingReply } from "@/consulting/shaping";

const payload = z.strictObject({
  idempotencyKey: z.uuid(), notice: z.literal(aiNoticeVersion), message: z.string().trim().min(1).max(1600),
  brief: briefSnapshot.nullable(),
});
const unavailable = () => json({ error: "AI assistance is unavailable. Your brief stays with you." }, 503);

export async function POST(request: Request) {
  if (!isPublicMutation(request)) return json({ error: "Unavailable" }, 403);
  const settings = aiSettings();
  if (!settings) return unavailable();
  const parsed = payload.safeParse(await boundedJson(request).catch(() => null));
  if (!parsed.success) return json({ error: "Invalid message or missing recording notice" }, 400);
  const data = parsed.data;
  const selected = data.brief && {
    revision: data.brief.version, id: data.brief.id, service: data.brief.service,
    fields: Object.fromEntries(Object.entries(data.brief.fields).filter(([,field]) => field?.source === "visitor")),
    scope: data.brief.scope,
  };
  const userContent = selected ? JSON.stringify({ message: data.message, selectedBrief: selected }) : data.message;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-|ghp_|github_pat_|sb_secret_)[\w-]{12,}/i.test(userContent)) {
    return json({ error: "Remove secret keys before sending." }, 400);
  }
  try {
    const session = await getExplorerSession(request);
    if (!session) return json({ error: "Start an explorer session first" }, 409);
    const sql = await consultingSql();
    const [rate] = await sql<{ allowed: boolean }[]>`select velcrafting_private.take_auth_allowance(
      'explorer','shape',repeat('0',64),${session.id}) as allowed`;
    if (!rate.allowed) return json({ error: "Message limit reached. Try again later." }, 429);
    await sql`update velcrafting_private.explorer_session set notice_version=${aiNoticeVersion}
      where id=${session.id} and expires_at>clock_timestamp() and invalidated_at is null`;
    const history = await sql<{ id: string; role: "user" | "assistant"; body: string }[]>`
      select id,role,body from velcrafting_private.read_explorer_conversation(${session.id})`;
    const prior = history.filter(({ role, body }) => role === "user" || parseShapingReply(body)).slice(-6);
    const messages = [...prior.map(({role,body}) => ({ role, content: body })), { role: "user", content: userContent }];
    const context = JSON.stringify({ system: instructions, messages, sourceIds: prior.map(({id}) => id) });
    if (Buffer.byteLength(context) > 31_000) return json({ error: "This context is too long to send." }, 400);
    const response = await runRecordedAttempt(postgresAttemptStore(sql), commandCodeTransport(settings.key), {
      sessionId: session.id, idempotencyKey: data.idempotencyKey, input: data.message, context, instructionVersion,
      allowanceUnits: 1, payloadExpiresAt: new Date(Date.now() + settings.retentionHours * 3_600_000).toISOString(),
    });
    if (response.disposition !== "completed") return json({
      error: response.disposition === "duplicate" ? "This message was already received. It will not be sent again." :
        "No answer is available for this message. Your brief is still here.",
    }, response.disposition === "duplicate" ? 409 : 503);
    const reply = parseShapingReply(response.output);
    if (!reply) return json({ error: "The answer could not be displayed. Your brief is unchanged." }, 502);
    const [source] = await sql<{ id: string | null }[]>`select velcrafting_private.explorer_output_id(
      ${session.id},${response.operationId}) as id`;
    return json({ ...reply, operationId: response.operationId, sourceMessageId: source.id });
  } catch { return unavailable(); }
}
