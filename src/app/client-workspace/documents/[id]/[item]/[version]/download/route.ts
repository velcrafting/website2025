import { noStore } from "@/consulting/server/request-boundary";
import { workspaceDocument, workspaceIdentity } from "@/consulting/server/workspace";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{id: string; item: string; version: string}> }) {
  const deny = () => new Response("Not found", { status: 404, headers: noStore });
  try {
    const identity = await workspaceIdentity();
    if (!identity) return deny();
    const { id, item, version } = await params;
    if (!/^[1-9]\d{0,4}$/.test(version)) return deny();
    const document = await workspaceDocument(identity.id, id, item, Number(version));
    if (!document) return deny();
    const { revision, terms } = document;
    const sections = (revision.body.sections ?? []).map(({ label, text }) => `${label}\n${text}`);
    return new Response([revision.title, `Version ${revision.version} · ${revision.published_at.toISOString()}`, ...sections,
      ...(terms ? ["Commercial terms\n" + terms] : [])].join("\n\n") + "\n", { headers: {
      ...noStore, "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="velcrafting-document-v${version}.txt"`,
    } });
  } catch { return deny(); }
}
