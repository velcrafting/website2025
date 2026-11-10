export function configuredOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (value !== url.origin) return null;
    if (url.protocol === "https:") return url.origin;
    if (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) && process.env.NODE_ENV !== "production") return url.origin;
  } catch { /* Invalid config stays disabled. */ }
  return null;
}

export function isClientHost(host: string | null) {
  const origin = configuredOrigin(process.env.CLIENT_SITE_ORIGIN);
  return !!origin && host === new URL(origin).host;
}

function sameOrigin(request: Request, expected: string | null) {
  return !!expected && request.headers.get("origin") === expected &&
    request.headers.get("host") === new URL(expected).host &&
    (request.headers.get("content-type") ?? "").split(";", 1)[0].trim() === "application/json";
}

export function isPublicMutation(request: Request) {
  return sameOrigin(request, configuredOrigin(process.env.PUBLIC_SITE_ORIGIN));
}

export function isClientMutation(request: Request) {
  return sameOrigin(request, configuredOrigin(process.env.CLIENT_SITE_ORIGIN));
}

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const noStore = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: noStore });

export async function boundedJson(request: Request, limit = 24_000): Promise<unknown> {
  const stream = request.body?.getReader();
  if (!stream) throw new Error("Missing body");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await stream.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) throw new Error("Body is too large");
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    await stream.cancel().catch(() => {});
    throw new Error("Invalid request body");
  } finally { stream.releaseLock(); }
}
