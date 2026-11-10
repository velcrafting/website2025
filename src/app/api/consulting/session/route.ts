import { beginExplorerSession } from "@/consulting/server/explorer-session";
import { isPublicMutation, json } from "@/consulting/server/request-boundary";

export async function POST(request: Request) {
  if (!isPublicMutation(request)) return json({ error: "Unavailable" }, 403);
  if (process.env.VELCRAFTING_EXPLORER_ENABLED !== "1") return json({ error: "Online saving is unavailable" }, 503);
  try {
    await beginExplorerSession(request);
    return json({ ready: true });
  } catch { return json({ error: "Online saving is unavailable" }, 503); }
}
