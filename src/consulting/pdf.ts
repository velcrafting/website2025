import PDFDocument from "pdfkit";
import { create, type Font } from "fontkit";
import { briefSections, briefTitle, type BriefRevision } from "./brief";

export const briefPdfFontFiles = {
  standard: "NotoSans-Regular.ttf",
  devanagari: "NotoSansDevanagari-Regular.ttf",
  japanese: "NotoSansJP-Regular.otf",
} as const;

export type BriefPdfFont = keyof typeof briefPdfFontFiles;
export type BriefPdfFonts = (name: BriefPdfFont) => Promise<Uint8Array>;

type Run = { font: BriefPdfFont; text: string };
type Word = Run[];

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const words = new Intl.Segmenter("en", { granularity: "word" });
const devanagari = /\p{Script_Extensions=Devanagari}/u;
const japanese = /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]/u;
const unsafeDirection = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Bidi_Control}]/u;
const unsupported = "PDF export cannot render every character in this revision. Download Markdown or copy the brief to preserve the original text.";
const show = (value: string) => value.replace(/\t/g, "    ");
const margin = 48;

function append(runs: Run[], run: Run) {
  const last = runs.at(-1);
  if (last?.font === run.font) last.text += run.text;
  else runs.push({ ...run });
}

async function layout(brief: BriefRevision, loadFont: BriefPdfFonts) {
  const fonts = new Map<BriefPdfFont, { bytes: Uint8Array; face: Font }>();
  async function getFont(name: BriefPdfFont) {
    const cached = fonts.get(name);
    if (cached) return cached;
    const bytes = await loadFont(name);
    // Fontkit accepts Uint8Array in both environments. Its types still require Buffer.
    const face = create(bytes as Buffer);
    if (!("hasGlyphForCodePoint" in face)) throw new Error("Unexpected PDF font file.");
    const font = { bytes, face };
    fonts.set(name, font);
    return font;
  }
  const primary = await getFont("standard");
  const sections: { heading: string; paragraphs: Word[][] }[] = [];
  for (const [heading, value] of briefSections(brief)) {
    const paragraphs: Word[][] = [];
    for (const paragraph of value.split("\n")) {
      const row: Word[] = [];
      for (const { segment: word } of words.segment(paragraph)) {
        const runs: Run[] = [];
        for (const { segment } of graphemes.segment(word)) {
          if (unsafeDirection.test(segment)) throw new Error(unsupported);
          const codePoints = Array.from(show(segment), (char) => char.codePointAt(0)!);
          const covers = (font: Font) => codePoints.every((code) => font.hasGlyphForCodePoint(code));
          let name: BriefPdfFont = "standard";
          if (!covers(primary.face)) {
            // A glyph in a font does not imply usable shaping. Support tested LTR scripts only.
            if (devanagari.test(segment)) name = "devanagari";
            else if (japanese.test(segment)) name = "japanese";
            else throw new Error(unsupported);
            if (!covers((await getFont(name)).face)) throw new Error(unsupported);
          }
          append(runs, { font: name, text: segment });
        }
        row.push(runs);
      }
      paragraphs.push(row);
    }
    sections.push({ heading, paragraphs });
  }
  return { fonts, sections };
}

export async function briefPdf(brief: BriefRevision, loadFont: BriefPdfFonts): Promise<Uint8Array<ArrayBuffer>> {
  const { fonts, sections } = await layout(brief, loadFont);
  const date = new Date(brief.revisedAt);
  const doc = new PDFDocument({
    size: "LETTER",
    pdfVersion: "1.7",
    margins: { top: margin, right: margin, bottom: margin, left: margin },
    font: "",
    autoFirstPage: false,
    tagged: true,
    lang: "en-US",
    displayTitle: true,
    info: { Title: briefTitle, CreationDate: date, ModDate: date },
  });
  for (const [name, { bytes }] of fonts) doc.registerFont(name, bytes);
  doc.font("standard").addPage();
  const structure = doc.struct("Document");
  doc.addStructure(structure);
  const output = new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => {
      const buffer = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(buffer);
    });
  });
  const width = doc.page.width - margin * 2;
  let y = margin;
  function ensureSpace(height: number) {
    if (y + height <= doc.page.height - margin) return;
    doc.continueOnNewPage();
    y = margin;
  }
  function heading(level: "H1" | "H2", text: string, size: number) {
    structure.add(doc.struct(level, {}, () => {
      doc.font("standard").fontSize(size).fillColor("#253a2c").text(text, margin, y, { lineBreak: false });
    }));
    y += size + 6;
  }
  function runWidth(run: Run) {
    return doc.font(run.font).fontSize(11).widthOfString(show(run.text));
  }
  function renderLine(runs: Run[]) {
    ensureSpace(17);
    let x = margin;
    if (runs.length) {
      // Supply logical text for text extraction when OpenType reorders or substitutes glyphs.
      doc.markContent("Span", { actual: runs.map((run) => run.text).join("") });
      for (const run of runs) {
        const advance = runWidth(run);
        doc.fillColor("#242824").text(show(run.text), x, y + 12, { lineBreak: false, baseline: "alphabetic" });
        x += advance;
      }
      doc.endMarkedContent();
    }
    y += 17;
  }
  function paragraph(row: Word[]) {
    let line: Run[] = [];
    function place(runs: Run[]) {
      const next = line.map((run) => ({ ...run }));
      for (const run of runs) append(next, run);
      if (next.reduce((sum, run) => sum + runWidth(run), 0) > width) return false;
      line = next;
      return true;
    }
    function flush() {
      renderLine(line);
      line = [];
    }
    for (const word of row) {
      if (place(word)) continue;
      if (line.length) flush();
      if (place(word)) continue;
      for (const run of word) {
        for (const { segment } of graphemes.segment(run.text)) {
          const piece = [{ font: run.font, text: segment }];
          if (place(piece)) continue;
          flush();
          if (!place(piece)) throw new Error(unsupported);
        }
      }
    }
    flush();
  }

  heading("H1", briefTitle, 24);
  for (const section of sections) {
    ensureSpace(45);
    y += 8;
    heading("H2", section.heading, 13);
    for (const row of section.paragraphs) {
      if (row.length) structure.add(doc.struct("P", {}, () => paragraph(row)));
      else renderLine([]);
    }
  }
  structure.end();
  doc.end();
  return output;
}
