import { timingSafeEqual } from "node:crypto";
import { consultingSql } from "@/consulting/server/database";
import { json } from "@/consulting/server/request-boundary";

export async function POST(request: Request) {
  const key = process.env.VELCRAFTING_AI_MAINTENANCE_TOKEN;
  const authorization = request.headers.get("authorization");
  if (!key || key.length < 32 || !authorization) return json({ error: "Not found" }, 404);
  const expected = Buffer.from("Bearer " + key);
  const received = Buffer.from(authorization);
  if (received.length !== expected.length || !timingSafeEqual(received,expected)) return json({ error: "Not found" }, 404);
  try {
    const sql = await consultingSql();
    const sessions = await sql<{session_id:string}[]>`select session_id from velcrafting_private.ai_maintenance_candidates(20)`;
    let expired = 0;
    let recovered = 0;
    for (const { session_id } of sessions) {
      const [result] = await sql<{payloads_expired:number;recovered:boolean}[]>`
        select * from velcrafting_private.maintain_ai_session(${session_id})`;
      expired += result.payloads_expired;
      recovered += Number(result.recovered);
    }
    return json({ examined: sessions.length, expired, recovered, morePossible: sessions.length === 20 });
  } catch { return json({ error: "Maintenance unavailable" }, 503); }
}
