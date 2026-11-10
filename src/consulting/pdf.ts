import { briefSections, briefTitle, type BriefRevision } from "./brief";

const winAnsi = "€\0‚ƒ„…†‡ˆ‰Š‹Œ\0Ž\0\0‘’“”•–—˜™š›œ\0žŸ";

function pdfString(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    if (code >= 32 && code <= 126) return character.replace(/[()\\]/g, "\\$&");
    if (code >= 160 && code <= 255) return "\\" + code.toString(8);
    const index = winAnsi.indexOf(character);
    if (index >= 0 && character !== "\0") return "\\" + (128 + index).toString(8);
    // shortcut: the built-in PDF font covers Windows-1252; embed a licensed Unicode font before broader PDF support.
    throw new Error("The PDF font cannot display some characters in this brief. Download Markdown or use Copy brief to keep the original text.");
  }).join("");
}

export function briefPdf(brief: BriefRevision): Uint8Array<ArrayBuffer> {
  // All PDF syntax and escaped streams are ASCII, so string offsets are byte offsets.
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const pages: string[] = [];
  let stream = "";
  let y = 744;

  function line(text: string, size: number, font: number) {
    stream += `BT /F${font} ${size} Tf 1 0 0 1 48 ${y} Tm (${pdfString(text)}) Tj ET\n`;
    y -= size + 4;
  }

  function finishPage() {
    const streamId = objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const pageId = objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);
    pages.push(`${pageId} 0 R`);
    stream = "";
    y = 744;
  }

  line(briefTitle, 21, 2);
  for (const [heading, value] of briefSections(brief)) {
    if (y < 84) finishPage();
    y -= 7;
    line(heading, 13, 2);
    for (const paragraph of value.replace(/\t/g, "    ").split("\n")) {
      let remaining = paragraph;
      do {
        if (y < 52) finishPage();
        const space = remaining.lastIndexOf(" ", 84);
        const end = remaining.length <= 84 ? remaining.length : space > 0 ? space : 84;
        line(remaining.slice(0, end), 10, 1);
        remaining = remaining.slice(end).replace(/^ /, "");
      } while (remaining);
    }
  }
  finishPage();
  objects[1] = `<< /Type /Pages /Kids [${pages.join(" ")}] /Count ${pages.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset.toString().padStart(10, "0") + " 00000 n \n";
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
