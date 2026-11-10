import { asStakeholder } from "@/consulting/server/database";
import { isUuid, noStore } from "@/consulting/server/request-boundary";
import { workspaceIdentity } from "@/consulting/server/workspace";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const deny = () => new Response("Not found", { status: 404, headers: noStore });
  const { id } = await params;
  if (!isUuid(id)) return deny();
  try {
    const identity = await workspaceIdentity();
    if (!identity) return deny();
    const [file] = await asStakeholder(identity.id, (tx) => tx<{ filename: string; media_type: string; bytes: Buffer }[]>`
      select filename,media_type,bytes from velcrafting_private.workspace_file where id=${id}`);
    if (!file) return deny();
    return new Response(new Uint8Array(file.bytes), { headers: {
      ...noStore, "Content-Type": file.media_type, "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, (char) => "%" + char.charCodeAt(0).toString(16))}`,
    } });
  } catch { return deny(); }
}
