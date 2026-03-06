// src/lib/prng.ts
export function sfc32(a: number, b: number, c: number, d: number) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
export function makeSeedFromBlob(blob: string): [number, number, number, number] {
  const PRIME = 0x01000193, BASE = 0x811c9dc5;
  const out = new Uint32Array(4); let h = BASE;
  for (let i = 0; i < blob.length; i++) { h ^= blob.charCodeAt(i); h = Math.imul(h, PRIME); }
  out[0] = h; out[1] = Math.imul(h ^ 0x9e3779b9, PRIME); out[2] = Math.imul(h ^ 0x85ebca6b, PRIME); out[3] = Math.imul(h ^ 0xc2b2ae35, PRIME);
  return [out[0], out[1], out[2], out[3]];
}
