// src/app/_og/util.ts
export async function loadLogoDataUrl() {
  try {
    // Path is relative to THIS file, so it works from any importer
    const svgText = await fetch(new URL("./logo.svg", import.meta.url)).then(r => r.text());
    const encoded = encodeURIComponent(svgText).replace(/%0A/g, "").replace(/%20/g, " ");
    return `data:image/svg+xml;utf8,${encoded}`;
  } catch {
    return null;
  }
}
