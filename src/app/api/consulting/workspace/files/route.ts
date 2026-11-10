import { z } from "zod";
import { asStakeholder } from "@/consulting/server/database";
import { workspaceIdentity } from "@/consulting/server/workspace";
import { boundedJson, isClientMutation, json } from "@/consulting/server/request-boundary";

const attachment = z.strictObject({
  engagementId: z.uuid(), itemId: z.uuid(), version: z.number().int().min(1).max(10000),
  name: z.string().min(1).max(180).regex(/^[^/\\\u0000-\u001f\u007f]+$/),
  media: z.enum(["application/pdf","text/plain","text/markdown"]),
  bytes: z.base64().max(4_000_000), commercial: z.boolean(),
});

export async function POST(request: Request) {
  if (!isClientMutation(request)) return json({ error: "Not found" }, 404);
  try {
    const actor = await workspaceIdentity();
    if (!actor) return json({ error: "Not found" }, 404);
    const parsed = attachment.safeParse(await boundedJson(request, 4_003_000).catch(() => null));
    if (!parsed.success) return json({ error: "Invalid file or revision" }, 400);
    const file = parsed.data;
    const bytes = Buffer.from(file.bytes,"base64");
    if (!bytes.length || bytes.length > 3_000_000 ||
      (file.media === "application/pdf" && bytes.toString("ascii",0,5) !== "%PDF-")) return json({ error: "Invalid file" }, 400);
    const [result] = await asStakeholder(actor.id, (tx) => tx<{id:string|null}[]>`select velcrafting_private.store_workspace_file(
      ${file.engagementId},${file.itemId},${file.version},${file.name},${file.media},${bytes},${file.commercial}) as id`);
    return result.id ? json({ id: result.id }, 201) : json({ error: "Not found" }, 404);
  } catch { return json({ error: "Could not store file" }, 503); }
}
