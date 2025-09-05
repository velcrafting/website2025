// src/app/_og/utils.ts

async function pngToDataUrl(relPath: string): Promise<string | null> {
  try {
    const ab = await fetch(new URL(relPath, import.meta.url)).then(r => r.arrayBuffer());
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

export async function loadOgAssets() {
  const [logo, avatar] = await Promise.all([
    pngToDataUrl("./logo.png"),
    pngToDataUrl("./avatar.png"),
  ]);
  return { logo, avatar };
}
