// src/app/_og/utils.ts

async function pngToDataUrl(relPath: string, origin?: string): Promise<string | null> {
  try {
    const response = await fetch(new URL(relPath, origin ?? import.meta.url));
    if (!response.ok) return null;
    const ab = await response.arrayBuffer();
    // Edge runtime friendly base64 (no Buffer)
    const bytes = new Uint8Array(ab);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const base64 = btoa(bin);
    return `data:image/png;base64,${base64}`;
  } catch {
    return null;
  }
}

export async function loadOgAssets(origin?: string) {
  const [logo, avatar] = await Promise.all([
    pngToDataUrl(origin ? "/about/logos/velcrafting.png" : "./logo.png", origin),
    pngToDataUrl(origin ? "/avatar.png" : "./avatar.png", origin),
  ]);
  return { logo, avatar };
}
